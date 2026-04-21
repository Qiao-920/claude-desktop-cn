const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { autoUpdater } = require('electron-updater');
// Load build-time secrets before requiring bridge-server so they're available on process.env.
// secrets.json is gitignored — populated by CI at build time from GitHub Actions secrets.
// In dev just export the env vars in your shell (or put them in this file locally).
try {
    const secretsPath = path.join(__dirname, 'secrets.json');
    if (fs.existsSync(secretsPath)) {
        const raw = fs.readFileSync(secretsPath, 'utf8').replace(/^\uFEFF/, '');
        const s = JSON.parse(raw);
        for (const [k, v] of Object.entries(s)) {
            if (!process.env[k]) process.env[k] = String(v);
        }
    }
} catch (_) {}

const { initServer, enableNodeModeForChildProcesses } = require('./bridge-server.cjs');

// Fix Chinese garbled text in Windows console by switching to UTF-8 code page
if (process.platform === 'win32') {
    try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch (_) {}
    process.stdout.setEncoding?.('utf8');
    process.stderr.setEncoding?.('utf8');
}

// Squirrel startup handler removed — using NSIS installer, not Squirrel

let mainWindow;

const isDev = process.env.NODE_ENV === 'development';

function spawnDetached(command, args, options = {}) {
    try {
        const child = require('child_process').spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            ...options,
        });
        child.unref();
        return true;
    } catch (_) {
        return false;
    }
}

function firstExistingPath(candidates) {
    return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

function findPyCharmExe() {
    const directCandidates = [
        path.join(process.env['ProgramFiles'] || '', 'JetBrains', 'PyCharm Community Edition 2025.1', 'bin', 'pycharm64.exe'),
        path.join(process.env['ProgramFiles'] || '', 'JetBrains', 'PyCharm Community Edition 2024.3', 'bin', 'pycharm64.exe'),
        path.join(process.env['ProgramFiles'] || '', 'JetBrains', 'PyCharm 2025.1', 'bin', 'pycharm64.exe'),
        path.join(process.env['ProgramFiles'] || '', 'JetBrains', 'PyCharm 2024.3', 'bin', 'pycharm64.exe'),
        path.join(process.env['LocalAppData'] || '', 'Programs', 'PyCharm Community', 'bin', 'pycharm64.exe'),
    ];
    const direct = firstExistingPath(directCandidates);
    if (direct) return direct;

    const toolboxRoot = path.join(process.env['LocalAppData'] || '', 'JetBrains', 'Toolbox', 'apps', 'PyCharm-C');
    if (!fs.existsSync(toolboxRoot)) return null;
    try {
        const channels = fs.readdirSync(toolboxRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
        for (const channel of channels) {
            const channelPath = path.join(toolboxRoot, channel);
            const versions = fs.readdirSync(channelPath, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name)
                .sort()
                .reverse();
            for (const version of versions) {
                const exe = path.join(channelPath, version, 'bin', 'pycharm64.exe');
                if (fs.existsSync(exe)) return exe;
            }
        }
    } catch (_) {}
    return null;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1150,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        // Platform-specific window chrome
        ...(process.platform === 'darwin'
            ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } }
            : {
                titleBarStyle: 'hidden',
                titleBarOverlay: {
                    color: '#00000000',
                    symbolColor: '#808080',
                    height: 44
                }
            }),
        icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'favicon.ico' : 'favicon.png'),
        backgroundColor: '#F8F8F6',
        show: false, // Show after ready-to-show to prevent flash
    });

    // Reset zoom to default on startup & register zoom shortcuts
    mainWindow.once('ready-to-show', () => {
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.show();
    });

    // Zoom keyboard shortcuts — Electron doesn't handle Ctrl+= (plus) by default on some layouts
    const TITLE_BAR_BASE_HEIGHT = 44;
    const applyZoom = (factor) => {
        const wc = mainWindow.webContents;
        wc.setZoomFactor(factor);
        // Keep native title bar overlay at consistent visual size regardless of zoom
        if (process.platform !== 'darwin') {
            try {
                mainWindow.setTitleBarOverlay({
                    color: '#00000000',
                    symbolColor: '#808080',
                    height: Math.round(TITLE_BAR_BASE_HEIGHT * factor),
                });
            } catch (_) {}
        }
        // Notify renderer so CSS can compensate
        wc.send('zoom-changed', factor);
    };

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (!input.control && !input.meta) return;
        const wc = mainWindow.webContents;
        const current = wc.getZoomFactor();
        if (input.key === '=' || input.key === '+') {
            event.preventDefault();
            applyZoom(Math.min(+(current + 0.1).toFixed(1), 2.0));
        } else if (input.key === '-') {
            event.preventDefault();
            applyZoom(Math.max(+(current - 0.1).toFixed(1), 0.5));
        } else if (input.key === '0') {
            event.preventDefault();
            applyZoom(1.0);
        }
    });

    if (isDev) {
        // In development, load from Vite dev server
        mainWindow.loadURL('http://localhost:3000');
    } else {
        // In production, load the built files
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
    // mainWindow.webContents.openDevTools();

    // Open all external links in the system browser, not in the app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        // Allow hash navigation (file:// with #) and localhost dev server
        if (url.startsWith('file://') || url.startsWith('http://localhost')) return;
        event.preventDefault();
        shell.openExternal(url);
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level >= 2) {
            try { require('fs').appendFileSync(require('path').join(require('electron').app.getPath('userData'), 'frontend-error.log'), `[Frontend Error] ${message} at ${sourceId}:${line}\n`); } catch (_) {}
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // macOS: clear quarantine flags on bundled bun binary. Downloaded .dmg/.zip
    // files get Apple's com.apple.quarantine xattr, and since our bun binary is
    // unsigned, Gatekeeper silently blocks execution — the engine subprocess just
    // exits immediately with no output. This one-liner strips the flag so bun can
    // run. Safe to call every launch (no-op if already cleared or on non-Mac).
    if (process.platform === 'darwin') {
        try {
            const engineBin = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'engine', 'bin');
            require('child_process').execSync(`xattr -cr "${engineBin}" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch (_) {}
    }

    // Start Bridge Server
    const server = initServer();
    server.listen(30080, '127.0.0.1', () => {
        console.log('Bridge Server running on http://127.0.0.1:30080');
    });

    createWindow();

    // No SDK subprocess needed — using direct API calls
    enableNodeModeForChildProcesses();

    // Auto-update is disabled in this local Chinese build.
    // The upstream app checks for updates frequently and may replace local changes.
    if (!isDev && process.env.CLAUDE_DESKTOP_ENABLE_AUTO_UPDATE === '1') {
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'https://clawparrot.com/updates',
        });
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.logger = console;

        autoUpdater.on('update-available', (info) => {
            console.log('[Update] New version available:', info.version);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', { type: 'available', version: info.version });
            }
        });

        autoUpdater.on('download-progress', (progress) => {
            if (mainWindow) {
                mainWindow.webContents.send('update-status', { type: 'progress', percent: Math.round(progress.percent) });
            }
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log('[Update] Downloaded:', info.version);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', { type: 'downloaded', version: info.version });
            }
            // Don't auto-quit — let the user click "Relaunch" in the UI.
            // On Mac, quitAndInstall's isForceRunAfter param is ignored,
            // so we use app.relaunch() + app.exit() to ensure the app restarts.
        });

        autoUpdater.on('error', (err) => {
            console.error('[Update] Error:', err.message);
            if (mainWindow) {
                mainWindow.webContents.send('update-status', { type: 'error', message: err.message });
            }
        });

        autoUpdater.on('update-not-available', (info) => {
            console.log('[Update] Already up-to-date:', info.version);
        });

        // Check for updates after 15 seconds (give network time to settle),
        // then every 10 minutes (more frequent for users on unstable networks)
        const doCheck = () => {
            console.log('[Update] Checking for updates...');
            autoUpdater.checkForUpdates().catch(err => {
                console.error('[Update] Check failed:', err.message);
            });
        };
        setTimeout(doCheck, 15000);
        setInterval(doCheck, 10 * 60 * 1000);
    }

    app.on('activate', () => {
        // macOS: re-create window when dock icon clicked
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers for future bridge communication
ipcMain.handle('get-app-path', () => app.getPath('userData'));
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('install-update', () => {
    // On Mac, autoUpdater.quitAndInstall() doesn't reliably relaunch the app.
    // Use app.relaunch() + app.exit() to ensure the app restarts on all platforms.
    if (process.platform === 'darwin') {
        app.relaunch();
        app.exit(0);
    } else {
        autoUpdater.quitAndInstall(true, true);
    }
});
ipcMain.handle('open-external', (_, url) => { const { shell } = require('electron'); shell.openExternal(url); });
ipcMain.handle('resize-window', (_, width, height) => {
    if (mainWindow) {
        mainWindow.setSize(width, height);
        mainWindow.center();
    }
});

// Open the folder containing the given file path in system explorer
// Returns true if opened, false if file/folder not found
const recentlyOpenedFolders = new Map(); // path → timestamp, prevents duplicate opens
ipcMain.handle('show-item-in-folder', (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return false;
    // Deduplicate: ignore if same folder was opened within last 2 seconds
    const folder = path.dirname(filePath);
    const now = Date.now();
    const lastOpened = recentlyOpenedFolders.get(folder);
    if (lastOpened && now - lastOpened < 2000) return true;
    recentlyOpenedFolders.set(folder, now);
    // Cleanup old entries
    for (const [k, v] of recentlyOpenedFolders) {
        if (now - v > 5000) recentlyOpenedFolders.delete(k);
    }
    shell.showItemInFolder(filePath);
    return true;
});

// Open a folder directly in system explorer
const recentlyOpenedDirs = new Map();
ipcMain.handle('open-folder', (event, folderPath) => {
    if (!folderPath || !fs.existsSync(folderPath)) return false;
    const now = Date.now();
    const lastOpened = recentlyOpenedDirs.get(folderPath);
    if (lastOpened && now - lastOpened < 2000) return true;
    recentlyOpenedDirs.set(folderPath, now);
    for (const [k, v] of recentlyOpenedDirs) {
        if (now - v > 5000) recentlyOpenedDirs.delete(k);
    }
    shell.openPath(folderPath);
    return true;
});

ipcMain.handle('open-path-with-target', async (event, targetPath, target) => {
    if (!targetPath || !fs.existsSync(targetPath)) {
        return { ok: false, error: 'Path not found' };
    }

    const normalizedTarget = String(target || 'default').toLowerCase();
    const resolvedPath = path.resolve(targetPath);

    if (normalizedTarget === 'explorer' || normalizedTarget === 'default') {
        await shell.openPath(resolvedPath);
        return { ok: true };
    }

    if (normalizedTarget === 'vscode') {
        const codeExe = firstExistingPath([
            path.join(process.env['LocalAppData'] || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
            path.join(process.env['ProgramFiles'] || '', 'Microsoft VS Code', 'Code.exe'),
            path.join(process.env['LocalAppData'] || '', 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
        ]);
        const opened = codeExe
            ? spawnDetached(codeExe, ['-n', resolvedPath], { cwd: path.dirname(resolvedPath) })
            : spawnDetached('code', ['-n', resolvedPath], { cwd: path.dirname(resolvedPath) });
        if (opened) return { ok: true };
        await shell.openPath(resolvedPath);
        return { ok: false, fallback: 'explorer' };
    }

    if (normalizedTarget === 'git-bash') {
        const gitBash = firstExistingPath([
            path.join(process.env['ProgramFiles'] || '', 'Git', 'git-bash.exe'),
            path.join(process.env['ProgramW6432'] || '', 'Git', 'git-bash.exe'),
            path.join(process.env['LocalAppData'] || '', 'Programs', 'Git', 'git-bash.exe'),
        ]);
        if (gitBash && spawnDetached(gitBash, [`--cd=${resolvedPath}`], { cwd: resolvedPath })) {
            return { ok: true };
        }
        await shell.openPath(resolvedPath);
        return { ok: false, fallback: 'explorer' };
    }

    if (normalizedTarget === 'pycharm') {
        const pycharmExe = findPyCharmExe();
        if (pycharmExe && spawnDetached(pycharmExe, [resolvedPath], { cwd: path.dirname(resolvedPath) })) {
            return { ok: true };
        }
        await shell.openPath(resolvedPath);
        return { ok: false, fallback: 'explorer' };
    }

    await shell.openPath(resolvedPath);
    return { ok: true, fallback: 'explorer' };
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('export-workspace', async (event, workspaceId, contextMarkdown, defaultFilename) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '导出模型对话工作空间',
            defaultPath: defaultFilename,
            filters: [
                { name: 'Zip Archives', extensions: ['zip'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, reason: 'canceled' };
        }

        const zipDest = result.filePath;
        const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);

        // 确保对应的 workspace 目录存在 (即使之前因为没有发生过相关文件操作而没创建)
        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }

        // 把前段归集的完整文本上下文放进去一起归档
        fs.writeFileSync(path.join(workspacePath, 'chat_context.md'), contextMarkdown || '', 'utf-8');

        // 执行异步 zip 打包保存
        return await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipDest);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            output.on('close', () => {
                resolve({ success: true, path: zipDest, size: archive.pointer() });
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);

            // 将整个文件夹里的所有文件平摊塞入这个压缩包里 (不用多套一层文件夹壳)
            archive.directory(workspacePath, false);

            archive.finalize();
        });
    } catch (err) {
        console.error("Export Workspace Failed:", err);
        throw err;
    }
});
