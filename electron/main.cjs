const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { autoUpdater } = require('electron-updater');
// Load build-time secrets before requiring bridge-server so they're available on process.env.
// secrets.json is gitignored 鈥?populated by CI at build time from GitHub Actions secrets.
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

// Squirrel startup handler removed 鈥?using NSIS installer, not Squirrel

let mainWindow;
let tray = null;
let isQuitting = false;
let hasShownTrayHint = false;

const isDev = process.env.NODE_ENV === 'development';
const isWindows = process.platform === 'win32';
let lastRendererRecoveryAt = 0;

function appendMainLog(scope, message) {
    try {
        const line = `[${new Date().toISOString()}] [${scope}] ${message}\n`;
        fs.appendFileSync(path.join(app.getPath('userData'), 'main-process.log'), line, 'utf8');
    } catch (_) {}
}

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

function sanitizePreviewName(name) {
    const fallback = 'artifact-preview.html';
    const base = String(name || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    const withExt = /\.html?$/i.test(base) ? base : `${base || 'artifact-preview'}.html`;
    return withExt || fallback;
}

function getPublicIconPath(fileName) {
    return path.join(__dirname, '..', 'public', fileName);
}

function getDistIconPath(fileName) {
    return path.join(__dirname, '..', 'dist', fileName);
}

function getPackagedIconPath(fileName) {
    return path.join(process.resourcesPath, 'assets', fileName);
}

function getRuntimeIconPath(fileName) {
    return firstExistingPath([
        app.isPackaged ? getPackagedIconPath(fileName) : null,
        getDistIconPath(fileName),
        getPublicIconPath(fileName),
    ]);
}

function getWindowIconPath() {
    return firstExistingPath([
        process.platform === 'win32' ? getRuntimeIconPath('favicon.ico') : null,
        getRuntimeIconPath('favicon.png'),
    ]);
}

function getTrayIcon() {
    const trayIcoPath = getRuntimeIconPath('favicon.ico');
    const trayPngPath = getRuntimeIconPath('favicon.png');

    if (trayPngPath && fs.existsSync(trayPngPath)) {
        const baseIcon = nativeImage.createFromPath(trayPngPath);
        if (!baseIcon.isEmpty()) {
            const scaleFactor = Math.max(1, Math.round(screen.getPrimaryDisplay?.().scaleFactor || 1));
            const size = process.platform === 'darwin' ? 18 : 16 * scaleFactor;
            const resized = baseIcon.resize({ width: size, height: size, quality: 'best' });
            appendMainLog('tray-icon', `using png icon ${trayPngPath} (${size}x${size})`);
            return resized;
        }
    }

    if (process.platform === 'win32' && trayIcoPath && fs.existsSync(trayIcoPath)) {
        appendMainLog('tray-icon', `using ico fallback ${trayIcoPath}`);
        return trayIcoPath;
    }

    const fallbackPath = getWindowIconPath();
    if (fallbackPath && fs.existsSync(fallbackPath)) {
        appendMainLog('tray-icon', `using window icon fallback ${fallbackPath}`);
        return fallbackPath;
    }

    appendMainLog('tray-icon', 'no icon available, using empty native image');
    return nativeImage.createEmpty();
}

function showMainWindow() {
    if (!mainWindow) {
        createWindow();
        return;
    }
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
    mainWindow.focus();
}

function createTray() {
    if (tray) return;
    const trayIcon = getTrayIcon();
    tray = new Tray(trayIcon);
    tray.setImage(trayIcon);
    tray.setToolTip('Claude Desktop CN');

    const refreshTrayMenu = () => {
        const visible = !!mainWindow && mainWindow.isVisible();
        const template = [
            {
                label: visible ? '隐藏窗口' : '显示窗口',
                click: () => {
                    if (!mainWindow) {
                        createWindow();
                        return;
                    }
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        showMainWindow();
                    }
                },
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => {
                    isQuitting = true;
                    app.quit();
                },
            },
        ];
        tray.setContextMenu(Menu.buildFromTemplate(template));
    };

    tray.on('click', () => {
        if (!mainWindow || !mainWindow.isVisible()) {
            showMainWindow();
        } else {
            mainWindow.focus();
        }
        refreshTrayMenu();
    });

    tray.on('double-click', () => {
        showMainWindow();
        refreshTrayMenu();
    });

    refreshTrayMenu();
}

function createWindow() {
    let startupWatchdog = null;
    let attemptedStartupReload = false;

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
        icon: getWindowIconPath(),
        backgroundColor: '#1f1f1d',
        show: false, // Show after ready-to-show to prevent flash
    });

    // Reset zoom to default on startup & register zoom shortcuts
    mainWindow.once('ready-to-show', () => {
        if (startupWatchdog) {
            clearTimeout(startupWatchdog);
            startupWatchdog = null;
        }
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.show();
        appendMainLog('window', 'ready-to-show');
    });

    // Zoom keyboard shortcuts 鈥?Electron doesn't handle Ctrl+= (plus) by default on some layouts
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

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        appendMainLog('did-fail-load', `${errorCode} ${errorDescription} ${validatedURL || ''}`.trim());
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (startupWatchdog) {
            clearTimeout(startupWatchdog);
            startupWatchdog = null;
        }
        appendMainLog('did-finish-load', 'renderer finished loading');
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
        appendMainLog('render-process-gone', JSON.stringify(details || {}));
        const now = Date.now();
        if (now - lastRendererRecoveryAt < 10000) return;
        lastRendererRecoveryAt = now;
        setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            try {
                if (isDev) {
                    mainWindow.loadURL('http://localhost:3000');
                } else {
                    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
                }
            } catch (error) {
                appendMainLog('render-process-reload-failed', error?.message || String(error));
            }
        }, 1200);
    });

    mainWindow.on('unresponsive', () => {
        appendMainLog('window-unresponsive', 'BrowserWindow became unresponsive');
    });

    startupWatchdog = setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (attemptedStartupReload) return;
        attemptedStartupReload = true;
        appendMainLog('startup-watchdog', 'window did not become ready in time, forcing reload');
        try {
            mainWindow.webContents.reloadIgnoringCache();
        } catch (error) {
            appendMainLog('startup-watchdog-failed', error?.message || String(error));
        }
    }, 12000);

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

    if (process.platform === 'win32' || process.platform === 'linux') {
        mainWindow.on('close', (event) => {
            if (isQuitting) return;
            event.preventDefault();
            mainWindow.hide();
            if (tray) {
                const visible = mainWindow.isVisible();
                const template = [
                    {
                        label: visible ? '隐藏窗口' : '显示窗口',
                        click: () => {
                            if (!mainWindow || !mainWindow.isVisible()) {
                                showMainWindow();
                            } else {
                                mainWindow.hide();
                            }
                        },
                    },
                    { type: 'separator' },
                    {
                        label: '退出',
                        click: () => {
                            isQuitting = true;
                            app.quit();
                        },
                    },
                ];
                tray.setContextMenu(Menu.buildFromTemplate(template));
                if (!hasShownTrayHint && process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
                    tray.displayBalloon({
                        title: 'Claude Desktop CN',
                        content: '已最小化到系统托盘，右键托盘图标可以退出应用。',
                        iconType: 'info',
                    });
                    hasShownTrayHint = true;
                }
            }
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

if (isWindows) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
}

app.whenReady().then(() => {
    app.setAppUserModelId('com.claude.desktop.cn');
    // macOS: clear quarantine flags on bundled bun binary. Downloaded .dmg/.zip
    // files get Apple's com.apple.quarantine xattr, and since our bun binary is
    // unsigned, Gatekeeper silently blocks execution 鈥?the engine subprocess just
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

    createTray();
    createWindow();

    // No SDK subprocess needed 鈥?using direct API calls
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
            // Don't auto-quit 鈥?let the user click "Relaunch" in the UI.
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
            return;
        }
        showMainWindow();
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (!tray) app.quit();
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
const recentlyOpenedFolders = new Map(); // path 鈫?timestamp, prevents duplicate opens
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

ipcMain.handle('open-preview-html', async (event, html, suggestedName) => {
    try {
        if (typeof html !== 'string' || !html.trim()) {
            return { ok: false, error: 'Missing preview html' };
        }
        const os = require('os');
        const previewDir = path.join(os.tmpdir(), 'claude-desktop-cn-previews');
        fs.mkdirSync(previewDir, { recursive: true });
        const previewName = `${Date.now()}-${sanitizePreviewName(suggestedName)}`;
        const previewPath = path.join(previewDir, previewName);
        fs.writeFileSync(previewPath, html, 'utf8');
        await shell.openPath(previewPath);
        return { ok: true, path: previewPath };
    } catch (error) {
        return { ok: false, error: error?.message || 'Failed to open preview html' };
    }
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
            title: '瀵煎嚭妯″瀷瀵硅瘽宸ヤ綔绌洪棿',
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

        // 纭繚瀵瑰簲鐨?workspace 鐩綍瀛樺湪 (鍗充娇涔嬪墠鍥犱负娌℃湁鍙戠敓杩囩浉鍏虫枃浠舵搷浣滆€屾病鍒涘缓)
        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }

        // 鎶婂墠娈靛綊闆嗙殑瀹屾暣鏂囨湰涓婁笅鏂囨斁杩涘幓涓€璧峰綊妗?
        fs.writeFileSync(path.join(workspacePath, 'chat_context.md'), contextMarkdown || '', 'utf-8');

        // 鎵ц寮傛 zip 鎵撳寘淇濆瓨
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

            // 灏嗘暣涓枃浠跺す閲岀殑鎵€鏈夋枃浠跺钩鎽婂鍏ヨ繖涓帇缂╁寘閲?(涓嶇敤澶氬涓€灞傛枃浠跺す澹?
            archive.directory(workspacePath, false);

            archive.finalize();
        });
    } catch (err) {
        console.error("Export Workspace Failed:", err);
        throw err;
    }
});


