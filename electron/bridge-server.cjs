const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { app } = require('electron');
const { TOOL_DEFINITIONS, executeTool } = require('./tools.cjs');

// No longer needed — SDK removed, using direct API calls
function enableNodeModeForChildProcesses() {
    console.log('[Engine] Direct API mode — no SDK subprocess needed');
}

// Load custom system prompt (only affects this Electron app, not external CLI usage)
const CUSTOM_SYSTEM_PROMPT_PATH = path.join(__dirname, 'system-prompt.txt');
let customSystemPrompt = '';
try {
    if (fs.existsSync(CUSTOM_SYSTEM_PROMPT_PATH)) {
        customSystemPrompt = fs.readFileSync(CUSTOM_SYSTEM_PROMPT_PATH, 'utf8');
        console.log(`[System Prompt] Loaded custom prompt (${customSystemPrompt.length} chars) from ${CUSTOM_SYSTEM_PROMPT_PATH}`);
    } else {
        console.warn('[System Prompt] Custom prompt file not found at:', CUSTOM_SYSTEM_PROMPT_PATH);
    }
} catch (e) {
    console.error('[System Prompt] Failed to load:', e.message);
}

function initServer(mainWindow) {
    const server = express();
    server.use(cors());
    server.use(express.json());

    // Track active engine child processes per conversation (for stdin writes like AskUserQuestion)
    const activeChildren = new Map();

    // Per-conversation stream state: buffer events so frontend can reconnect mid-stream
    // Key: conversationId, Value: { events: [], listeners: Set<res>, done: boolean }
    const activeStreams = new Map();

    function broadcastSSE(conversationId, event) {
        const stream = activeStreams.get(conversationId);
        if (!stream) return;
        stream.events.push(event);
        const line = 'data: ' + JSON.stringify(event) + '\n\n';
        var arr = Array.from(stream.listeners);
        for (var i = 0; i < arr.length; i++) {
            try { arr[i].write(line); } catch (_) { stream.listeners.delete(arr[i]); }
        }
    }

    function endStream(conversationId) {
        const stream = activeStreams.get(conversationId);
        if (!stream) return;
        stream.done = true;
        // End the primary POST response
        if (stream.primaryRes) {
            try { stream.primaryRes.write('data: [DONE]\n\n'); stream.primaryRes.end(); } catch (_) {}
            stream.primaryRes = null;
        }
        // End all reconnect listeners
        for (const r of stream.listeners) {
            try { r.write('data: [DONE]\n\n'); r.end(); } catch (_) {}
        }
        stream.listeners.clear();
        // Keep buffer for 30s so frontend can still reconnect after slight delay
        setTimeout(() => { if (activeStreams.get(conversationId) === stream) activeStreams.delete(conversationId); }, 30000);
    }

    // Setup paths
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'claude-desktop.json');
    const workspacesDir = path.join(userDataPath, 'workspaces');

    if (!fs.existsSync(workspacesDir)) {
        fs.mkdirSync(workspacesDir, { recursive: true });
    }

    // Initialize DB
    let db = { conversations: [], messages: [], projects: [], project_files: [] };
    if (fs.existsSync(dbPath)) {
        try {
            const loaded = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            db = { ...db, ...loaded };
            // Ensure new arrays exist for older DB files
            if (!db.projects) db.projects = [];
            if (!db.project_files) db.project_files = [];
        } catch (e) { }
    }
    const saveDb = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

    async function generateTitleAsync(conversationId, userMsg, assistantMsg, token, baseUrl, activeModel) {
        if (!token) { console.log('[Title] Skipped: no API token'); return; }
        try {
            const bConv = db.conversations.find(c => c.id === conversationId);
            if (!bConv || (bConv.title !== 'New Conversation' && bConv.title !== 'New Chat')) return;

            // Strip -thinking suffix — raw API doesn't accept it
            let modelId = (activeModel || 'claude-sonnet-4-6').replace(/-thinking$/, '');

            // Build endpoint: handle base URLs that already contain /v1
            let endpoint;
            if (baseUrl) {
                const clean = baseUrl.replace(/\/+$/, '');
                endpoint = clean.endsWith('/v1') ? `${clean}/messages` : `${clean}/v1/messages`;
            } else {
                endpoint = 'https://api.anthropic.com/v1/messages';
            }

            console.log(`[Title] Generating for ${conversationId} via ${endpoint} model=${modelId}`);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': token,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: modelId,
                    max_tokens: 50,
                    system: 'You are a title generator. Respond only with the title, without any quotes or explanations. Maximum 5-7 words.',
                    messages: [
                        { role: 'user', content: `请根据这段对话生成一个简短的标题（最多5-7个字，不要用引号），概括对话的主题：\n\n用户：${userMsg}\n助手：${assistantMsg}\n\n标题：` }
                    ]
                })
            });
            if (response.ok) {
                const data = await response.json();
                let title = null;
                if (data.content && Array.isArray(data.content)) {
                    const textBlock = data.content.find(b => b.type === 'text' && b.text);
                    if (textBlock && textBlock.text) {
                        title = textBlock.text.replace(/^["']|["']$/g, '').trim();
                    }
                }
                if (title) {
                    bConv.title = title;
                    saveDb();
                    console.log(`[Title] Success: "${title}"`);
                } else {
                    console.error('[Title] No text in response:', JSON.stringify(data));
                }
            } else {
                console.error('[Title] HTTP Error:', response.status, endpoint, await response.text());
            }
        } catch (e) {
            console.error('[Title] Exception:', e.message || e);
        }
    }

    // ═══════════════════ Projects ═══════════════════

    server.get('/api/projects', (req, res) => {
        const list = [...db.projects]
            .filter(p => !p.is_archived)
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
        // Attach counts
        const result = list.map(p => ({
            ...p,
            file_count: db.project_files.filter(f => f.project_id === p.id).length,
            chat_count: db.conversations.filter(c => c.project_id === p.id).length,
        }));
        res.json(result);
    });

    server.post('/api/projects', (req, res) => {
        const id = uuidv4();
        const { name, description = '' } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

        const projectDir = path.join(workspacesDir, `project-${id}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        const project = {
            id, name: name.trim(), description: description.trim(),
            instructions: '', workspace_path: projectDir,
            is_archived: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        db.projects.push(project);
        saveDb();
        res.json(project);
    });

    server.get('/api/projects/:id', (req, res) => {
        const project = db.projects.find(p => p.id === req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const files = db.project_files.filter(f => f.project_id === project.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const conversations = db.conversations.filter(c => c.project_id === project.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({ ...project, files, conversations });
    });

    server.patch('/api/projects/:id', (req, res) => {
        const project = db.projects.find(p => p.id === req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        if (req.body.name !== undefined) project.name = req.body.name.trim();
        if (req.body.description !== undefined) project.description = req.body.description;
        if (req.body.instructions !== undefined) project.instructions = req.body.instructions;
        if (req.body.is_archived !== undefined) project.is_archived = req.body.is_archived;
        project.updated_at = new Date().toISOString();

        saveDb();
        res.json(project);
    });

    server.delete('/api/projects/:id', (req, res) => {
        const pid = req.params.id;
        // Delete project files from disk
        const files = db.project_files.filter(f => f.project_id === pid);
        for (const f of files) {
            if (f.file_path && fs.existsSync(f.file_path)) {
                try { fs.unlinkSync(f.file_path); } catch (_) {}
            }
        }
        db.project_files = db.project_files.filter(f => f.project_id !== pid);

        // Delete project conversations + messages + workspaces
        const convIds = db.conversations.filter(c => c.project_id === pid).map(c => c.id);
        db.messages = db.messages.filter(m => !convIds.includes(m.conversation_id));
        db.conversations = db.conversations.filter(c => c.project_id !== pid);
        for (const cid of convIds) {
            const wsPath = path.join(workspacesDir, cid);
            if (fs.existsSync(wsPath)) try { fs.rmSync(wsPath, { recursive: true, force: true }); } catch (_) {}
        }

        // Delete project dir
        const projectDir = path.join(workspacesDir, `project-${pid}`);
        if (fs.existsSync(projectDir)) try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch (_) {}

        db.projects = db.projects.filter(p => p.id !== pid);
        saveDb();
        res.json({ success: true });
    });

    // ═══ Project file upload ═══
    const projectUploadStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const project = db.projects.find(p => p.id === req.params.id);
            const dir = project ? path.join(project.workspace_path, 'files') : path.join(workspacesDir, 'temp');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
    });
    const projectUpload = multer({ storage: projectUploadStorage });

    server.post('/api/projects/:id/files', projectUpload.single('file'), (req, res) => {
        const project = db.projects.find(p => p.id === req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!req.file) return res.status(400).json({ error: 'No file' });

        // Extract text for known text formats
        let extractedText = '';
        const textExts = ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv', '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.lua', '.r'];
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (textExts.includes(ext)) {
            try { extractedText = fs.readFileSync(req.file.path, 'utf8'); } catch (_) {}
        }

        const fileEntry = {
            id: uuidv4(),
            project_id: project.id,
            file_name: req.file.originalname,
            file_path: req.file.path,
            file_size: req.file.size,
            mime_type: req.file.mimetype,
            extracted_text: extractedText,
            created_at: new Date().toISOString(),
        };
        db.project_files.push(fileEntry);
        project.updated_at = new Date().toISOString();
        saveDb();

        res.json({ ...fileEntry, extracted_text: undefined }); // Don't send full text back
    });

    server.delete('/api/projects/:projectId/files/:fileId', (req, res) => {
        const file = db.project_files.find(f => f.id === req.params.fileId && f.project_id === req.params.projectId);
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (file.file_path && fs.existsSync(file.file_path)) {
            try { fs.unlinkSync(file.file_path); } catch (_) {}
        }
        db.project_files = db.project_files.filter(f => f.id !== file.id);
        const project = db.projects.find(p => p.id === req.params.projectId);
        if (project) project.updated_at = new Date().toISOString();
        saveDb();
        res.json({ success: true });
    });

    // ═══ Project conversations ═══
    server.get('/api/projects/:id/conversations', (req, res) => {
        const convs = db.conversations.filter(c => c.project_id === req.params.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(convs);
    });

    server.post('/api/projects/:id/conversations', (req, res) => {
        const project = db.projects.find(p => p.id === req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const id = uuidv4();
        const { title = 'New Conversation', model = 'claude-sonnet-4-6' } = req.body;
        const workspacePath = path.join(workspacesDir, id);
        if (!fs.existsSync(workspacePath)) fs.mkdirSync(workspacePath, { recursive: true });

        // Copy project files into workspace so SDK can read them
        const projectFiles = db.project_files.filter(f => f.project_id === project.id);
        for (const pf of projectFiles) {
            if (pf.file_path && fs.existsSync(pf.file_path)) {
                try { fs.copyFileSync(pf.file_path, path.join(workspacePath, pf.file_name)); } catch (_) {}
            }
        }

        const newConv = {
            id, title, model, project_id: project.id,
            workspace_path: workspacePath, created_at: new Date().toISOString(),
        };
        db.conversations.push(newConv);
        project.updated_at = new Date().toISOString();
        saveDb();
        res.json(newConv);
    });

    // ═══════════════════ Conversations ═══════════════════

    server.get('/api/conversations', (req, res) => {
        // Filter: only return non-project conversations (project convs accessed via /projects/:id/conversations)
        const projectId = req.query.project_id;
        let list;
        if (projectId) {
            list = db.conversations.filter(c => c.project_id === projectId);
        } else {
            list = db.conversations.filter(c => !c.project_id);
        }
        list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(list);
    });

    server.post('/api/conversations', (req, res) => {
        const id = uuidv4();
        const { title = 'New Conversation', model = 'claude-3-5-sonnet', project_id } = req.body;
        const workspacePath = path.join(workspacesDir, id);

        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }

        // If creating under a project, copy project files into workspace
        if (project_id) {
            const project = db.projects.find(p => p.id === project_id);
            if (project) {
                const projectFiles = db.project_files.filter(f => f.project_id === project_id);
                for (const pf of projectFiles) {
                    if (pf.file_path && fs.existsSync(pf.file_path)) {
                        try { fs.copyFileSync(pf.file_path, path.join(workspacePath, pf.file_name)); } catch (_) {}
                    }
                }
            }
        }

        const newConv = {
            id, title, model, workspace_path: workspacePath, created_at: new Date().toISOString(),
            ...(project_id ? { project_id } : {}),
        };
        db.conversations.push(newConv);
        saveDb();

        res.json({ id, title, model, workspace_path: workspacePath });
    });

    server.get('/api/conversations/:id', (req, res) => {
        const conv = db.conversations.find(c => c.id === req.params.id);
        if (!conv) return res.status(404).json({ error: 'Not found' });

        const messages = db.messages.filter(m => m.conversation_id === req.params.id)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const parsedMessages = messages.map(m => {
            let contentStr = '';
            try {
                const parsed = JSON.parse(m.content);
                if (Array.isArray(parsed)) {
                    contentStr = parsed.map(c => c.text || '').join('');
                } else if (typeof parsed === 'string') {
                    contentStr = parsed;
                } else {
                    contentStr = m.content;
                }
            } catch (e) {
                contentStr = m.content;
            }
            return {
                ...m,
                content: contentStr
            };
        });

        res.json({
            ...conv,
            messages: parsedMessages
        });
    });

    server.patch('/api/conversations/:id', (req, res) => {
        const conv = db.conversations.find(c => c.id === req.params.id);
        if (!conv) return res.status(404).json({ error: 'Not found' });

        if (req.body.title) conv.title = req.body.title;
        if (req.body.model && req.body.model !== conv.model) {
            conv.model = req.body.model;
            // Model changed — reset engine session so next message starts fresh with new model
            // (engine sessions are model-bound; resuming with a different model causes context loss)
            conv.claude_session_id = null;
            console.log('[Session] Reset for conv', conv.id, '(model changed to', conv.model + ')');
        }

        saveDb();
        res.json(conv);
    });

    server.delete('/api/conversations/:id', (req, res) => {
        const id = req.params.id;
        db.messages = db.messages.filter(m => m.conversation_id !== id);
        db.conversations = db.conversations.filter(c => c.id !== id);
        saveDb();
        // Also delete the workspace folder from disk
        const wsPath = path.join(workspacesDir, id);
        if (fs.existsSync(wsPath)) {
            try {
                fs.rmSync(wsPath, { recursive: true, force: true });
                console.log(`[Delete] Removed workspace: ${wsPath}`);
            } catch (e) {
                console.error(`[Delete] Failed to remove workspace: ${e.message}`);
            }
        }
        res.json({ success: true });
    });

    server.delete('/api/conversations/:id/messages/:messageId', (req, res) => {
        const { id, messageId } = req.params;
        const msgIndex = db.messages.findIndex(m => m.id === messageId && m.conversation_id === id);
        if (msgIndex === -1) return res.status(404).json({ error: 'Message not found' });

        // Remove this message and all subsequent messages in the conversation
        const targetCreatedAt = new Date(db.messages[msgIndex].created_at).getTime();
        db.messages = db.messages.filter(m => {
            if (m.conversation_id !== id) return true;
            return new Date(m.created_at).getTime() < targetCreatedAt;
        });
        // Reset engine session — old context is no longer valid
        const conv = db.conversations.find(c => c.id === id);
        if (conv) { conv.claude_session_id = null; console.log('[Session] Reset for conv', id, '(messages deleted)'); }
        saveDb();
        res.json({ success: true });
    });

    server.delete('/api/conversations/:id/messages-tail/:count', (req, res) => {
        const { id, count } = req.params;
        const numToRemove = parseInt(count, 10);
        if (isNaN(numToRemove) || numToRemove <= 0) return res.status(400).json({ error: 'Invalid count' });

        const convMsgs = db.messages.filter(m => m.conversation_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        if (convMsgs.length <= numToRemove) {
            db.messages = db.messages.filter(m => m.conversation_id !== id);
        } else {
            const cutoffTime = new Date(convMsgs[convMsgs.length - numToRemove].created_at).getTime();
            db.messages = db.messages.filter(m => {
                if (m.conversation_id !== id) return true;
                return new Date(m.created_at).getTime() < cutoffTime;
            });
        }
        // Reset engine session — old context is no longer valid
        const conv = db.conversations.find(c => c.id === id);
        if (conv) { conv.claude_session_id = null; console.log('[Session] Reset for conv', id, '(tail deleted)'); }
        saveDb();
        res.json({ success: true });
    });

    // Multer upload config
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const convId = req.headers['x-conversation-id'] || 'temp';
            const dir = path.join(workspacesDir, convId, '.uploads');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname);
        }
    });
    const upload = multer({ storage });

    server.post('/api/upload', upload.single('file'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No file' });
        // Verify file on disk has actual content
        let diskSize = 0;
        try { diskSize = fs.statSync(req.file.path).size; } catch (_) {}
        console.log(`[Upload] ${req.file.originalname} → ${req.file.path} (multer=${req.file.size}, disk=${diskSize})`);
        if (diskSize === 0) {
            // File is empty on disk — tell client to retry
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(422).json({ error: 'File upload incomplete (0 bytes on disk). Please retry.' });
        }
        res.json({
            fileId: path.basename(req.file.path),
            fileName: req.file.originalname,
            fileType: req.file.mimetype.startsWith('image') ? 'image' : 'document',
            mimeType: req.file.mimetype,
            localPath: req.file.path,
            size: diskSize
        });
    });

    // Resolve a fileId to its local path and serve the raw file
    server.get('/api/uploads/:fileId/raw', (req, res) => {
        const fileId = req.params.fileId;
        const convId = req.query.conversation_id || '';
        // Search in conversation uploads first, then all workspaces
        const searchDirs = [];
        if (convId) searchDirs.push(path.join(workspacesDir, convId, '.uploads'));
        // Also search all conversation upload dirs
        try {
            const allConvDirs = fs.readdirSync(workspacesDir);
            for (const dir of allConvDirs) {
                const uploadsDir = path.join(workspacesDir, dir, '.uploads');
                if (fs.existsSync(uploadsDir)) searchDirs.push(uploadsDir);
            }
        } catch (_) {}

        // Helper: serve file with correct mime type (avoids Express 5 sendFile Windows issues)
        const serveFile = (fp) => {
            const ext = path.extname(fp).toLowerCase();
            const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json' };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.send(fs.readFileSync(fp));
        };

        for (const dir of searchDirs) {
            const filePath = path.join(dir, fileId);
            if (fs.existsSync(filePath)) {
                return serveFile(filePath);
            }
            // Try partial match
            try {
                const files = fs.readdirSync(dir);
                const match = files.find(f => f === fileId || f.includes(fileId));
                if (match) return serveFile(path.join(dir, match));
            } catch (_) {}
        }
        res.status(404).json({ error: 'File not found' });
    });

    // Get local file path for a fileId
    server.get('/api/uploads/:fileId/path', (req, res) => {
        const fileId = req.params.fileId;
        const convId = req.query.conversation_id || '';
        const searchDirs = [];
        if (convId) searchDirs.push(path.join(workspacesDir, convId, '.uploads'));
        try {
            const allConvDirs = fs.readdirSync(workspacesDir);
            for (const dir of allConvDirs) {
                const uploadsDir = path.join(workspacesDir, dir, '.uploads');
                if (fs.existsSync(uploadsDir)) searchDirs.push(uploadsDir);
            }
        } catch (_) {}

        for (const dir of searchDirs) {
            const filePath = path.join(dir, fileId);
            if (fs.existsSync(filePath)) {
                return res.json({ localPath: filePath, folder: dir });
            }
            try {
                const files = fs.readdirSync(dir);
                const match = files.find(f => f === fileId || f.includes(fileId));
                if (match) return res.json({ localPath: path.join(dir, match), folder: dir });
            } catch (_) {}
        }
        res.status(404).json({ error: 'File not found' });
    });

    // Compact conversation — delegates to Claude Code engine's /compact command
    server.post('/api/conversations/:id/compact', async (req, res) => {
        const conv = db.conversations.find(c => c.id === req.params.id);
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        if (!conv.claude_session_id) {
            return res.status(400).json({ error: 'No engine session to compact (conversation has no history in engine)' });
        }

        const env_token = req.body.env_token;
        const env_base_url = req.body.env_base_url;
        const instruction = req.body.instruction || '';
        const apiKey = env_token || engineEnvVars.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        const baseUrl = engineEnvVars.ANTHROPIC_BASE_URL || env_base_url || process.env.ANTHROPIC_BASE_URL;
        const modelId = (conv.model || 'claude-sonnet-4-6').replace(/-thinking$/, '');

        // Count messages before compaction for reporting
        const messagesBeforeCompact = db.messages.filter(m => m.conversation_id === req.params.id).length;

        try {
            // Spawn engine CLI with /compact as the prompt — engine handles the full compaction internally
            const compactPrompt = instruction ? `/compact ${instruction}` : '/compact';
            const cliArgs = [
                '--preload', enginePreload,
                '--env-file=' + engineEnv, engineCli,
                '-p', compactPrompt,
                '--output-format', 'stream-json',
                '--verbose',
                '--permission-mode', 'bypassPermissions',
                '--model', modelId,
                '--resume', conv.claude_session_id,
            ];

            const envVars = Object.assign({}, process.env);
            if (apiKey) envVars.ANTHROPIC_API_KEY = apiKey;
            if (baseUrl) envVars.ANTHROPIC_BASE_URL = baseUrl;

            console.log('[Compact] Spawning engine /compact, session=' + conv.claude_session_id + ' model=' + modelId);

            const child = spawn(bunExePath, cliArgs, {
                cwd: conv.workspace_path, env: envVars,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            child.stdin.end();

            let compactSummary = '';
            let compactMetadata = null;
            let buf = '';

            child.stdout.on('data', (chunk) => {
                buf += chunk.toString('utf8');
                const lines = buf.split('\n');
                buf = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let evt;
                    try { evt = JSON.parse(line); } catch { continue; }

                    // Capture the compact_boundary event from engine
                    if (evt.type === 'system' && evt.subtype === 'compact_boundary') {
                        compactMetadata = evt.compact_metadata || {};
                        console.log('[Compact] Engine compact_boundary:', JSON.stringify(compactMetadata));
                    }
                    // Capture any text output (the compact summary display)
                    if (evt.type === 'assistant' && evt.message && evt.message.content) {
                        for (const block of evt.message.content) {
                            if (block.type === 'text' && block.text) {
                                compactSummary += block.text;
                            }
                        }
                    }
                    // Also capture from stream events
                    if (evt.type === 'stream_event' && evt.event) {
                        const se = evt.event;
                        if (se.type === 'content_block_delta' && se.delta && se.delta.type === 'text_delta') {
                            compactSummary += se.delta.text;
                        }
                    }
                    // Result fallback
                    if (evt.type === 'result' && evt.result && !compactSummary) {
                        compactSummary = typeof evt.result === 'string' ? evt.result : '';
                    }
                }
            });

            let stderrBuf = '';
            child.stderr.on('data', (c) => { stderrBuf += c.toString('utf8'); });

            await new Promise((resolve, reject) => {
                child.on('close', (code) => {
                    // Process remaining buffer
                    if (buf.trim()) {
                        try {
                            const e = JSON.parse(buf);
                            if (e.type === 'system' && e.subtype === 'compact_boundary') {
                                compactMetadata = e.compact_metadata || {};
                            }
                            if (!compactSummary && e.result) compactSummary = typeof e.result === 'string' ? e.result : '';
                        } catch (_) {}
                    }
                    if (code !== 0 && !compactMetadata) {
                        reject(new Error(stderrBuf || 'Engine compact failed with exit code ' + code));
                    } else {
                        resolve();
                    }
                });
                child.on('error', reject);
            });

            // Engine has compacted its internal session — keep all old messages
            // in local db for UI display, just append a compact boundary marker
            const tokensSaved = compactMetadata && compactMetadata.pre_tokens
                ? Math.round(compactMetadata.pre_tokens * 0.7)
                : Math.round(messagesBeforeCompact * 500); // rough estimate

            db.messages.push({
                id: uuidv4(),
                conversation_id: req.params.id,
                role: 'system',
                content: JSON.stringify([{ type: 'text', text: compactSummary || 'Conversation compacted.' }]),
                created_at: new Date().toISOString(),
                is_compact_boundary: true,
            });
            saveDb();

            console.log(`[Compact] Done: ${messagesBeforeCompact} messages compacted, ~${tokensSaved} tokens saved`);
            res.json({ summary: compactSummary || 'Conversation compacted.', tokensSaved, messagesCompacted: messagesBeforeCompact });
        } catch (err) {
            console.error('[Compact] Error:', err);
            res.status(500).json({ error: err.message || 'Compaction failed' });
        }
    });

    // AskUserQuestion — receive user's answer and write back to engine stdin
    server.post('/api/conversations/:id/answer', (req, res) => {
        const { request_id, tool_use_id, answers } = req.body;
        const child = activeChildren.get(req.params.id);
        if (!child) return res.status(404).json({ error: 'No active engine process' });
        if (!request_id) return res.status(400).json({ error: 'Missing request_id' });

        const controlResponse = JSON.stringify({
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: request_id,
                response: {
                    toolUseID: tool_use_id || '',
                    behavior: 'accept',
                    message: null,
                    answers: answers || {},
                }
            }
        }) + '\n';

        try {
            child.stdin.write(controlResponse);
            console.log('[AskUser] Answered request_id=' + request_id, JSON.stringify(answers || {}).slice(0, 200));
            res.json({ ok: true });
        } catch (err) {
            console.error('[AskUser] Write error:', err.message);
            res.status(500).json({ error: 'Failed to write to engine stdin' });
        }
    });

    // Stream status — check if a conversation has an active engine stream
    server.get('/api/conversations/:id/stream-status', (req, res) => {
        const stream = activeStreams.get(req.params.id);
        res.json({ active: !!(stream && !stream.done), eventCount: stream ? stream.events.length : 0 });
    });

    // Reconnect to an active stream — sends all buffered events then continues live
    server.get('/api/conversations/:id/reconnect', (req, res) => {
        const stream = activeStreams.get(req.params.id);
        if (!stream) return res.status(404).json({ error: 'No active stream' });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });

        // Send all buffered events
        for (const event of stream.events) {
            res.write('data: ' + JSON.stringify(event) + '\n\n');
        }

        if (stream.done) {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        // Add to listeners for future events
        stream.listeners.add(res);
        req.on('close', () => stream.listeners.delete(res));
    });

    // ===== Skills =====
    // Paths
    const bundledSkillsDir = path.join(__dirname, 'skills');
    const homeDir = os.homedir();
    const localSkillsDir = path.join(homeDir, '.agents', 'skills');
    const userSkillsDir = path.join(userDataPath, 'user-skills');
    const skillPrefsPath = path.join(userDataPath, 'skill-preferences.json');

    if (!fs.existsSync(userSkillsDir)) {
        fs.mkdirSync(userSkillsDir, { recursive: true });
    }

    // Load / save skill preferences (enabled/disabled per skill id)
    function loadSkillPrefs() {
        if (fs.existsSync(skillPrefsPath)) {
            try { return JSON.parse(fs.readFileSync(skillPrefsPath, 'utf8')); } catch (e) { }
        }
        return {};
    }
    function saveSkillPrefs(prefs) {
        fs.writeFileSync(skillPrefsPath, JSON.stringify(prefs, null, 2));
    }

    // Parse SKILL.md frontmatter
    function parseSkillMd(content) {
        const match = content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!match) return null;
        const fm = match[1];
        const body = match[2].trim();
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        const descMatch = fm.match(/^description:\s*(.+)$/m);
        return {
            name: nameMatch ? nameMatch[1].trim() : null,
            description: descMatch ? descMatch[1].trim() : '',
            content: body
        };
    }

    // Scan a directory for skill folders (each containing SKILL.md)
    function scanSkillsDir(dir, source) {
        const skills = [];
        if (!fs.existsSync(dir)) return skills;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const mdPath = path.join(dir, entry.name, 'SKILL.md');
                if (!fs.existsSync(mdPath)) continue;
                try {
                    const raw = fs.readFileSync(mdPath, 'utf8');
                    const parsed = parseSkillMd(raw);
                    if (!parsed) continue;
                    skills.push({
                        id: `${source}:${entry.name}`,
                        name: parsed.name || entry.name,
                        description: parsed.description,
                        content: parsed.content,
                        is_example: true,
                        source_dir: entry.name,
                        source: source,
                        user_id: null,
                        created_at: null
                    });
                } catch (e) { /* skip unreadable */ }
            }
        } catch (e) { /* dir not readable */ }
        return skills;
    }

    // Load user-created skills (stored as JSON files in userSkillsDir)
    function loadUserSkills() {
        const skills = [];
        if (!fs.existsSync(userSkillsDir)) return skills;
        try {
            const files = fs.readdirSync(userSkillsDir).filter(f => f.endsWith('.json'));
            for (const f of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(userSkillsDir, f), 'utf8'));
                    skills.push(data);
                } catch (e) { /* skip */ }
            }
        } catch (e) { }
        return skills;
    }

    // GET /api/skills — list all skills
    server.get('/api/skills', (req, res) => {
        const prefs = loadSkillPrefs();

        // 1) Bundled example skills
        const bundled = scanSkillsDir(bundledSkillsDir, 'bundled');
        // 2) Local ~/.agents/skills/
        const local = scanSkillsDir(localSkillsDir, 'local');
        // Combine examples, deduplicate by name (bundled takes priority)
        const seenNames = new Set();
        const allExamples = [];
        for (const s of bundled) {
            seenNames.add(s.name);
            allExamples.push({ ...s, enabled: prefs[s.id] !== undefined ? prefs[s.id] : false });
        }
        for (const s of local) {
            if (seenNames.has(s.name)) continue;
            seenNames.add(s.name);
            allExamples.push({ ...s, enabled: prefs[s.id] !== undefined ? prefs[s.id] : false });
        }

        // 3) User-created skills
        const userSkills = loadUserSkills().map(s => ({
            ...s,
            enabled: prefs[s.id] !== undefined ? prefs[s.id] : true
        }));

        // Strip content from list response (only return on detail)
        const stripContent = (s) => {
            const { content, ...rest } = s;
            return rest;
        };

        res.json({
            examples: allExamples.map(stripContent),
            my_skills: userSkills.map(stripContent)
        });
    });

    // GET /api/skills/:id — skill detail with content
    server.get('/api/skills/:id', (req, res) => {
        const { id } = req.params;
        const prefs = loadSkillPrefs();

        // Check bundled
        const bundled = scanSkillsDir(bundledSkillsDir, 'bundled');
        const local = scanSkillsDir(localSkillsDir, 'local');
        const allExamples = [...bundled, ...local];
        const example = allExamples.find(s => s.id === id);
        if (example) {
            return res.json({ ...example, enabled: prefs[id] !== undefined ? prefs[id] : false });
        }

        // Check user skills
        const userSkills = loadUserSkills();
        const userSkill = userSkills.find(s => s.id === id);
        if (userSkill) {
            return res.json({ ...userSkill, enabled: prefs[id] !== undefined ? prefs[id] : true });
        }

        res.status(404).json({ error: 'Skill not found' });
    });

    // POST /api/skills — create user skill
    server.post('/api/skills', (req, res) => {
        const { name, description, content } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const id = uuidv4();
        const skill = {
            id,
            name,
            description: description || '',
            content: content || '',
            is_example: false,
            source_dir: null,
            source: 'user',
            user_id: 'local',
            created_at: new Date().toISOString()
        };
        fs.writeFileSync(path.join(userSkillsDir, `${id}.json`), JSON.stringify(skill, null, 2));

        // Auto-enable
        const prefs = loadSkillPrefs();
        prefs[id] = true;
        saveSkillPrefs(prefs);

        res.json({ ...skill, enabled: true });
    });

    // PATCH /api/skills/:id — update user skill
    server.patch('/api/skills/:id', (req, res) => {
        const { id } = req.params;
        const filePath = path.join(userSkillsDir, `${id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Skill not found or not editable' });
        }
        try {
            const skill = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (req.body.name !== undefined) skill.name = req.body.name;
            if (req.body.description !== undefined) skill.description = req.body.description;
            if (req.body.content !== undefined) skill.content = req.body.content;
            skill.updated_at = new Date().toISOString();
            fs.writeFileSync(filePath, JSON.stringify(skill, null, 2));

            const prefs = loadSkillPrefs();
            res.json({ ...skill, enabled: prefs[id] !== undefined ? prefs[id] : true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // DELETE /api/skills/:id — delete user skill
    server.delete('/api/skills/:id', (req, res) => {
        const { id } = req.params;
        const filePath = path.join(userSkillsDir, `${id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        fs.unlinkSync(filePath);
        const prefs = loadSkillPrefs();
        delete prefs[id];
        saveSkillPrefs(prefs);
        res.json({ ok: true });
    });

    // PATCH /api/skills/:id/toggle — toggle enabled state
    server.patch('/api/skills/:id/toggle', (req, res) => {
        const { id } = req.params;
        const { enabled } = req.body;
        const prefs = loadSkillPrefs();
        prefs[id] = !!enabled;
        saveSkillPrefs(prefs);
        res.json({ ok: true, enabled: !!enabled });
    });

    // Get all enabled skills with full content (for UseSkill tool)
    function getAllEnabledSkills() {
        const prefs = loadSkillPrefs();
        const enabledIds = Object.keys(prefs).filter(id => prefs[id]);
        if (enabledIds.length === 0) return [];
        const allSkills = [
            ...scanSkillsDir(bundledSkillsDir, 'bundled'),
            ...scanSkillsDir(localSkillsDir, 'local'),
            ...loadUserSkills()
        ];
        return allSkills.filter(s => enabledIds.includes(s.id));
    }

    // Build lightweight skills index for system prompt (names + descriptions only)
    function getEnabledSkillsBlock() {
        const prefs = loadSkillPrefs();
        const enabledIds = Object.keys(prefs).filter(id => prefs[id]);
        console.log(`[Skills] Prefs:`, JSON.stringify(prefs), `Enabled IDs:`, enabledIds);
        if (enabledIds.length === 0) return '';

        const allSkills = [
            ...scanSkillsDir(bundledSkillsDir, 'bundled'),
            ...scanSkillsDir(localSkillsDir, 'local'),
            ...loadUserSkills()
        ];

        console.log(`[Skills] All scanned:`, allSkills.map(s => s.id));
        const enabled = allSkills.filter(s => enabledIds.includes(s.id));
        console.log(`[Skills] Matched enabled:`, enabled.map(s => s.id));
        if (enabled.length === 0) return '';

        // Only inject skill INDEX (name + description) into system prompt.
        // Full content is loaded on demand via the UseSkill tool.
        let block = `<available_skills>
You have the following skills available. When a user's request matches a skill's description, you MUST use it by calling the UseSkill tool with the skill name to load its full instructions, then follow those instructions precisely.

`;
        for (const s of enabled) {
            block += `- **${s.name}**: ${s.description}\n`;
        }
        block += `\nTo use a skill, call the UseSkill tool with the skill name. The tool will return the full skill instructions for you to follow.\n</available_skills>`;
        console.log(`[Skills] ${enabled.length} skill(s) indexed in system prompt`);
        return block;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CHAT ENDPOINT — Claude Code Engine via Bun CLI subprocess
    // ═══════════════════════════════════════════════════════════════

    const { spawn } = require('child_process');

    // Resolve engine path — in packaged app, engine is in resources/engine
    const isPacked = app.isPackaged;
    const engineDir = isPacked
        ? path.join(process.resourcesPath, 'engine')
        : path.join(__dirname, '..', 'engine');
    const engineCli = path.join(engineDir, 'src', 'entrypoints', 'cli.tsx');
    const engineEnv = path.join(engineDir, '.env');

    // Resolve Bun executable: bundled → user-installed → PATH
    function findBunExe() {
        const bundled = path.join(engineDir, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun');
        if (fs.existsSync(bundled)) return bundled;
        const userInstalled = process.platform === 'win32'
            ? path.join(os.homedir(), '.bun', 'bin', 'bun.exe')
            : path.join(os.homedir(), '.bun', 'bin', 'bun');
        if (fs.existsSync(userInstalled)) return userInstalled;
        return 'bun'; // fallback to PATH
    }
    const bunExePath = findBunExe();
    console.log('[Engine] Bun:', bunExePath, 'exists:', fs.existsSync(bunExePath));

    // Load engine .env so bridge-server can use the same API config (for vision direct API calls)
    const engineEnvVars = {};
    try {
        const envContent = fs.readFileSync(engineEnv, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) engineEnvVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
        console.log('[Engine] Loaded .env:', Object.keys(engineEnvVars).join(', '));
    } catch (_) {}
    const enginePreload = path.join(engineDir, 'preload.ts');

    // Helper: stream one API round, returns parsed response
    async function streamApiRound(endpoint, apiKey, model, systemPrompt, messages, tools, thinkingEnabled, sendSSE) {
        console.log(`[API] model=${model} thinking=${thinkingEnabled} systemPrompt=${systemPrompt ? systemPrompt.length + ' chars' : 'NONE'} messages=${messages.length} tools=${tools.length}`);
        const body = {
            model,
            system: systemPrompt || undefined,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            max_tokens: thinkingEnabled ? 16000 : 8192,
            stream: true,
        };
        if (thinkingEnabled) {
            body.thinking = { type: 'enabled', budget_tokens: 10000 };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            let errMsg = `API Error ${response.status}`;
            try { const j = JSON.parse(errText); errMsg = j.error?.message || j.error || errMsg; } catch { if (errText) errMsg += `: ${errText.slice(0, 300)}`; }
            throw new Error(errMsg);
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let assistantText = '';
        let thinkingText = '';
        const contentBlocks = []; // accumulate full content blocks
        const blockAccumulators = {}; // index → { type, data }
        let stopReason = null;
        let usage = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                let parsed;
                try { parsed = JSON.parse(data); } catch { continue; }

                switch (parsed.type) {
                    case 'content_block_start': {
                        const idx = parsed.index;
                        const block = parsed.content_block;
                        if (block.type === 'text') {
                            blockAccumulators[idx] = { type: 'text', text: '' };
                        } else if (block.type === 'thinking') {
                            blockAccumulators[idx] = { type: 'thinking', thinking: '' };
                        } else if (block.type === 'tool_use') {
                            blockAccumulators[idx] = { type: 'tool_use', id: block.id, name: block.name, inputJson: '' };
                        }
                        break;
                    }
                    case 'content_block_delta': {
                        const idx = parsed.index;
                        const delta = parsed.delta;
                        const acc = blockAccumulators[idx];
                        if (!acc) break;

                        if (delta.type === 'text_delta' && delta.text) {
                            acc.text += delta.text;
                            assistantText += delta.text;
                            // Forward to frontend — REAL streaming!
                            sendSSE({ type: 'content_block_delta', delta: { type: 'text_delta', text: delta.text } });
                        } else if (delta.type === 'thinking_delta' && delta.thinking) {
                            acc.thinking += delta.thinking;
                            thinkingText += delta.thinking;
                            sendSSE({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: delta.thinking } });
                        } else if (delta.type === 'input_json_delta' && delta.partial_json) {
                            acc.inputJson += delta.partial_json;
                        }
                        break;
                    }
                    case 'content_block_stop': {
                        const idx = parsed.index;
                        const acc = blockAccumulators[idx];
                        if (!acc) break;

                        if (acc.type === 'text') {
                            contentBlocks.push({ type: 'text', text: acc.text });
                        } else if (acc.type === 'thinking') {
                            contentBlocks.push({ type: 'thinking', thinking: acc.thinking });
                        } else if (acc.type === 'tool_use') {
                            let input = {};
                            try { input = JSON.parse(acc.inputJson); } catch { }
                            contentBlocks.push({ type: 'tool_use', id: acc.id, name: acc.name, input });
                            // Notify frontend
                            sendSSE({ type: 'tool_use_start', tool_use_id: acc.id, tool_name: acc.name, tool_input: input });
                            console.log(`[Tool] ${acc.name}`, JSON.stringify(input).slice(0, 150));
                        }
                        delete blockAccumulators[idx];
                        break;
                    }
                    case 'message_delta': {
                        if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
                        if (parsed.usage) usage = { ...usage, ...parsed.usage };
                        break;
                    }
                }
            }
        }

        return { contentBlocks, assistantText, thinkingText, stopReason, usage };
    }


    server.post('/api/chat', async (req, res) => {
        const { conversation_id, message, attachments, env_token, env_base_url } = req.body;
        const conv = db.conversations.find(c => c.id === conversation_id);
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Initialize stream buffer for this conversation
        res.flushHeaders();
        activeStreams.set(conversation_id, { events: [], listeners: new Set(), done: false, primaryRes: res });
        const sendSSE = (data) => {
            // Always write to primary response directly (original POST requester)
            var stream = activeStreams.get(conversation_id);
            if (stream) {
                stream.events.push(data);
                // Write to reconnect listeners
                var line = 'data: ' + JSON.stringify(data) + '\n\n';
                var arr = Array.from(stream.listeners);
                for (var i = 0; i < arr.length; i++) {
                    try { arr[i].write(line); } catch (_) { stream.listeners.delete(arr[i]); }
                }
            }
            // Always write to the original POST response
            try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) {}
        };

        try {
            // ── 1. Handle attachments & detect images ──
            let finalPrompt = message;
            const imageBlocks = []; // base64 image blocks for direct API (vision)
            let hasImages = false;

            if (attachments && attachments.length > 0) {
                const copiedFiles = [];
                for (const att of attachments) {
                    let srcPath = att.localPath;
                    if (!srcPath && att.fileId) {
                        for (const dir of [path.join(workspacesDir, conversation_id, '.uploads'), path.join(workspacesDir, 'temp', '.uploads')]) {
                            if (srcPath) break;
                            if (fs.existsSync(dir)) {
                                const match = fs.readdirSync(dir).find(f => f === att.fileId || f.includes(att.fileId));
                                if (match) srcPath = path.join(dir, match);
                            }
                        }
                    }
                    if (srcPath && fs.existsSync(srcPath)) {
                        const fn = att.fileName || path.basename(srcPath);
                        try { fs.copyFileSync(srcPath, path.join(conv.workspace_path, fn)); copiedFiles.push(fn); } catch (_) {}

                        // Detect images → prepare base64 for vision API
                        const ext = path.extname(fn).toLowerCase();
                        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                            try {
                                const imgData = fs.readFileSync(srcPath);
                                if (imgData.length > 100) { // Skip empty/corrupt files
                                    hasImages = true;
                                    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
                                    imageBlocks.push({
                                        type: 'image',
                                        source: { type: 'base64', media_type: mimeMap[ext] || 'image/png', data: imgData.toString('base64') }
                                    });
                                    console.log('[Chat] Image loaded:', fn, imgData.length, 'bytes');
                                } else {
                                    console.warn('[Chat] Skipping empty image:', fn, imgData.length, 'bytes');
                                }
                            } catch (_) {}
                        }
                    }
                }
                if (copiedFiles.length > 0 && !hasImages) {
                    finalPrompt += '\n\n[Attached files in workspace — read only when needed:]\n';
                    for (const fn of copiedFiles) finalPrompt += `- ./${fn}\n`;
                }
            }

            // ── 2. Save user message ──
            db.messages.push({
                id: uuidv4(), conversation_id, role: 'user',
                content: JSON.stringify([{ type: 'text', text: message }]),
                created_at: new Date().toISOString(),
                attachments: attachments && attachments.length > 0 ? attachments.map(a => ({ fileId: a.fileId, fileName: a.fileName, fileType: a.fileType, mimeType: a.mimeType, size: a.size })) : undefined
            });
            saveDb();

            // ── 3. Build system prompt ──
            let sysPrompt = customSystemPrompt || '';
            if (conv.project_id) {
                const project = db.projects.find(p => p.id === conv.project_id);
                if (project) {
                    if (project.instructions && project.instructions.trim()) sysPrompt += '\n\n<project_instructions>\n' + project.instructions.trim() + '\n</project_instructions>';
                    const pFiles = db.project_files.filter(f => f.project_id === project.id);
                    if (pFiles.length > 0) {
                        const withText = pFiles.filter(f => f.extracted_text);
                        const totalSz = withText.reduce((s, f) => s + (f.extracted_text ? f.extracted_text.length : 0), 0);
                        if (totalSz <= 80000 && withText.length > 0) {
                            let c = '\n\n<project_knowledge_base>\n';
                            for (const pf of withText) c += '\n--- ' + pf.file_name + ' ---\n' + pf.extracted_text + '\n';
                            sysPrompt += c + '</project_knowledge_base>';
                        } else {
                            let c = '\n\n<project_knowledge_base>\nFiles in workspace:\n';
                            for (const pf of pFiles) c += '- ' + pf.file_name + ' (' + Math.round((pf.file_size || 0) / 1024) + ' KB)\n';
                            sysPrompt += c + 'Read only when needed.\n</project_knowledge_base>';
                        }
                    }
                }
            }

            // ── 4. Determine mode: images → direct API, text → Claude Code engine ──
            // Engine .env is authoritative for base URL; frontend may have stale value
            const apiKey = env_token || engineEnvVars.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
            const baseUrl = engineEnvVars.ANTHROPIC_BASE_URL || env_base_url || process.env.ANTHROPIC_BASE_URL;
            console.log('[Chat] Key source:', env_token ? 'user(' + env_token.slice(0, 8) + '...)' : engineEnvVars.ANTHROPIC_API_KEY ? 'engine-env' : process.env.ANTHROPIC_API_KEY ? 'process-env' : 'NONE', '| baseUrl:', baseUrl);
            const rawModel = conv.model || 'claude-sonnet-4-6';
            const modelId = rawModel.replace(/-thinking$/, '');

            // ── 4a. IMAGE MODE: Vision via Bun subprocess (Node.js in Electron can't connect) ──
            if (hasImages) {
                console.log('[Chat] Image detected, using Bun vision helper');
                const endpoint = baseUrl ? (baseUrl.replace(/\/+$/, '').endsWith('/v1') ? baseUrl.replace(/\/+$/, '') + '/messages' : baseUrl.replace(/\/+$/, '') + '/v1/messages') : 'https://api.anthropic.com/v1/messages';
                const userContent = [...imageBlocks, { type: 'text', text: message }];
                const apiBody = { model: modelId, system: sysPrompt || undefined, messages: [{ role: 'user', content: userContent }], max_tokens: 8192, stream: true };

                // Write request to temp file (too large for CLI args)
                const tmpFile = path.join(conv.workspace_path, '.vision_req.json');
                fs.writeFileSync(tmpFile, JSON.stringify({ endpoint, apiKey, body: apiBody }));

                const visionHelper = path.join(engineDir, 'vision-helper.ts');
                const bunExe = bunExePath;

                console.log('[Chat] Vision request:', endpoint, 'body size:', fs.statSync(tmpFile).size, 'bytes');
                const { spawn } = require('child_process');
                const vChild = spawn(bunExe, [visionHelper, tmpFile], {
                    cwd: conv.workspace_path,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                vChild.stdin.end();

                let assistantText = '';
                let vBuf = '';
                vChild.stdout.on('data', (chunk) => {
                    vBuf += chunk.toString('utf8');
                    const lines = vBuf.split('\n');
                    vBuf = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        let parsed;
                        try { parsed = JSON.parse(line); } catch { continue; }
                        if (parsed.type === 'error') {
                            sendSSE({ type: 'error', error: parsed.error });
                        } else if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.type === 'text_delta') {
                            assistantText += parsed.delta.text;
                            sendSSE({ type: 'content_block_delta', delta: { type: 'text_delta', text: parsed.delta.text } });
                        } else if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.type === 'thinking_delta') {
                            sendSSE({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: parsed.delta.thinking } });
                        }
                    }
                });

                let vStderr = '';
                vChild.stderr.on('data', (c) => { vStderr += c.toString('utf8'); });

                await new Promise((resolve, reject) => {
                    vChild.on('close', (code) => {
                        try { fs.unlinkSync(tmpFile); } catch (_) {}
                        if (code !== 0 && !assistantText) reject(new Error(vStderr || 'Vision helper failed'));
                        else resolve();
                    });
                    vChild.on('error', reject);
                });

                if (assistantText) {
                    db.messages.push({ id: uuidv4(), conversation_id, role: 'assistant', content: JSON.stringify([{ type: 'text', text: assistantText }]), created_at: new Date().toISOString() });
                    saveDb();
                    generateTitleAsync(conversation_id, message.slice(0, 300), assistantText.slice(0, 300), apiKey, baseUrl, conv.model);
                }
                sendSSE({ type: 'message_stop' });
                endStream(conversation_id);
                return;
            }

            // ── 4b. TEXT MODE: Claude Code engine via Bun CLI ──

            const cliArgs = [
                '--preload', enginePreload,
                '--env-file=' + engineEnv, engineCli,
                '-p', finalPrompt,
                '--output-format', 'stream-json',
                '--verbose',
                '--include-partial-messages',
                '--permission-mode', 'bypassPermissions',
                '--model', modelId,
            ];
            if (conv.claude_session_id) cliArgs.push('--resume', conv.claude_session_id);
            if (sysPrompt) cliArgs.push('--append-system-prompt', sysPrompt);

            const envVars = Object.assign({}, process.env);
            if (apiKey) envVars.ANTHROPIC_API_KEY = apiKey;
            if (baseUrl) envVars.ANTHROPIC_BASE_URL = baseUrl;

            const bunExe = bunExePath;

            console.log('[Engine] model=' + modelId + ' session=' + (conv.claude_session_id || 'new'));
            const { spawn } = require('child_process');
            const child = spawn(bunExe, cliArgs, {
                cwd: conv.workspace_path, env: envVars,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            // Keep stdin open for control_response (AskUserQuestion)
            // Store child ref so the answer endpoint can write to it
            const childRef = child;
            activeChildren.set(conversation_id, childRef);

            // ── 5. Parse stream-json and forward to frontend ──
            let assistantText = '';
            let thinkingText = '';
            const toolCalls = new Map();
            const sentToolStarts = new Set(); // track which tool_use_start we already sent
            const writtenFiles = new Map(); // deduplicate Write tool results by file path
            const searchLogs = []; // collect WebSearch results for persistence
            let sessionId = conv.claude_session_id;
            let buf = '';

            // Tools that are internal to Claude Code and should not be shown to the user
            const HIDDEN_TOOLS = new Set(['EnterWorktree', 'ExitWorktree', 'TodoWrite', 'WebSearch', 'WebFetch']);

            child.stdout.on('data', (chunk) => {
                buf += chunk.toString('utf8');
                const lines = buf.split('\n');
                buf = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    var evt;
                    try { evt = JSON.parse(line); } catch { continue; }

                    if (evt.session_id && !sessionId) {
                        sessionId = evt.session_id;
                        conv.claude_session_id = sessionId;
                        saveDb();
                    }

                    // Debug: log all event types to understand WebSearch flow
                    if (evt.type !== 'stream_event') {
                        console.log('[Engine-evt]', evt.type, evt.subtype || '', evt.tool_use_id ? 'tool_id=' + evt.tool_use_id : '', typeof evt.content === 'string' ? evt.content.slice(0, 100) : '');
                    }

                    if (evt.type === 'stream_event' && evt.event) {
                        var se = evt.event;
                        // Forward text and thinking deltas
                        if (se.type === 'content_block_delta') {
                            if (se.delta && se.delta.type === 'text_delta') {
                                assistantText += se.delta.text;
                                sendSSE({ type: 'content_block_delta', delta: { type: 'text_delta', text: se.delta.text } });
                            } else if (se.delta && se.delta.type === 'thinking_delta') {
                                thinkingText += se.delta.thinking;
                                sendSSE({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: se.delta.thinking } });
                            }
                        }
                        // Track tool_use start from stream (don't send yet — wait for full input from assistant event)
                        else if (se.type === 'content_block_start' && se.content_block && se.content_block.type === 'tool_use') {
                            var tu = se.content_block;
                            toolCalls.set(tu.id, { id: tu.id, name: tu.name, input: {}, status: 'running' });
                            // Don't send tool_use_start here — input is empty. Wait for 'assistant' event with full input.
                        }
                    }
                    // Complete assistant message — has full tool input
                    else if (evt.type === 'assistant' && evt.message && evt.message.content) {
                        for (var block of evt.message.content) {
                            if (block.type === 'tool_use') {
                                var tc = toolCalls.get(block.id);
                                if (tc) tc.input = block.input;
                                // WebSearch: emit status event instead of tool_use_start
                                if (block.name === 'WebSearch' && !sentToolStarts.has(block.id)) {
                                    sentToolStarts.add(block.id);
                                    var searchQuery = (block.input && block.input.query) || 'the web';
                                    sendSSE({ type: 'status', message: 'Searching: ' + searchQuery });
                                    console.log('[WebSearch] Started, query:', searchQuery, 'id:', block.id);
                                }
                                // WebFetch: also emit status
                                else if (block.name === 'WebFetch' && !sentToolStarts.has(block.id)) {
                                    sentToolStarts.add(block.id);
                                    var fetchUrl = (block.input && block.input.url) || '';
                                    sendSSE({ type: 'status', message: 'Fetching: ' + fetchUrl });
                                    console.log('[WebFetch] Started, url:', fetchUrl);
                                }
                                // Send tool_use_start with full input (only once per tool)
                                else if (!sentToolStarts.has(block.id) && !HIDDEN_TOOLS.has(block.name)) {
                                    sentToolStarts.add(block.id);
                                    sendSSE({ type: 'tool_use_start', tool_use_id: block.id, tool_name: block.name, tool_input: block.input });
                                    console.log('[Tool]', block.name, JSON.stringify(block.input || {}).slice(0, 120));
                                }
                            }
                        }
                    }
                    // User message with tool_use_result (WebSearch results come through here)
                    else if (evt.type === 'user' && evt.message && evt.message.content) {
                        var userContent = evt.message.content;
                        var contentArr = Array.isArray(userContent) ? userContent : [];
                        for (var ci = 0; ci < contentArr.length; ci++) {
                            var cb = contentArr[ci];
                            if (cb.type === 'tool_result' && cb.tool_use_id) {
                                var tc3 = toolCalls.get(cb.tool_use_id);
                                var tn = tc3 ? tc3.name : '';
                                // Extract text from tool_result content
                                var trText = '';
                                if (typeof cb.content === 'string') trText = cb.content;
                                else if (Array.isArray(cb.content)) trText = cb.content.map(function(x) { return x.text || ''; }).join('');
                                if (tc3) { tc3.status = cb.is_error ? 'error' : 'done'; tc3.result = trText; }

                                // WebSearch: parse result text and emit search_sources
                                if (tn === 'WebSearch' && trText) {
                                    console.log('[WebSearch] Result from user event:', trText.slice(0, 300));
                                    try {
                                        // Format: "Web search results for query: "..."\n\nLinks: [{...},...]\n\nContent:..."
                                        var wsQuery = '';
                                        var qMatch = trText.match(/query:\s*"([^"]+)"/);
                                        if (qMatch) wsQuery = qMatch[1];
                                        var wsSources = [];
                                        var linksMatch = trText.match(/Links:\s*(\[[\s\S]*?\])\s*\n/);
                                        if (linksMatch) {
                                            try {
                                                var links = JSON.parse(linksMatch[1]);
                                                if (Array.isArray(links)) {
                                                    wsSources = links.filter(function(l) { return l.url; }).map(function(l) { return { url: l.url, title: l.title || '' }; });
                                                }
                                            } catch (_) {}
                                        }
                                        if (wsSources.length > 0 && wsQuery) {
                                            sendSSE({ type: 'search_sources', sources: wsSources, query: wsQuery });
                                            searchLogs.push({ query: wsQuery, results: wsSources });
                                            console.log('[WebSearch] Emitted', wsSources.length, 'sources for:', wsQuery);
                                        }
                                    } catch (_) {}
                                }

                                // Don't send tool_use_done for hidden tools
                                if (!HIDDEN_TOOLS.has(tn)) {
                                    sendSSE({ type: 'tool_use_done', tool_use_id: cb.tool_use_id, content: trText.slice(0, 50000), is_error: cb.is_error || false });
                                }
                            }
                        }
                    }
                    // Tool result (legacy path)
                    else if (evt.type === 'tool') {
                        var resultText = typeof evt.content === 'string' ? evt.content
                            : Array.isArray(evt.content) ? evt.content.map(function(b) { return b.text || ''; }).join('') : '';
                        var tc2 = toolCalls.get(evt.tool_use_id);
                        var toolName = tc2 ? tc2.name : '';
                        if (tc2) { tc2.status = evt.is_error ? 'error' : 'done'; tc2.result = resultText; }

                        // WebSearch result (legacy tool path): parse text format
                        if (toolName === 'WebSearch' && resultText) {
                            try {
                                var qm2 = resultText.match(/query:\s*"([^"]+)"/);
                                var lm2 = resultText.match(/Links:\s*(\[[\s\S]*?\])\s*\n/);
                                if (qm2 && lm2) {
                                    var links2 = JSON.parse(lm2[1]);
                                    var sources = links2.filter(function(l) { return l.url; }).map(function(l) { return { url: l.url, title: l.title || '' }; });
                                    if (sources.length > 0) {
                                        sendSSE({ type: 'search_sources', sources: sources, query: qm2[1] });
                                    }
                                }
                            } catch (_) {}
                        }

                        // Deduplicate Write tool: only keep last version per file path
                        if (toolName === 'Write' && tc2 && tc2.input && tc2.input.file_path) {
                            var prevId = writtenFiles.get(tc2.input.file_path);
                            if (prevId) {
                                // Remove previous Write for same file from toolCalls
                                toolCalls.delete(prevId);
                            }
                            writtenFiles.set(tc2.input.file_path, evt.tool_use_id);
                        }

                        // Don't send results for hidden/internal tools
                        if (!HIDDEN_TOOLS.has(toolName)) {
                            sendSSE({ type: 'tool_use_done', tool_use_id: evt.tool_use_id, content: resultText.slice(0, 50000), is_error: evt.is_error || false });
                        }
                    }
                    // Final result
                    else if (evt.type === 'result' && !assistantText && evt.result) {
                        assistantText = typeof evt.result === 'string' ? evt.result : '';
                    }
                    // AskUserQuestion — engine needs user input via control_request
                    else if (evt.type === 'control_request' && evt.request) {
                        var req2 = evt.request;
                        if (req2.subtype === 'can_use_tool' && req2.tool_name === 'AskUserQuestion') {
                            console.log('[AskUser] control_request id=' + evt.request_id);
                            sendSSE({
                                type: 'ask_user',
                                request_id: evt.request_id,
                                tool_use_id: req2.tool_use_id,
                                questions: (req2.input && req2.input.questions) || [],
                            });
                        } else {
                            // Other permission requests — auto-accept in bypass mode
                            var autoResponse = JSON.stringify({
                                type: 'control_response',
                                response: { subtype: 'success', request_id: evt.request_id, response: { toolUseID: req2.tool_use_id, behavior: 'accept', message: null } }
                            }) + '\n';
                            try { childRef.stdin.write(autoResponse); } catch (_) {}
                        }
                    }
                    // Task/Agent progress events
                    else if (evt.type === 'system' && (evt.subtype === 'task_started' || evt.subtype === 'task_progress' || evt.subtype === 'task_notification')) {
                        sendSSE({ type: 'task_event', subtype: evt.subtype, task_id: evt.task_id, description: evt.description, status: evt.status, summary: evt.summary, usage: evt.usage, last_tool_name: evt.last_tool_name });
                    }
                    // Auto-compact boundary — engine compacted context mid-conversation
                    else if (evt.type === 'system' && evt.subtype === 'compact_boundary') {
                        var meta = evt.compact_metadata || {};
                        console.log('[AutoCompact] Engine auto-compacted context, pre_tokens=' + (meta.pre_tokens || '?'));
                        sendSSE({ type: 'compact_boundary', compact_metadata: meta });
                        // Append a compact boundary marker — keep old messages for UI display
                        db.messages.push({
                            id: uuidv4(), conversation_id: conversation_id, role: 'system',
                            content: JSON.stringify([{ type: 'text', text: 'Context auto-compacted by engine.' }]),
                            created_at: new Date().toISOString(), is_compact_boundary: true,
                        });
                        saveDb();
                    }
                }
            });

            let stderrBuf = '';
            child.stderr.on('data', function(c) { stderrBuf += c.toString('utf8'); });

            await new Promise(function(resolve, reject) {
                child.on('close', function(code) {
                    activeChildren.delete(conversation_id);
                    if (buf.trim()) { try { var e = JSON.parse(buf); if (!assistantText && e.result) assistantText = typeof e.result === 'string' ? e.result : ''; } catch(x) {} }
                    if (code !== 0 && !assistantText) reject(new Error(stderrBuf || 'Engine exit ' + code));
                    else resolve();
                });
                child.on('error', function(err) { activeChildren.delete(conversation_id); reject(err); });
            });

            // ── 6. Save results ──
            if (assistantText || thinkingText || toolCalls.size > 0) {
                db.messages.push({
                    id: uuidv4(), conversation_id, role: 'assistant',
                    content: JSON.stringify([{ type: 'text', text: assistantText }]),
                    created_at: new Date().toISOString(),
                    thinking: thinkingText || undefined,
                    toolCalls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
                    searchLogs: searchLogs.length > 0 ? searchLogs : undefined,
                });
                saveDb();
                generateTitleAsync(conversation_id, message.slice(0, 300), assistantText.slice(0, 300), apiKey, baseUrl, conv.model);
            }

            sendSSE({ type: 'message_stop' });
            endStream(conversation_id);
        } catch (err) {
            console.error('[Chat] Error:', (err.message || '').slice(0, 300));
            sendSSE({ type: 'error', error: err.message || 'Engine error' });
            endStream(conversation_id);
        }
    });

    return server;
}

module.exports = { initServer, enableNodeModeForChildProcesses };
