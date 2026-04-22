import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  FolderOpen,
  GitBranch,
  GitCompare,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Terminal,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  CodeCommandResult,
  CodeFileResult,
  CodeGitFile,
  CodeGitFileDiffResult,
  CodeGitStatusResult,
  CodeWorkspaceEntry,
  createCodeEntry,
  deleteCodeEntry,
  getAgentConfig,
  getCodeGitFileDiff,
  getCodeGitStatus,
  listCodeWorkspace,
  readCodeFile,
  renameCodeEntry,
  restoreCodeFileFromGit,
  runCodeCommand,
  runCodeGitAction,
  runCodeGitFileAction,
  saveCodeFile,
  updateAgentConfig,
} from '../api';
import { getStoredUiLanguage } from '../utils/chineseClientText';
import { copyToClipboard } from '../utils/clipboard';

type PermissionMode = 'workspace_write' | 'project' | 'full_access';
type GitAction = 'pull' | 'stage_all' | 'commit' | 'push';
type GitFileAction = 'stage_file' | 'unstage_file' | 'discard_file';
type TreeAction = 'open' | 'new_file' | 'new_folder' | 'rename' | 'delete' | 'copy_path' | 'refresh';
type DiffLine = {
  type: 'same' | 'add' | 'remove';
  oldLine?: number;
  newLine?: number;
  text: string;
};

type TreeContextMenuState = {
  x: number;
  y: number;
  entry: CodeWorkspaceEntry | null;
};

type WorkspaceDialogState =
  | {
      kind: 'create';
      entryType: 'file' | 'directory';
      parentPath: string;
      value: string;
      error: string;
    }
  | {
      kind: 'rename';
      entry: CodeWorkspaceEntry;
      value: string;
      error: string;
    }
  | {
      kind: 'delete';
      entry: CodeWorkspaceEntry;
    }
  | {
      kind: 'restore';
      entry: CodeWorkspaceEntry;
    };

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const getRelativePath = (root: string, target: string) => {
  if (!root || !target) return target || '';
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  if (target === normalizedRoot) return '.';
  if (target.startsWith(normalizedRoot + '\\') || target.startsWith(normalizedRoot + '/')) {
    return target.slice(normalizedRoot.length + 1);
  }
  return target;
};

const splitPath = (value: string) => value.split(/[\\/]+/).filter(Boolean);
const pathDirname = (value: string) => value.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '') || value;

const buildLineDiff = (oldText: string, newText: string): DiffLine[] => {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  if (oldCount * newCount > 90000) {
    const rows: DiffLine[] = [];
    const max = Math.max(oldCount, newCount);
    for (let i = 0; i < max; i += 1) {
      if (oldLines[i] === newLines[i]) {
        rows.push({ type: 'same', oldLine: i + 1, newLine: i + 1, text: oldLines[i] || '' });
      } else {
        if (i < oldCount) rows.push({ type: 'remove', oldLine: i + 1, text: oldLines[i] || '' });
        if (i < newCount) rows.push({ type: 'add', newLine: i + 1, text: newLines[i] || '' });
      }
    }
    return rows;
  }

  const dp = Array.from({ length: oldCount + 1 }, () => Array(newCount + 1).fill(0));
  for (let i = oldCount - 1; i >= 0; i -= 1) {
    for (let j = newCount - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;
  while (i < oldCount && j < newCount) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ type: 'same', oldLine: oldLine++, newLine: newLine++, text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'remove', oldLine: oldLine++, text: oldLines[i] });
      i += 1;
    } else {
      rows.push({ type: 'add', newLine: newLine++, text: newLines[j] });
      j += 1;
    }
  }
  while (i < oldCount) rows.push({ type: 'remove', oldLine: oldLine++, text: oldLines[i++] });
  while (j < newCount) rows.push({ type: 'add', newLine: newLine++, text: newLines[j++] });
  return rows;
};

const gitActionLabel = (action: GitAction, isZh: boolean) => {
  const zh: Record<GitAction, string> = {
    pull: '拉取',
    stage_all: '暂存全部',
    commit: '提交',
    push: '推送',
  };
  const en: Record<GitAction, string> = {
    pull: 'Pull',
    stage_all: 'Stage all',
    commit: 'Commit',
    push: 'Push',
  };
  return isZh ? zh[action] : en[action];
};

const gitFileActionLabel = (action: GitFileAction, isZh: boolean) => {
  const zh: Record<GitFileAction, string> = {
    stage_file: '暂存文件',
    unstage_file: '取消暂存',
    discard_file: '丢弃改动',
  };
  const en: Record<GitFileAction, string> = {
    stage_file: 'Stage file',
    unstage_file: 'Unstage',
    discard_file: 'Discard',
  };
  return isZh ? zh[action] : en[action];
};

const getGitDisplayPath = (value: string) => {
  const normalized = (value || '').replace(/\\/g, '/');
  const arrowIndex = normalized.lastIndexOf(' -> ');
  return arrowIndex >= 0 ? normalized.slice(arrowIndex + 4) : normalized;
};

const getPermissionCopy = (mode: PermissionMode, isZh: boolean) => {
  const copy: Record<PermissionMode, { label: string; desc: string; tone: string }> = {
    workspace_write: {
      label: isZh ? '安全模式' : 'Safe mode',
      desc: isZh ? '只允许当前工作区文件操作，禁用命令执行。' : 'Workspace file access only, shell disabled.',
      tone: 'border-[#2E7CF6]/70 bg-[#2E7CF6]/10 text-claude-text',
    },
    project: {
      label: isZh ? '项目权限' : 'Project',
      desc: isZh ? '允许当前工作区内文件操作和命令执行，不能越界访问全盘。' : 'Workspace files and commands only, no system-wide access.',
      tone: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-500',
    },
    full_access: {
      label: isZh ? '完全访问' : 'Full access',
      desc: isZh ? '允许全盘文件操作和命令执行，请谨慎使用。' : 'System-wide file access and shell commands. Use carefully.',
      tone: 'border-[#C6613F]/60 bg-[#C6613F]/10 text-[#C6613F]',
    },
  };
  return copy[mode];
};

const normalizePath = (value: string) => String(value || '').replace(/\//g, '\\').toLowerCase();

const startsWithPath = (value: string, parent: string) => {
  const normalizedValue = normalizePath(value);
  const normalizedParent = normalizePath(parent).replace(/[\\]+$/, '');
  return normalizedValue === normalizedParent || normalizedValue.startsWith(`${normalizedParent}\\`);
};

const isDangerousCommand = (command: string) => {
  const normalized = command.trim().toLowerCase();
  return [
    /\brm\s+-rf\b/,
    /\brm\s+-r\b/,
    /\bdel\s+\/[a-z]*[fqs]/,
    /\berase\s+/,
    /\bformat\s+[a-z]:/i,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bpoweroff\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\s+-fd\b/,
  ].some((pattern) => pattern.test(normalized));
};

const CodePage = () => {
  const uiLanguage = getStoredUiLanguage();
  const isZh = uiLanguage === 'zh-CN';
  const [workspacePath, setWorkspacePath] = useState(() => localStorage.getItem('code_workspace_path') || '');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<CodeWorkspaceEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFileResult | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<CodeCommandResult[]>([]);
  const [gitStatus, setGitStatus] = useState<CodeGitStatusResult | null>(null);
  const [selectedGitFile, setSelectedGitFile] = useState<CodeGitFile | null>(null);
  const [gitFileDiff, setGitFileDiff] = useState<CodeGitFileDiffResult | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('full_access');
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [runningCommand, setRunningCommand] = useState(false);
  const [loadingGit, setLoadingGit] = useState(false);
  const [loadingGitDiff, setLoadingGitDiff] = useState(false);
  const [gitBusyAction, setGitBusyAction] = useState<GitAction | null>(null);
  const [gitFileBusyAction, setGitFileBusyAction] = useState<GitFileAction | null>(null);
  const [fileOperationBusy, setFileOperationBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [treeMenu, setTreeMenu] = useState<TreeContextMenuState | null>(null);
  const [workspaceDialog, setWorkspaceDialog] = useState<WorkspaceDialogState | null>(null);
  const [error, setError] = useState('');
  const treeMenuRef = useRef<HTMLDivElement | null>(null);

  const relativeCurrentPath = useMemo(() => getRelativePath(workspacePath, currentPath || workspacePath), [workspacePath, currentPath]);
  const breadcrumbParts = useMemo(() => splitPath(relativeCurrentPath === '.' ? '' : relativeCurrentPath), [relativeCurrentPath]);
  const isEditableFile = !!selectedFile && !selectedFile.binary && !selectedFile.truncated;
  const isDirty = isEditableFile && editorContent !== originalContent;
  const diffLines = useMemo(() => buildLineDiff(originalContent, editorContent), [editorContent, originalContent]);
  const changedDiffLines = useMemo(() => diffLines.filter(line => line.type !== 'same').length, [diffLines]);
  const selectedFileEntry = useMemo<CodeWorkspaceEntry | null>(() => {
    if (!selectedFile) return null;
    return {
      path: selectedFile.path,
      name: selectedFile.name,
      type: 'file',
      size: selectedFile.size,
      mtime: '',
    };
  }, [selectedFile]);
  const recentCommands = useMemo(() => {
    const seen = new Set<string>();
    return commandHistory
      .map((item) => item.command)
      .filter((item) => {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) return false;
        seen.add(trimmed);
        return true;
      })
      .slice(0, 5);
  }, [commandHistory]);
  const commandQuickActions = useMemo(() => {
    const base = [
      { label: isZh ? '列出文件' : 'List files', command: 'dir', desc: isZh ? '快速确认当前工作区内容' : 'Inspect workspace files' },
      { label: isZh ? 'Git 状态' : 'Git status', command: 'git status --short --branch', desc: isZh ? '查看分支和改动' : 'Check branch and changes' },
    ];
    const projectCommands = [
      { label: isZh ? '依赖检查' : 'Dependency check', command: 'npm ls --depth=0', desc: isZh ? '查看项目依赖是否完整' : 'Check installed dependencies' },
      { label: isZh ? '运行测试' : 'Run tests', command: 'npm test', desc: isZh ? '如果项目有测试脚本就执行' : 'Run the project test script' },
      { label: isZh ? '构建项目' : 'Build', command: 'npm run build', desc: isZh ? '执行项目构建脚本' : 'Run the build script' },
    ];
    return [...base, ...projectCommands];
  }, [isZh]);

  const rememberWorkspacePath = useCallback((nextWorkspacePath: string) => {
    if (!nextWorkspacePath) return;
    const shouldRemember = localStorage.getItem('code_remember_workspace') !== '0';
    localStorage.setItem('code_workspace_path', nextWorkspacePath);
    if (!shouldRemember) return;
    try {
      const raw = JSON.parse(localStorage.getItem('code_recent_workspaces') || '[]');
      const list = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
      const next = [nextWorkspacePath, ...list.filter((item) => item !== nextWorkspacePath)].slice(0, 8);
      localStorage.setItem('code_recent_workspaces', JSON.stringify(next));
    } catch {
      localStorage.setItem('code_recent_workspaces', JSON.stringify([nextWorkspacePath]));
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('code_persist_command_history') === '0') return;
    try {
      const raw = JSON.parse(localStorage.getItem('code_command_history') || '[]');
      if (Array.isArray(raw)) {
        setCommandHistory(raw);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('code_persist_command_history') === '0') {
      localStorage.removeItem('code_command_history');
      return;
    }
    localStorage.setItem('code_command_history', JSON.stringify(commandHistory.slice(0, 12)));
  }, [commandHistory]);

  const refreshAgentConfig = useCallback(async () => {
    try {
      const config = await getAgentConfig();
      setPermissionMode(config.permissionMode || 'full_access');
    } catch (_) {}
  }, []);

  const refreshGitStatus = useCallback(async (workspaceOverride?: string) => {
    const root = workspaceOverride || workspacePath;
    if (!root) return;
    setLoadingGit(true);
    try {
      const status = await getCodeGitStatus(root);
      setGitStatus(status);
      if (!status.files.length) {
        setSelectedGitFile(null);
        setGitFileDiff(null);
      }
    } catch (err: any) {
      setGitStatus(null);
      setError(err?.message || (isZh ? '读取 Git 状态失败' : 'Failed to read Git status'));
    } finally {
      setLoadingGit(false);
    }
  }, [isZh, workspacePath]);

  const loadDirectory = useCallback(async (target?: string, workspaceOverride?: string) => {
    const rootPath = workspaceOverride || workspacePath;
    if (!rootPath) return;
    setLoadingTree(true);
    setError('');
    try {
      const result = await listCodeWorkspace(rootPath, target || currentPath || rootPath);
      setWorkspacePath(result.workspacePath);
      setCurrentPath(result.path);
      setParentPath(result.parentPath);
      setEntries(result.entries || []);
      rememberWorkspacePath(result.workspacePath);
    } catch (err: any) {
      setError(err?.message || (isZh ? '读取工作区失败' : 'Failed to read workspace'));
    } finally {
      setLoadingTree(false);
    }
  }, [currentPath, isZh, rememberWorkspacePath, workspacePath]);

  useEffect(() => {
    refreshAgentConfig();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (detail?.permissionMode) setPermissionMode(detail.permissionMode);
    };
    window.addEventListener('agentConfigUpdated', handler as EventListener);
    return () => window.removeEventListener('agentConfigUpdated', handler as EventListener);
  }, [refreshAgentConfig]);

  useEffect(() => {
    if (workspacePath) {
      loadDirectory(workspacePath);
      refreshGitStatus(workspacePath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!treeMenu) return;
    const closeMenu = (event: MouseEvent) => {
      if (treeMenuRef.current?.contains(event.target as Node)) return;
      setTreeMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTreeMenu(null);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [treeMenu]);

  const chooseWorkspace = async () => {
    const api = (window as any).electronAPI;
    if (!api?.selectDirectory) {
      setError(isZh ? '当前环境不支持选择文件夹' : 'Directory picker is not available');
      return;
    }
    const dir = await api.selectDirectory();
    if (!dir) return;
    setWorkspacePath(dir);
    setCurrentPath(dir);
    setSelectedFile(null);
    setEditorContent('');
    setOriginalContent('');
    setShowDiff(false);
    rememberWorkspacePath(dir);
    await loadDirectory(dir, dir);
    await refreshGitStatus(dir);
  };

  const openWorkspaceFolder = () => {
    const api = (window as any).electronAPI;
    if (workspacePath && api?.openFolder) api.openFolder(workspacePath);
  };

  const openEntry = async (entry: CodeWorkspaceEntry) => {
    if (entry.type === 'directory') {
      setSelectedFile(null);
      setEditorContent('');
      setOriginalContent('');
      setShowDiff(false);
      await loadDirectory(entry.path);
      return;
    }
    setLoadingFile(true);
    setError('');
    try {
      const file = await readCodeFile(workspacePath, entry.path);
      setSelectedFile(file);
      setEditorContent(file.content || '');
      setOriginalContent(file.content || '');
      setShowDiff(false);
    } catch (err: any) {
      setError(err?.message || (isZh ? '读取文件失败' : 'Failed to read file'));
    } finally {
      setLoadingFile(false);
    }
  };

  const openTreeMenu = (event: React.MouseEvent, entry: CodeWorkspaceEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    setTreeMenu({
      x: event.clientX,
      y: event.clientY,
      entry,
    });
  };

  const handleTreeAction = async (action: TreeAction, entry: CodeWorkspaceEntry | null) => {
    setTreeMenu(null);
    const targetEntry = entry || null;
    const targetDirectory = targetEntry?.type === 'directory'
      ? targetEntry.path
      : pathDirname(targetEntry?.path || currentPath || workspacePath);

    if (action === 'refresh') {
      await loadDirectory(currentPath || workspacePath);
      return;
    }
    if (action === 'copy_path') {
      await copyToClipboard(targetEntry?.path || currentPath || workspacePath);
      return;
    }
    if (action === 'open' && targetEntry) {
      await openEntry(targetEntry);
      return;
    }
    if (action === 'new_file') {
      openCreateDialog('file', targetDirectory);
      return;
    }
    if (action === 'new_folder') {
      openCreateDialog('directory', targetDirectory);
      return;
    }
    if (action === 'rename' && targetEntry) {
      openRenameDialog(targetEntry);
      return;
    }
    if (action === 'delete' && targetEntry) {
      openDeleteDialog(targetEntry);
    }
  };

  const closeWorkspaceDialog = () => setWorkspaceDialog(null);

  const openCreateDialog = (type: 'file' | 'directory', parentOverride?: string) => {
    if (!workspacePath || fileOperationBusy) return;
    setWorkspaceDialog({
      kind: 'create',
      entryType: type,
      parentPath: parentOverride || currentPath || workspacePath,
      value: '',
      error: '',
    });
  };

  const openRenameDialog = (entry: CodeWorkspaceEntry) => {
    if (!entry || fileOperationBusy) return;
    setWorkspaceDialog({
      kind: 'rename',
      entry,
      value: entry.name,
      error: '',
    });
  };

  const openDeleteDialog = (entry: CodeWorkspaceEntry) => {
    if (!entry || fileOperationBusy) return;
    setWorkspaceDialog({ kind: 'delete', entry });
  };

  const openRestoreDialog = (entry: CodeWorkspaceEntry) => {
    if (!entry || fileOperationBusy) return;
    setWorkspaceDialog({ kind: 'restore', entry });
  };

  const submitWorkspaceDialog = async () => {
    if (!workspaceDialog || fileOperationBusy) return;

    if (workspaceDialog.kind === 'create') {
      const nextName = workspaceDialog.value.trim();
      if (!nextName) {
        setWorkspaceDialog({ ...workspaceDialog, error: isZh ? '请先输入名称。' : 'Please enter a name first.' });
        return;
      }
      setFileOperationBusy(true);
      setError('');
      try {
        const created = await createCodeEntry(workspacePath, workspaceDialog.parentPath, nextName, workspaceDialog.entryType);
        await loadDirectory(workspaceDialog.parentPath);
        await refreshGitStatus();
        if (workspaceDialog.entryType === 'file' && created.path) {
          const file = await readCodeFile(workspacePath, created.path);
          setSelectedFile(file);
          setEditorContent(file.content || '');
          setOriginalContent(file.content || '');
          setShowDiff(false);
        }
        setWorkspaceDialog(null);
      } catch (err: any) {
        const message = err?.message || (isZh ? '创建失败' : 'Failed to create entry');
        setError(message);
        setWorkspaceDialog(prev => prev && prev.kind === 'create' ? { ...prev, error: message } : prev);
      } finally {
        setFileOperationBusy(false);
      }
      return;
    }

    if (workspaceDialog.kind === 'rename') {
      const nextName = workspaceDialog.value.trim();
      if (!nextName) {
        setWorkspaceDialog({ ...workspaceDialog, error: isZh ? '请先输入新名称。' : 'Please enter a new name first.' });
        return;
      }
      if (nextName === workspaceDialog.entry.name) {
        setWorkspaceDialog(null);
        return;
      }
      setFileOperationBusy(true);
      setError('');
      try {
        const renamed = await renameCodeEntry(workspacePath, workspaceDialog.entry.path, nextName);
        await loadDirectory(currentPath || workspacePath);
        await refreshGitStatus();
        if (selectedFile && normalizePath(selectedFile.path) === normalizePath(workspaceDialog.entry.path) && renamed.path) {
          const file = await readCodeFile(workspacePath, renamed.path);
          setSelectedFile(file);
          setEditorContent(file.content || '');
          setOriginalContent(file.content || '');
          setShowDiff(false);
        } else if (selectedFile && startsWithPath(selectedFile.path, workspaceDialog.entry.path)) {
          const nextSelectedPath = renamed.path ? selectedFile.path.replace(workspaceDialog.entry.path, renamed.path) : selectedFile.path;
          try {
            const file = await readCodeFile(workspacePath, nextSelectedPath);
            setSelectedFile(file);
            setEditorContent(file.content || '');
            setOriginalContent(file.content || '');
            setShowDiff(false);
          } catch (_) {
            setSelectedFile(null);
            setEditorContent('');
            setOriginalContent('');
            setShowDiff(false);
          }
        }
        setWorkspaceDialog(null);
      } catch (err: any) {
        const message = err?.message || (isZh ? '重命名失败' : 'Failed to rename entry');
        setError(message);
        setWorkspaceDialog(prev => prev && prev.kind === 'rename' ? { ...prev, error: message } : prev);
      } finally {
        setFileOperationBusy(false);
      }
      return;
    }

    if (workspaceDialog.kind === 'delete') {
      setFileOperationBusy(true);
      setError('');
      try {
        await deleteCodeEntry(workspacePath, workspaceDialog.entry.path);
        if (selectedFile && startsWithPath(selectedFile.path, workspaceDialog.entry.path)) {
          setSelectedFile(null);
          setEditorContent('');
          setOriginalContent('');
          setShowDiff(false);
        }
        await loadDirectory(currentPath || workspacePath);
        await refreshGitStatus();
        setWorkspaceDialog(null);
      } catch (err: any) {
        setError(err?.message || (isZh ? '删除失败' : 'Failed to delete entry'));
      } finally {
        setFileOperationBusy(false);
      }
      return;
    }

    if (workspaceDialog.kind === 'restore') {
      setFileOperationBusy(true);
      setError('');
      try {
        const result = await restoreCodeFileFromGit(workspacePath, workspaceDialog.entry.path);
        setCommandHistory(prev => [{
          cwd: gitStatus?.repoRoot || workspacePath,
          command: `git restore -- ${getRelativePath(gitStatus?.repoRoot || workspacePath, workspaceDialog.entry.path)}`,
          output: result.output,
          isError: result.isError,
          durationMs: result.durationMs || 0,
        }, ...prev].slice(0, 12));
        if (result.status) setGitStatus(result.status);
        const file = await readCodeFile(workspacePath, workspaceDialog.entry.path);
        setSelectedFile(file);
        setEditorContent(file.content || '');
        setOriginalContent(file.content || '');
        setShowDiff(false);
        await loadDirectory(currentPath || workspacePath);
        setWorkspaceDialog(null);
      } catch (err: any) {
        setError(err?.message || (isZh ? '恢复失败' : 'Failed to restore file'));
      } finally {
        setFileOperationBusy(false);
      }
    }
  };

  const saveSelectedFile = async () => {
    if (!selectedFile || !isEditableFile || !isDirty || savingFile) return;
    setSavingFile(true);
    setError('');
    try {
      const saved = await saveCodeFile(workspacePath, selectedFile.path, editorContent);
      setOriginalContent(editorContent);
      setShowDiff(false);
      setSelectedFile(prev => prev ? { ...prev, content: editorContent, size: saved.size, mimeType: saved.mimeType, truncated: false } : prev);
      await loadDirectory(currentPath);
      await refreshGitStatus();
    } catch (err: any) {
      setError(err?.message || (isZh ? '保存文件失败' : 'Failed to save file'));
    } finally {
      setSavingFile(false);
    }
  };

  const revertEditorChanges = () => {
    if (!isEditableFile || !isDirty) return;
    setEditorContent(originalContent);
    setShowDiff(false);
  };

  const switchPermission = async (mode: PermissionMode) => {
    setPermissionMode(mode);
    try {
      const config = await updateAgentConfig({ permissionMode: mode });
      setPermissionMode(config.permissionMode || mode);
      window.dispatchEvent(new CustomEvent('agentConfigUpdated', { detail: config }));
    } catch (err: any) {
      setError(err?.message || (isZh ? '切换权限失败' : 'Failed to update permissions'));
    }
  };

  const submitCommand = async (commandOverride?: string) => {
    const trimmed = (commandOverride ?? command).trim();
    if (!trimmed || !workspacePath || runningCommand) return;
    if (isDangerousCommand(trimmed)) {
      const ok = window.confirm(
        isZh
          ? `这条命令可能会删除文件、重置仓库或影响系统：\n\n${trimmed}\n\n确定继续执行吗？`
          : `This command may delete files, reset Git history, or affect the system:\n\n${trimmed}\n\nDo you want to continue?`
      );
      if (!ok) return;
    }
    setRunningCommand(true);
    setError('');
    try {
      const shellPreference = localStorage.getItem('integrated_shell') || 'powershell';
      const timeout = Number(localStorage.getItem('code_command_timeout_ms') || '120000') || 120000;
      const result = await runCodeCommand(workspacePath, trimmed, timeout, shellPreference);
      setCommandHistory(prev => [result, ...prev].slice(0, 12));
      if (!commandOverride) setCommand('');
      await refreshGitStatus();
      await loadDirectory(currentPath);
    } catch (err: any) {
      setError(err?.message || (isZh ? '命令执行失败' : 'Command failed'));
    } finally {
      setRunningCommand(false);
    }
  };

  const runGitAction = async (action: GitAction) => {
    if (!workspacePath || gitBusyAction) return;
    if (action === 'commit' && !commitMessage.trim()) {
      setError(isZh ? '请先填写提交说明' : 'Enter a commit message first');
      return;
    }
    setGitBusyAction(action);
    setError('');
    try {
      const result = await runCodeGitAction(workspacePath, action, commitMessage);
      const historyItems: CodeCommandResult[] = [{
        cwd: gitStatus?.repoRoot || workspacePath,
        command: `git ${gitActionLabel(action, false).toLowerCase()}`,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs || 0,
      }];
      let nextStatus = result.status || null;
      if (action === 'commit' && !result.isError && localStorage.getItem('git_push_after_commit') === '1') {
        const pushResult = await runCodeGitAction(workspacePath, 'push');
        historyItems.unshift({
          cwd: gitStatus?.repoRoot || workspacePath,
          command: 'git push',
          output: pushResult.output,
          isError: pushResult.isError,
          durationMs: pushResult.durationMs || 0,
        });
        if (pushResult.status) nextStatus = pushResult.status;
      }
      setCommandHistory(prev => [...historyItems, ...prev].slice(0, 12));
      if (nextStatus) setGitStatus(nextStatus);
      if (action === 'commit' && !result.isError) setCommitMessage('');
      await loadDirectory(currentPath);
    } catch (err: any) {
      setError(err?.message || (isZh ? 'Git 操作失败' : 'Git action failed'));
    } finally {
      setGitBusyAction(null);
    }
  };

  const openGitStatusFile = async (file: CodeGitFile) => {
    if (!gitStatus?.repoRoot) return;
    const displayPath = getGitDisplayPath(file.path);
    const separator = gitStatus.repoRoot.includes('/') ? '/' : '\\';
    const absolutePath = gitStatus.repoRoot.replace(/[\\/]+$/, '') + separator + displayPath.split('/').join(separator);
    try {
      const loaded = await readCodeFile(workspacePath, absolutePath);
      setSelectedFile(loaded);
      setEditorContent(loaded.content || '');
      setOriginalContent(loaded.content || '');
      setShowDiff(false);
    } catch (err: any) {
      setError(err?.message || (isZh ? '打开 Git 文件失败' : 'Failed to open Git file'));
    }
  };

  const loadGitFileDiff = async (file: CodeGitFile | null) => {
    if (!file || !workspacePath) {
      setGitFileDiff(null);
      return;
    }
    setLoadingGitDiff(true);
    setError('');
    try {
      const diff = await getCodeGitFileDiff(workspacePath, file.path);
      setGitFileDiff(diff);
    } catch (err: any) {
      setGitFileDiff(null);
      setError(err?.message || (isZh ? '读取文件差异失败' : 'Failed to read file diff'));
    } finally {
      setLoadingGitDiff(false);
    }
  };

  const selectGitFile = async (file: CodeGitFile) => {
    setSelectedGitFile(file);
    await loadGitFileDiff(file);
  };

  const runGitFileAction = async (action: GitFileAction, file = selectedGitFile) => {
    if (!workspacePath || !file || gitFileBusyAction) return;
    if (action === 'discard_file') {
      const ok = window.confirm(isZh ? `丢弃 ${getGitDisplayPath(file.path)} 的 Git 改动？这个操作不能撤销。` : `Discard Git changes in ${getGitDisplayPath(file.path)}? This cannot be undone.`);
      if (!ok) return;
    }
    setGitFileBusyAction(action);
    setError('');
    try {
      const result = await runCodeGitFileAction(workspacePath, file.path, action);
      setCommandHistory(prev => [{
        cwd: gitStatus?.repoRoot || workspacePath,
        command: `git ${gitFileActionLabel(action, false).toLowerCase()} -- ${getGitDisplayPath(file.path)}`,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs || 0,
      }, ...prev].slice(0, 12));
      if (result.status) {
        setGitStatus(result.status);
        const refreshedFile = result.status.files.find(item => getGitDisplayPath(item.path) === getGitDisplayPath(file.path)) || null;
        setSelectedGitFile(refreshedFile);
        if (refreshedFile) await loadGitFileDiff(refreshedFile);
        else setGitFileDiff(null);
      } else {
        await refreshGitStatus();
        await loadGitFileDiff(file);
      }
      await loadDirectory(currentPath || workspacePath);
      if (selectedFile && getGitDisplayPath(file.path).replace(/\//g, '\\') === getRelativePath(gitStatus?.repoRoot || workspacePath, selectedFile.path).replace(/\//g, '\\')) {
        try {
          const reloaded = await readCodeFile(workspacePath, selectedFile.path);
          setSelectedFile(reloaded);
          setEditorContent(reloaded.content || '');
          setOriginalContent(reloaded.content || '');
          setShowDiff(false);
        } catch (_) {
          setSelectedFile(null);
          setEditorContent('');
          setOriginalContent('');
          setShowDiff(false);
        }
      }
    } catch (err: any) {
      setError(err?.message || (isZh ? 'Git 文件操作失败' : 'Git file action failed'));
    } finally {
      setGitFileBusyAction(null);
    }
  };

  const renderRawDiff = (diffText: string) => {
    if (!diffText) {
      return (
        <div className="p-3 text-[12px] text-claude-textSecondary">
          {isZh ? '没有可显示的差异。' : 'No diff to show.'}
        </div>
      );
    }
    return (
      <div className="font-mono text-[10px] leading-[18px]">
        {diffText.split(/\r?\n/).slice(0, 900).map((line, index) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isRemove = line.startsWith('-') && !line.startsWith('---');
          const isHunk = line.startsWith('@@');
          const isHeader = line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---');
          return (
            <div
              key={`${index}-${line.slice(0, 12)}`}
              className={`grid grid-cols-[42px_minmax(0,1fr)] px-2 border-b border-claude-border/20 ${
                isAdd
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : isRemove
                    ? 'bg-[#C6613F]/10 text-[#C6613F]'
                    : isHunk
                      ? 'bg-[#2E7CF6]/10 text-[#2E7CF6]'
                      : isHeader
                        ? 'bg-claude-hover/40 text-claude-text'
                        : 'text-claude-textSecondary'
              }`}
            >
              <span className="select-none text-right pr-3 opacity-50">{index + 1}</span>
              <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const goToBreadcrumb = async (index: number) => {
    if (index < 0) {
      await loadDirectory(workspacePath);
      return;
    }
    const separator = workspacePath.includes('/') ? '/' : '\\';
    const target = workspacePath.replace(/[\\/]+$/, '') + separator + breadcrumbParts.slice(0, index + 1).join(separator);
    await loadDirectory(target);
  };

  const treeMenuActions = (() => {
    if (!treeMenu) return [] as Array<{ action: TreeAction; label: string; danger?: boolean }>;
    if (!treeMenu.entry) {
      return [
        { action: 'new_file' as TreeAction, label: isZh ? '新建文件' : 'New file' },
        { action: 'new_folder' as TreeAction, label: isZh ? '新建文件夹' : 'New folder' },
        { action: 'refresh' as TreeAction, label: isZh ? '刷新目录' : 'Refresh' },
        { action: 'copy_path' as TreeAction, label: isZh ? '复制路径' : 'Copy path' },
      ];
    }
    if (treeMenu.entry.type === 'directory') {
      return [
        { action: 'open' as TreeAction, label: isZh ? '打开目录' : 'Open folder' },
        { action: 'new_file' as TreeAction, label: isZh ? '在这里新建文件' : 'New file here' },
        { action: 'new_folder' as TreeAction, label: isZh ? '在这里新建文件夹' : 'New folder here' },
        { action: 'rename' as TreeAction, label: isZh ? '重命名' : 'Rename' },
        { action: 'copy_path' as TreeAction, label: isZh ? '复制路径' : 'Copy path' },
        { action: 'delete' as TreeAction, label: isZh ? '删除' : 'Delete', danger: true },
      ];
    }
    return [
      { action: 'open' as TreeAction, label: isZh ? '打开文件' : 'Open file' },
      { action: 'rename' as TreeAction, label: isZh ? '重命名' : 'Rename' },
      { action: 'copy_path' as TreeAction, label: isZh ? '复制路径' : 'Copy path' },
      { action: 'delete' as TreeAction, label: isZh ? '删除' : 'Delete', danger: true },
    ];
  })();
  const renderGitStatus = () => {
    if (!workspacePath) return null;
    if (!gitStatus) {
      return (
        <div className="rounded-md border border-claude-border bg-claude-input p-3 text-[12px] text-claude-textSecondary">
          {isZh ? 'Git 状态尚未读取。' : 'Git status has not loaded yet.'}
        </div>
      );
    }
    if (!gitStatus.isRepo) {
      return (
        <div className="rounded-md border border-claude-border bg-claude-input p-3 text-[12px] leading-5 text-claude-textSecondary">
          <div className="font-medium text-claude-text mb-1">{isZh ? '不是 Git 仓库' : 'Not a Git repository'}</div>
          <div>{isZh ? '当前工作区没有检测到 .git。你仍然可以编辑文件和运行命令。' : 'No .git folder was detected. You can still edit files and run commands.'}</div>
        </div>
      );
    }

    const stagedFiles = gitStatus.files.filter((file) => file.staged);
    const unstagedFiles = gitStatus.files.filter((file) => file.unstaged || file.code === '??');
    const renderGroup = (title: string, files: CodeGitFile[], emptyText: string) => (
      <div className="rounded-md border border-claude-border bg-claude-input overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-claude-border bg-claude-hover/30">
          <span className="text-[11px] font-medium text-claude-text">{title}</span>
          <span className="text-[10px] text-claude-textSecondary">{files.length}</span>
        </div>
        {files.length === 0 ? (
          <div className="p-3 text-[12px] text-claude-textSecondary">{emptyText}</div>
        ) : (
          <div className="max-h-[144px] overflow-auto">
            {files.map((file, index) => {
              const selected = selectedGitFile?.path === file.path;
              return (
                <button
                  key={`${title}-${file.code}-${file.path}-${index}`}
                  onClick={() => selectGitFile(file)}
                  className={`w-full min-h-8 px-3 border-b border-claude-border/40 last:border-b-0 flex items-center gap-2 text-left text-[12px] hover:bg-claude-hover ${
                    selected ? 'bg-claude-hover text-claude-text' : ''
                  }`}
                >
                  <span className={`w-8 shrink-0 font-mono ${file.code === '??' ? 'text-[#2E7CF6]' : file.code.startsWith('A') ? 'text-emerald-400' : 'text-[#C6613F]'}`}>
                    {file.code}
                  </span>
                  <span className="truncate flex-1 text-claude-textSecondary">{getGitDisplayPath(file.path)}</span>
                  {file.staged && <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400">S</span>}
                  {file.unstaged && <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#C6613F]/30 text-[#C6613F]">U</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-2">
        <div className="rounded-md border border-claude-border bg-claude-input p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <GitBranch size={14} className="text-claude-textSecondary" />
              <span className="text-[13px] font-medium truncate">{gitStatus.branch}</span>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-md border ${gitStatus.clean ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : 'border-[#C6613F]/30 text-[#C6613F] bg-[#C6613F]/10'}`}>
              {gitStatus.clean ? (isZh ? '干净' : 'clean') : gitStatus.summary}
            </span>
          </div>
          {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <div className="mt-2 text-[11px] text-claude-textSecondary">
              {gitStatus.ahead > 0 && <span>{isZh ? `领先 ${gitStatus.ahead}` : `ahead ${gitStatus.ahead}`}</span>}
              {gitStatus.ahead > 0 && gitStatus.behind > 0 && <span> · </span>}
              {gitStatus.behind > 0 && <span>{isZh ? `落后 ${gitStatus.behind}` : `behind ${gitStatus.behind}`}</span>}
            </div>
          )}
        </div>

        {renderGroup(isZh ? '未暂存' : 'Unstaged', unstagedFiles, isZh ? '没有未暂存改动。' : 'No unstaged changes.')}
        {renderGroup(isZh ? '已暂存' : 'Staged', stagedFiles, isZh ? '没有已暂存改动。' : 'No staged changes.')}

        {selectedGitFile && (
          <div className="rounded-md border border-claude-border bg-claude-input overflow-hidden">
            <div className="px-3 py-2 border-b border-claude-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-medium truncate">{getGitDisplayPath(selectedGitFile.path)}</div>
                <div className="text-[10px] text-claude-textSecondary">{isZh ? '单文件 Git 差异' : 'Single-file Git diff'}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openGitStatusFile(selectedGitFile)} className="h-7 px-2 rounded-md border border-claude-border text-[11px] hover:bg-claude-hover">
                  {isZh ? '打开' : 'Open'}
                </button>
                <button
                  onClick={() => runGitFileAction('stage_file', selectedGitFile)}
                  disabled={!!gitFileBusyAction || (!selectedGitFile.unstaged && selectedGitFile.code !== '??')}
                  className="h-7 px-2 rounded-md border border-claude-border text-[11px] hover:bg-claude-hover disabled:opacity-40"
                >
                  {gitFileBusyAction === 'stage_file' ? (isZh ? '处理中' : 'Working') : gitFileActionLabel('stage_file', isZh)}
                </button>
                <button
                  onClick={() => runGitFileAction('unstage_file', selectedGitFile)}
                  disabled={!!gitFileBusyAction || !selectedGitFile.staged}
                  className="h-7 px-2 rounded-md border border-claude-border text-[11px] hover:bg-claude-hover disabled:opacity-40"
                >
                  {gitFileBusyAction === 'unstage_file' ? (isZh ? '处理中' : 'Working') : gitFileActionLabel('unstage_file', isZh)}
                </button>
                <button
                  onClick={() => runGitFileAction('discard_file', selectedGitFile)}
                  disabled={!!gitFileBusyAction}
                  className="h-7 px-2 rounded-md border border-[#C6613F]/40 text-[#C6613F] text-[11px] hover:bg-[#C6613F]/10 disabled:opacity-40"
                >
                  {gitFileBusyAction === 'discard_file' ? (isZh ? '处理中' : 'Working') : gitFileActionLabel('discard_file', isZh)}
                </button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-auto bg-claude-bg">
              {loadingGitDiff ? (
                <div className="p-3 text-[12px] text-claude-textSecondary">{isZh ? '正在读取差异...' : 'Reading diff...'}</div>
              ) : (
                <div className="space-y-3 p-3">
                  {!!gitFileDiff?.unstagedDiff && (
                    <div className="rounded-md border border-[#C6613F]/20 overflow-hidden">
                      <div className="px-3 py-2 text-[11px] font-medium bg-[#C6613F]/10 text-[#C6613F]">{isZh ? '工作区改动' : 'Working tree'}</div>
                      <div className="max-h-[180px] overflow-auto bg-claude-bg">{renderRawDiff(gitFileDiff.unstagedDiff)}</div>
                    </div>
                  )}
                  {!!gitFileDiff?.stagedDiff && (
                    <div className="rounded-md border border-emerald-500/20 overflow-hidden">
                      <div className="px-3 py-2 text-[11px] font-medium bg-emerald-500/10 text-emerald-400">{isZh ? '暂存区改动' : 'Staged changes'}</div>
                      <div className="max-h-[180px] overflow-auto bg-claude-bg">{renderRawDiff(gitFileDiff.stagedDiff)}</div>
                    </div>
                  )}
                  {!gitFileDiff?.stagedDiff && !gitFileDiff?.unstagedDiff && renderRawDiff(gitFileDiff?.diff || '')}
                </div>
              )}
            </div>
          </div>
        )}

        {!selectedGitFile && gitStatus.diffStat && (
          <pre className="m-0 max-h-[92px] overflow-auto rounded-md border border-claude-border bg-claude-input p-2 text-[10px] leading-4 text-claude-textSecondary">
            {gitStatus.diffStat}
          </pre>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => runGitAction('pull')} disabled={!!gitBusyAction} className="h-8 rounded-md border border-claude-border text-[12px] flex items-center justify-center gap-1.5 hover:bg-claude-hover disabled:opacity-50">
            <Download size={13} />
            {gitBusyAction === 'pull' ? (isZh ? '拉取中' : 'Pulling') : gitActionLabel('pull', isZh)}
          </button>
          <button onClick={() => runGitAction('stage_all')} disabled={!!gitBusyAction || gitStatus.clean} className="h-8 rounded-md border border-claude-border text-[12px] flex items-center justify-center gap-1.5 hover:bg-claude-hover disabled:opacity-50">
            <Check size={13} />
            {gitBusyAction === 'stage_all' ? (isZh ? '暂存中' : 'Staging') : gitActionLabel('stage_all', isZh)}
          </button>
        </div>
        <input
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={isZh ? '提交说明，例如：完善 Code 工作区' : 'Commit message, e.g. Improve Code workspace'}
          className="w-full h-8 rounded-md border border-claude-border bg-claude-input px-2 text-[12px] outline-none focus:border-[#2E7CF6]/70"
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => runGitAction('commit')} disabled={!!gitBusyAction || !commitMessage.trim()} className="h-8 rounded-md bg-claude-text text-claude-bg text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Save size={13} />
            {gitBusyAction === 'commit' ? (isZh ? '提交中' : 'Committing') : gitActionLabel('commit', isZh)}
          </button>
          <button onClick={() => runGitAction('push')} disabled={!!gitBusyAction} className="h-8 rounded-md border border-claude-border text-[12px] flex items-center justify-center gap-1.5 hover:bg-claude-hover disabled:opacity-50">
            <Upload size={13} />
            {gitBusyAction === 'push' ? (isZh ? '推送中' : 'Pushing') : gitActionLabel('push', isZh)}
          </button>
        </div>
      </div>
    );
  };
  return (
    <div className="h-full bg-claude-bg text-claude-text overflow-hidden">
      <div className="h-full flex flex-col">
        <div className="h-[52px] border-b border-claude-border flex items-center justify-between px-5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-claude-textSecondary" />
              <h1 className="text-[16px] font-semibold">{isZh ? '代码工作区' : 'Code workspace'}</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-md border border-claude-border text-claude-textSecondary">
                {isZh ? '本地模式' : 'Local mode'}
              </span>
            </div>
            <div className="text-[12px] text-claude-textSecondary mt-1 truncate max-w-[760px]">
              {workspacePath || (isZh ? '选择一个本地文件夹，开始浏览、编辑和运行命令' : 'Choose a local folder to browse, edit, and run commands')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['workspace_write', 'project', 'full_access'] as PermissionMode[]).map(mode => {
              const copy = getPermissionCopy(mode, isZh);
              const active = permissionMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => switchPermission(mode)}
                  title={copy.desc}
                  className={`h-8 px-3 rounded-md border text-[12px] flex items-center gap-1.5 transition-colors ${
                    active ? copy.tone : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'
                  }`}
                >
                  <Shield size={13} />
                  {copy.label}
                  {active && <Check size={13} />}
                </button>
              );
            })}
            <button onClick={chooseWorkspace} className="h-8 px-3 rounded-md bg-claude-text text-claude-bg text-[12px] font-medium hover:opacity-90">
              {isZh ? '选择工作区' : 'Choose workspace'}
            </button>
          </div>
        </div>

        {workspacePath && (
          <div className="h-9 border-b border-claude-border bg-claude-surface/35 px-5 shrink-0 flex items-center justify-between gap-3 text-[11px] text-claude-textSecondary">
            <div className="min-w-0 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-claude-border bg-claude-input px-2 py-1">
                <FolderOpen size={12} />
                <span className="truncate max-w-[320px]">{workspacePath}</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                gitStatus?.isRepo
                  ? gitStatus.clean
                    ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10'
                    : 'border-[#C6613F]/30 text-[#C6613F] bg-[#C6613F]/10'
                  : 'border-claude-border bg-claude-input'
              }`}>
                <GitBranch size={12} />
                {gitStatus?.isRepo
                  ? gitStatus.clean
                    ? (isZh ? 'Git 干净' : 'Git clean')
                    : (isZh ? '有未提交改动' : 'Uncommitted changes')
                  : (isZh ? '未检测到 Git' : 'No Git repo')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-claude-border bg-claude-input px-2 py-1">
                <Terminal size={12} />
                {isZh ? `最近命令 ${recentCommands.length}` : `${recentCommands.length} recent commands`}
              </span>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <span>{getPermissionCopy(permissionMode, isZh).label}</span>
              <span className="opacity-40">/</span>
              <span>{localStorage.getItem('git_push_after_commit') === '1' ? (isZh ? '提交后自动推送' : 'Auto-push after commit') : (isZh ? '手动推送' : 'Manual push')}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md border border-[#C6613F]/30 bg-[#C6613F]/10 text-[#C6613F] text-[12px] flex items-center gap-2 shrink-0">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {!workspacePath ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="max-w-[520px] text-center">
              <div className="mx-auto w-14 h-14 rounded-lg border border-claude-border flex items-center justify-center text-claude-textSecondary mb-5">
                <FolderOpen size={26} />
              </div>
              <h2 className="text-[22px] font-semibold mb-2">{isZh ? '先选择一个项目文件夹' : 'Start with a project folder'}</h2>
              <p className="text-[14px] leading-6 text-claude-textSecondary mb-5">
                {isZh
                  ? '这里会成为 Code 模式的工作区。默认权限把操作限制在这个目录内；完全访问权限允许命令执行和更宽的文件访问。'
                  : 'This folder becomes the Code workspace. Default mode keeps operations inside it; full access allows commands and wider file access.'}
              </p>
              <button onClick={chooseWorkspace} className="h-9 px-4 rounded-md bg-claude-text text-claude-bg text-[13px] font-medium hover:opacity-90">
                {isZh ? '选择文件夹' : 'Choose folder'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_380px]">
            <aside className="border-r border-claude-border min-h-0 flex flex-col">
              <div className="h-[42px] px-3 border-b border-claude-border flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5 text-[12px] text-claude-textSecondary">
                  <button onClick={() => goToBreadcrumb(-1)} className="hover:text-claude-text transition-colors truncate max-w-[88px]">
                    {workspacePath.split(/[\\/]/).filter(Boolean).pop() || workspacePath}
                  </button>
                  {breadcrumbParts.map((part, index) => (
                    <React.Fragment key={`${part}-${index}`}>
                      <ChevronRight size={12} />
                      <button onClick={() => goToBreadcrumb(index)} className="hover:text-claude-text transition-colors truncate max-w-[84px]">
                        {part}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openCreateDialog('file')} disabled={fileOperationBusy} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-50" title={isZh ? '新建文件' : 'New file'}>
                    <FilePlus size={14} />
                  </button>
                  <button onClick={() => openCreateDialog('directory')} disabled={fileOperationBusy} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-50" title={isZh ? '新建文件夹' : 'New folder'}>
                    <FolderPlus size={14} />
                  </button>
                  <button onClick={() => loadDirectory(currentPath)} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '刷新' : 'Refresh'}>
                    <RefreshCw size={14} className={loadingTree ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" onContextMenu={(event) => openTreeMenu(event, null)}>
                {parentPath && (
                  <button onClick={() => loadDirectory(parentPath)} className="w-full h-8 px-2 rounded-md flex items-center gap-2 text-left text-[13px] text-claude-textSecondary hover:bg-claude-hover mb-1">
                    <Folder size={15} />
                    ..
                  </button>
                )}
                {entries.map((entry) => {
                  const active = selectedFile?.path === entry.path;
                  return (
                    <div
                      key={entry.path}
                      onContextMenu={(event) => openTreeMenu(event, entry)}
                      className={`group mb-1 flex items-center gap-1 rounded-md border ${active ? 'border-[#2E7CF6]/30 bg-claude-hover text-claude-text' : 'border-transparent text-claude-textSecondary hover:bg-claude-hover'}`}
                    >
                      <button
                        onClick={() => openEntry(entry)}
                        className="flex min-h-8 flex-1 items-center gap-2 px-2 text-left text-[13px]"
                      >
                        {entry.type === 'directory' ? <Folder size={15} className="shrink-0" /> : <File size={15} className="shrink-0" />}
                        <span className="truncate flex-1">{entry.name}</span>
                        {entry.type === 'file' && <span className="text-[10px] opacity-60">{formatBytes(entry.size)}</span>}
                      </button>
                      <button
                        onClick={(event) => openTreeMenu(event, entry)}
                        className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-claude-textSecondary opacity-0 transition-opacity hover:bg-claude-bg/70 group-hover:opacity-100"
                        title={isZh ? '更多操作' : 'More actions'}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  );
                })}
                {entries.length === 0 && !loadingTree && (
                  <div className="text-[12px] text-claude-textSecondary px-2 py-6 text-center">
                    {isZh ? '这个目录是空的' : 'This folder is empty'}
                  </div>
                )}
              </div>
            </aside>
            <main className="min-w-0 min-h-0 flex flex-col">
              <div className="h-[42px] px-4 border-b border-claude-border flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate flex items-center gap-2">
                    <span>{selectedFile ? selectedFile.name : (isZh ? '文件预览' : 'File preview')}</span>
                    {isDirty && <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#C6613F]/30 text-[#C6613F]">{isZh ? '未保存' : 'Unsaved'}</span>}
                  </div>
                  <div className="text-[11px] text-claude-textSecondary truncate">
                    {selectedFile ? getRelativePath(workspacePath, selectedFile.path) : (isZh ? '从左侧选择一个文件' : 'Select a file from the left')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFile && (
                    <>
                      <span className="text-[11px] text-claude-textSecondary">{formatBytes(selectedFile.size)}</span>
                      {isEditableFile && (
                        <button onClick={() => setShowDiff(prev => !prev)} disabled={!isDirty} className={`p-1.5 rounded-md hover:bg-claude-hover disabled:opacity-40 disabled:cursor-not-allowed ${showDiff ? 'text-[#2E7CF6]' : 'text-claude-textSecondary'}`} title={isZh ? '差异预览' : 'Diff preview'}>
                          <GitCompare size={14} />
                        </button>
                      )}
                      {isEditableFile && (
                        <button onClick={revertEditorChanges} disabled={!isDirty} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-40 disabled:cursor-not-allowed" title={isZh ? '撤销当前文件未保存修改' : 'Discard unsaved changes'}>
                          <Undo2 size={14} />
                        </button>
                      )}
                      {gitStatus?.isRepo && (
                        <button onClick={() => selectedFileEntry && openRestoreDialog(selectedFileEntry)} disabled={fileOperationBusy} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-40 disabled:cursor-not-allowed" title={isZh ? '从 Git 恢复这个文件' : 'Restore this file from Git'}>
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button onClick={() => selectedFileEntry && openRenameDialog(selectedFileEntry)} disabled={fileOperationBusy} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-40 disabled:cursor-not-allowed" title={isZh ? '重命名文件' : 'Rename file'}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => selectedFileEntry && openDeleteDialog(selectedFileEntry)} disabled={fileOperationBusy} className="p-1.5 rounded-md hover:bg-claude-hover text-[#C6613F] disabled:opacity-40 disabled:cursor-not-allowed" title={isZh ? '删除文件' : 'Delete file'}>
                        <Trash2 size={14} />
                      </button>
                      <button onClick={() => copyToClipboard(selectedFile.binary ? selectedFile.path : editorContent)} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '复制内容' : 'Copy content'}>
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={saveSelectedFile}
                        disabled={!isDirty || savingFile}
                        className="h-7 px-2 rounded-md bg-claude-text text-claude-bg text-[12px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save size={13} />
                        {savingFile ? (isZh ? '保存中' : 'Saving') : (isZh ? '保存' : 'Save')}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {loadingFile ? (
                  <div className="h-full flex items-center justify-center text-[13px] text-claude-textSecondary">
                    {isZh ? '读取文件中...' : 'Reading file...'}
                  </div>
                ) : selectedFile ? (
                  selectedFile.binary ? (
                    <div className="h-full flex items-center justify-center px-8">
                      <div className="text-center max-w-[420px]">
                        <File size={30} className="mx-auto text-claude-textSecondary mb-3" />
                        <div className="text-[15px] font-medium mb-1">{isZh ? '二进制文件' : 'Binary file'}</div>
                        <p className="text-[13px] text-claude-textSecondary leading-6">
                          {isZh ? '这个文件不会在预览区展开。图片、PDF 等专门查看器可以放到后续版本。' : 'This file is not expanded in the preview. Image/PDF viewers can be added next.'}
                        </p>
                      </div>
                    </div>
                  ) : selectedFile.truncated ? (
                    <pre className="m-0 h-full overflow-auto p-4 text-[12px] leading-[1.55] font-mono whitespace-pre-wrap break-words text-claude-text">
                      {editorContent}
                      {'\n\n... file truncated at 1 MB; editing is disabled for safety.'}
                    </pre>
                  ) : showDiff ? (
                    <div className="h-full overflow-auto bg-claude-bg">
                      <div className="sticky top-0 z-10 h-9 px-4 border-b border-claude-border bg-claude-bg/95 backdrop-blur flex items-center justify-between text-[12px]">
                        <span className="text-claude-textSecondary">{isZh ? '差异预览' : 'Diff preview'}</span>
                        <span className="text-claude-textSecondary">{changedDiffLines === 0 ? (isZh ? '没有差异' : 'No changes') : `${changedDiffLines} ${isZh ? '处变化' : 'changed lines'}`}</span>
                      </div>
                      <div className="font-mono text-[11px] leading-5">
                        {diffLines.map((line, index) => (
                          <div
                            key={`${line.type}-${index}`}
                            className={`grid grid-cols-[48px_48px_24px_minmax(0,1fr)] px-3 border-b border-claude-border/30 ${
                              line.type === 'add'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : line.type === 'remove'
                                  ? 'bg-[#C6613F]/10 text-[#C6613F]'
                                  : 'text-claude-textSecondary'
                            }`}
                          >
                            <span className="select-none text-right pr-3 opacity-60">{line.oldLine ?? ''}</span>
                            <span className="select-none text-right pr-3 opacity-60">{line.newLine ?? ''}</span>
                            <span className="select-none opacity-70">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
                            <span className="whitespace-pre-wrap break-words text-claude-text">{line.text || ' '}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                          e.preventDefault();
                          saveSelectedFile();
                        }
                      }}
                      spellCheck={false}
                      className="w-full h-full resize-none bg-transparent p-4 text-[12px] leading-[1.55] font-mono text-claude-text outline-none"
                    />
                  )
                ) : (
                  <div className="h-full flex items-center justify-center px-8">
                    <div className="text-center max-w-[440px]">
                      <File size={30} className="mx-auto text-claude-textSecondary mb-3" />
                      <div className="text-[15px] font-medium mb-1">{isZh ? '预览并编辑代码文件' : 'Preview and edit code files'}</div>
                      <p className="text-[13px] text-claude-textSecondary leading-6">
                        {isZh ? '这已经是 Code 模式的第二层：文件树、编辑保存、Git 状态和命令面板都集中在一个工作区里。' : 'This is the second Code layer: file tree, editing, Git status, and command output in one workspace.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </main>

            <aside className="border-l border-claude-border min-h-0 flex flex-col">
              <div className="h-[42px] px-4 border-b border-claude-border flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">{isZh ? '工作区控制台' : 'Workspace console'}</div>
                  <div className="text-[11px] text-claude-textSecondary">{isZh ? 'Git 与命令输出' : 'Git and command output'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => refreshGitStatus()} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '刷新 Git' : 'Refresh Git'}>
                    <RefreshCw size={14} className={loadingGit ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={openWorkspaceFolder} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '在资源管理器打开' : 'Open in Explorer'}>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>

              <div className="p-3 border-b border-claude-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-medium">{isZh ? 'Git 状态' : 'Git status'}</div>
                  <div className="text-[10px] text-claude-textSecondary truncate max-w-[190px]">
                    {gitStatus?.repoRoot ? getRelativePath(workspacePath, gitStatus.repoRoot) : ''}
                  </div>
                </div>
                {renderGitStatus()}
              </div>

              <div className="p-3 border-b border-claude-border">
                <div className={`mb-2 rounded-md border px-3 py-2 text-[12px] leading-5 ${permissionMode === 'full_access' ? 'border-[#C6613F]/30 bg-[#C6613F]/10 text-[#C6613F]' : permissionMode === 'project' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-claude-border bg-claude-input text-claude-textSecondary'}` }>
                  {getPermissionCopy(permissionMode, isZh).desc}
                </div>
                <div className="mb-2 rounded-md border border-claude-border bg-claude-input px-3 py-2 text-[11px] leading-5 text-claude-textSecondary">
                  {isZh
                    ? '这里是命令控制台，不是聊天输入框。适合输入 dir、git status、npm test 这类终端命令；如果想让模型分析代码，请回到“聊天”页并把工作区内容附加进去。'
                    : 'This is the command console, not a chat box. Use it for commands like dir, git status, or npm test. If you want model analysis, go back to Chat and attach workspace context there.'}
                </div>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitCommand();
                  }}
                  placeholder={isZh ? '输入命令，例如：dir 或 npm test' : 'Enter a command, e.g. dir or npm test'}
                  className="w-full h-20 resize-none rounded-md border border-claude-border bg-claude-input px-3 py-2 text-[12px] font-mono outline-none focus:border-[#2E7CF6]/70"
                />
                <div className="mt-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-claude-textSecondary">{isZh ? '常用命令' : 'Quick commands'}</span>
                    <span className="text-[10px] text-claude-textSecondary">
                      {localStorage.getItem('integrated_shell') || 'powershell'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {commandQuickActions.map((item) => (
                      <button
                        key={item.command}
                        type="button"
                        onClick={() => setCommand(item.command)}
                        disabled={permissionMode === 'workspace_write'}
                        className="min-h-8 rounded-md border border-claude-border bg-claude-input px-2 py-1 text-left hover:bg-claude-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        title={`${item.desc}: ${item.command}`}
                      >
                        <div className="text-[11px] text-claude-text truncate">{item.label}</div>
                        <div className="text-[10px] text-claude-textSecondary font-mono truncate">{item.command}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {recentCommands.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-claude-textSecondary">{isZh ? '最近命令' : 'Recent commands'}</div>
                    <div className="space-y-1.5">
                      {recentCommands.map((item) => (
                        <div key={item} className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCommand(item)}
                            className="min-w-0 flex-1 h-7 rounded-md border border-claude-border bg-claude-input px-2 text-left text-[11px] text-claude-textSecondary hover:bg-claude-hover truncate"
                            title={item}
                          >
                            {item}
                          </button>
                          <button
                            onClick={() => submitCommand(item)}
                            disabled={runningCommand || permissionMode === 'workspace_write'}
                            className="h-7 w-8 shrink-0 rounded-md border border-claude-border text-claude-textSecondary hover:bg-claude-hover disabled:opacity-40"
                            title={isZh ? '重新执行' : 'Run again'}
                          >
                            <Play size={12} className="mx-auto" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={submitCommand}
                  disabled={!command.trim() || runningCommand || permissionMode === 'workspace_write'}
                  className="mt-2 h-8 w-full rounded-md bg-claude-text text-claude-bg text-[12px] font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={13} />
                  {permissionMode === 'workspace_write'
                    ? (isZh ? '切到项目权限后可执行命令' : 'Switch to Project to run commands')
                    : runningCommand
                      ? (isZh ? '执行中...' : 'Running...')
                      : (isZh ? '执行命令 Ctrl+Enter' : 'Run command Ctrl+Enter')}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {commandHistory.length === 0 ? (
                  <div className="text-[12px] text-claude-textSecondary leading-6">
                    {isZh ? '命令和 Git 操作结果会显示在这里。' : 'Command and Git action output appears here.'}
                  </div>
                ) : commandHistory.map((item, index) => (
                  <div key={`${item.command}-${index}`} className="rounded-md border border-claude-border bg-claude-input overflow-hidden">
                    <div className="px-3 py-2 border-b border-claude-border space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-[11px] truncate text-claude-text">{item.command}</code>
                        <span className={`text-[10px] shrink-0 ${item.isError ? 'text-[#C6613F]' : 'text-claude-textSecondary'}`}>
                          {item.timedOut ? (isZh ? '超时' : 'timeout') : item.isError ? (isZh ? '错误' : 'error') : 'ok'} · {formatDuration(item.durationMs)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-claude-textSecondary">
                        {item.shell && <span className="rounded border border-claude-border px-1.5 py-0.5">{item.shell}</span>}
                        {typeof item.exitCode === 'number' && <span className="rounded border border-claude-border px-1.5 py-0.5">exit {item.exitCode}</span>}
                        {item.permissionMode && <span className="rounded border border-claude-border px-1.5 py-0.5">{getPermissionCopy(item.permissionMode as PermissionMode, isZh).label}</span>}
                        <span className="truncate">{item.cwd}</span>
                      </div>
                    </div>
                    <pre className="m-0 p-3 text-[11px] leading-5 font-mono whitespace-pre-wrap break-words text-claude-textSecondary max-h-[220px] overflow-auto">
                      {item.output || (isZh ? '命令没有输出。' : 'The command produced no output.')}
                    </pre>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
      {workspaceDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 backdrop-blur-sm px-4" onClick={closeWorkspaceDialog}>
          <div
            className="w-full max-w-[460px] rounded-2xl border border-claude-border bg-claude-bg shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-claude-border">
              <div>
                <div className="text-[18px] font-semibold text-claude-text">
                  {workspaceDialog.kind === 'create'
                    ? (workspaceDialog.entryType === 'file' ? (isZh ? '新建文件' : 'New file') : (isZh ? '新建文件夹' : 'New folder'))
                    : workspaceDialog.kind === 'rename'
                      ? (isZh ? '重命名' : 'Rename')
                      : workspaceDialog.kind === 'delete'
                        ? (isZh ? '删除条目' : 'Delete entry')
                        : (isZh ? '从 Git 恢复' : 'Restore from Git')}
                </div>
                <div className="mt-1 text-[13px] leading-6 text-claude-textSecondary">
                  {workspaceDialog.kind === 'create'
                    ? (isZh
                        ? `将在 ${getRelativePath(workspacePath, workspaceDialog.parentPath)} 中创建${workspaceDialog.entryType === 'file' ? '文件' : '文件夹'}。`
                        : `Create a ${workspaceDialog.entryType === 'file' ? 'file' : 'folder'} in ${getRelativePath(workspacePath, workspaceDialog.parentPath)}.`)
                    : workspaceDialog.kind === 'rename'
                      ? (isZh ? `正在重命名 ${workspaceDialog.entry.name}` : `Rename ${workspaceDialog.entry.name}`)
                      : workspaceDialog.kind === 'delete'
                        ? (isZh ? `删除 ${workspaceDialog.entry.name} 后将无法自动恢复。` : `Deleting ${workspaceDialog.entry.name} cannot be automatically undone.`)
                        : (isZh ? `会丢弃 ${workspaceDialog.entry.name} 当前未提交的 Git 改动。` : `This will discard uncommitted Git changes in ${workspaceDialog.entry.name}.`)}
                </div>
              </div>
              <button onClick={closeWorkspaceDialog} className="p-1.5 rounded-md text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text">
                <X size={16} />
              </button>
            </div>

            {(workspaceDialog.kind === 'create' || workspaceDialog.kind === 'rename') ? (
              <div className="px-6 py-5">
                <input
                  autoFocus
                  value={workspaceDialog.value}
                  onChange={(event) => setWorkspaceDialog((prev) => {
                    if (!prev || (prev.kind !== 'create' && prev.kind !== 'rename')) return prev;
                    return { ...prev, value: event.target.value, error: '' };
                  })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitWorkspaceDialog();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeWorkspaceDialog();
                    }
                  }}
                  placeholder={workspaceDialog.kind === 'create'
                    ? (workspaceDialog.entryType === 'file' ? (isZh ? '例如：index.ts' : 'For example: index.ts') : (isZh ? '例如：components' : 'For example: components'))
                    : (isZh ? '输入新的名称' : 'Enter a new name')}
                  className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none focus:border-[#2E7CF6]/70"
                />
                {workspaceDialog.error && (
                  <div className="mt-3 text-[12px] text-[#C6613F]">{workspaceDialog.error}</div>
                )}
              </div>
            ) : (
              <div className="px-6 py-5">
                <div className={`rounded-xl border px-4 py-3 text-[13px] leading-6 ${
                  workspaceDialog.kind === 'delete'
                    ? 'border-[#C6613F]/30 bg-[#C6613F]/10 text-[#C6613F]'
                    : 'border-[#2E7CF6]/30 bg-[#2E7CF6]/10 text-claude-text'
                }`}>
                  {workspaceDialog.kind === 'delete'
                    ? (isZh ? '确认后会立即删除该文件或文件夹。' : 'This will delete the file or folder immediately.')
                    : (isZh ? '确认后会用 Git 版本覆盖当前文件内容。' : 'This will replace the current file with the Git version.')}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-claude-border bg-claude-input/40">
              <button
                onClick={closeWorkspaceDialog}
                className="h-9 px-4 rounded-xl border border-claude-border text-[13px] text-claude-textSecondary hover:bg-claude-hover"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitWorkspaceDialog}
                disabled={fileOperationBusy}
                className={`h-9 px-4 rounded-xl text-[13px] font-medium disabled:opacity-50 ${
                  workspaceDialog.kind === 'delete'
                    ? 'bg-[#C6613F] text-white'
                    : workspaceDialog.kind === 'restore'
                      ? 'bg-[#2E7CF6] text-white'
                      : 'bg-claude-text text-claude-bg'
                }`}
              >
                {fileOperationBusy
                  ? (isZh ? '处理中...' : 'Working...')
                  : workspaceDialog.kind === 'create'
                    ? (isZh ? '创建' : 'Create')
                    : workspaceDialog.kind === 'rename'
                      ? (isZh ? '保存名称' : 'Save name')
                      : workspaceDialog.kind === 'delete'
                        ? (isZh ? '确认删除' : 'Delete now')
                        : (isZh ? '确认恢复' : 'Restore now')}
              </button>
            </div>
          </div>
        </div>
      )}

      {treeMenu && (
        <div
          ref={treeMenuRef}
          className="fixed z-[90] min-w-[188px] rounded-md border border-claude-border bg-[#1B1917] p-1 shadow-[0_12px_48px_rgba(0,0,0,0.4)]"
          style={{
            left: Math.min(treeMenu.x, window.innerWidth - 220),
            top: Math.min(treeMenu.y, window.innerHeight - 260),
          }}
        >
          {treeMenuActions.map((item) => (
            <button
              key={`${treeMenu.entry?.path || 'workspace'}-${item.action}`}
              onClick={() => handleTreeAction(item.action, treeMenu.entry)}
              className={`flex h-8 w-full items-center rounded-md px-3 text-left text-[12px] ${item.danger ? 'text-[#C6613F] hover:bg-[#C6613F]/10' : 'text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CodePage;
