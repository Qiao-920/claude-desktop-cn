import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  GitBranch,
  Play,
  RefreshCw,
  Save,
  Shield,
  Terminal,
  Upload,
} from 'lucide-react';
import {
  CodeCommandResult,
  CodeFileResult,
  CodeGitStatusResult,
  CodeWorkspaceEntry,
  getAgentConfig,
  getCodeGitStatus,
  listCodeWorkspace,
  readCodeFile,
  runCodeCommand,
  runCodeGitAction,
  saveCodeFile,
  updateAgentConfig,
} from '../api';
import { getStoredUiLanguage } from '../utils/chineseClientText';
import { copyToClipboard } from '../utils/clipboard';

type PermissionMode = 'workspace_write' | 'full_access';
type GitAction = 'pull' | 'stage_all' | 'commit' | 'push';

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
  const [commitMessage, setCommitMessage] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('full_access');
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [runningCommand, setRunningCommand] = useState(false);
  const [loadingGit, setLoadingGit] = useState(false);
  const [gitBusyAction, setGitBusyAction] = useState<GitAction | null>(null);
  const [error, setError] = useState('');

  const relativeCurrentPath = useMemo(() => getRelativePath(workspacePath, currentPath || workspacePath), [workspacePath, currentPath]);
  const breadcrumbParts = useMemo(() => splitPath(relativeCurrentPath === '.' ? '' : relativeCurrentPath), [relativeCurrentPath]);
  const isEditableFile = !!selectedFile && !selectedFile.binary && !selectedFile.truncated;
  const isDirty = isEditableFile && editorContent !== originalContent;

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
      localStorage.setItem('code_workspace_path', result.workspacePath);
    } catch (err: any) {
      setError(err?.message || (isZh ? '读取工作区失败' : 'Failed to read workspace'));
    } finally {
      setLoadingTree(false);
    }
  }, [currentPath, isZh, workspacePath]);

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
    localStorage.setItem('code_workspace_path', dir);
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
    } catch (err: any) {
      setError(err?.message || (isZh ? '读取文件失败' : 'Failed to read file'));
    } finally {
      setLoadingFile(false);
    }
  };

  const saveSelectedFile = async () => {
    if (!selectedFile || !isEditableFile || !isDirty || savingFile) return;
    setSavingFile(true);
    setError('');
    try {
      const saved = await saveCodeFile(workspacePath, selectedFile.path, editorContent);
      setOriginalContent(editorContent);
      setSelectedFile(prev => prev ? { ...prev, content: editorContent, size: saved.size, mimeType: saved.mimeType, truncated: false } : prev);
      await loadDirectory(currentPath);
      await refreshGitStatus();
    } catch (err: any) {
      setError(err?.message || (isZh ? '保存文件失败' : 'Failed to save file'));
    } finally {
      setSavingFile(false);
    }
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

  const submitCommand = async () => {
    const trimmed = command.trim();
    if (!trimmed || !workspacePath || runningCommand) return;
    setRunningCommand(true);
    setError('');
    try {
      const result = await runCodeCommand(workspacePath, trimmed);
      setCommandHistory(prev => [result, ...prev].slice(0, 12));
      setCommand('');
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
      setCommandHistory(prev => [{
        cwd: gitStatus?.repoRoot || workspacePath,
        command: `git ${gitActionLabel(action, false).toLowerCase()}`,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs || 0,
      }, ...prev].slice(0, 12));
      if (result.status) setGitStatus(result.status);
      if (action === 'commit' && !result.isError) setCommitMessage('');
      await loadDirectory(currentPath);
    } catch (err: any) {
      setError(err?.message || (isZh ? 'Git 操作失败' : 'Git action failed'));
    } finally {
      setGitBusyAction(null);
    }
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

        <div className="max-h-[132px] overflow-auto rounded-md border border-claude-border bg-claude-input">
          {gitStatus.files.length === 0 ? (
            <div className="p-3 text-[12px] text-claude-textSecondary">{isZh ? '没有未提交改动。' : 'No pending changes.'}</div>
          ) : gitStatus.files.slice(0, 24).map(file => (
            <div key={`${file.code}-${file.path}`} className="h-7 px-3 border-b border-claude-border/60 last:border-b-0 flex items-center gap-2 text-[12px]">
              <span className="w-7 shrink-0 font-mono text-[#C6613F]">{file.code}</span>
              <span className="truncate text-claude-textSecondary">{file.path}</span>
            </div>
          ))}
        </div>

        {gitStatus.diffStat && (
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
            <button
              onClick={() => switchPermission('workspace_write')}
              className={`h-8 px-3 rounded-md border text-[12px] flex items-center gap-1.5 transition-colors ${permissionMode === 'workspace_write' ? 'border-[#2E7CF6]/70 bg-[#2E7CF6]/10 text-claude-text' : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'}`}
            >
              <Shield size={13} />
              {isZh ? '默认权限' : 'Default'}
              {permissionMode === 'workspace_write' && <Check size={13} />}
            </button>
            <button
              onClick={() => switchPermission('full_access')}
              className={`h-8 px-3 rounded-md border text-[12px] flex items-center gap-1.5 transition-colors ${permissionMode === 'full_access' ? 'border-[#C6613F]/60 bg-[#C6613F]/10 text-[#C6613F]' : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'}`}
            >
              <Shield size={13} />
              {isZh ? '完全访问权限' : 'Full access'}
              {permissionMode === 'full_access' && <Check size={13} />}
            </button>
            <button onClick={chooseWorkspace} className="h-8 px-3 rounded-md bg-claude-text text-claude-bg text-[12px] font-medium hover:opacity-90">
              {isZh ? '选择工作区' : 'Choose workspace'}
            </button>
          </div>
        </div>

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
              <div className="h-[42px] px-3 border-b border-claude-border flex items-center justify-between">
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
                <button onClick={() => loadDirectory(currentPath)} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '刷新' : 'Refresh'}>
                  <RefreshCw size={14} className={loadingTree ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                {parentPath && (
                  <button onClick={() => loadDirectory(parentPath)} className="w-full h-8 px-2 rounded-md flex items-center gap-2 text-left text-[13px] text-claude-textSecondary hover:bg-claude-hover mb-1">
                    <Folder size={15} />
                    ..
                  </button>
                )}
                {entries.map(entry => (
                  <button
                    key={entry.path}
                    onClick={() => openEntry(entry)}
                    className={`w-full min-h-8 px-2 rounded-md flex items-center gap-2 text-left text-[13px] hover:bg-claude-hover transition-colors ${selectedFile?.path === entry.path ? 'bg-claude-hover text-claude-text' : 'text-claude-textSecondary'}`}
                  >
                    {entry.type === 'directory' ? <Folder size={15} className="shrink-0" /> : <File size={15} className="shrink-0" />}
                    <span className="truncate flex-1">{entry.name}</span>
                    {entry.type === 'file' && <span className="text-[10px] opacity-60">{formatBytes(entry.size)}</span>}
                  </button>
                ))}
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
                <div className={`mb-2 rounded-md border px-3 py-2 text-[12px] leading-5 ${permissionMode === 'full_access' ? 'border-[#C6613F]/30 bg-[#C6613F]/10 text-[#C6613F]' : 'border-claude-border bg-claude-input text-claude-textSecondary'}`}>
                  {permissionMode === 'full_access'
                    ? (isZh ? '完全访问权限已启用：允许命令执行和全盘文件操作。' : 'Full access is enabled: commands and system-wide file operations are allowed.')
                    : (isZh ? '默认权限：命令面板会被后端拒绝，文件编辑限制在当前工作区内。' : 'Default mode: command panel is blocked by the backend; file editing stays inside the workspace.')}
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
                <button
                  onClick={submitCommand}
                  disabled={!command.trim() || runningCommand}
                  className="mt-2 h-8 w-full rounded-md bg-claude-text text-claude-bg text-[12px] font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={13} />
                  {runningCommand ? (isZh ? '执行中...' : 'Running...') : (isZh ? '执行命令 Ctrl+Enter' : 'Run command Ctrl+Enter')}
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {commandHistory.length === 0 ? (
                  <div className="text-[12px] text-claude-textSecondary leading-6">
                    {isZh ? '命令和 Git 操作结果会显示在这里。' : 'Command and Git action output appears here.'}
                  </div>
                ) : commandHistory.map((item, index) => (
                  <div key={`${item.command}-${index}`} className="rounded-md border border-claude-border bg-claude-input overflow-hidden">
                    <div className="px-3 py-2 border-b border-claude-border flex items-center justify-between gap-2">
                      <code className="text-[11px] truncate text-claude-text">{item.command}</code>
                      <span className={`text-[10px] shrink-0 ${item.isError ? 'text-[#C6613F]' : 'text-claude-textSecondary'}`}>
                        {item.isError ? (isZh ? '错误' : 'error') : 'ok'} · {formatDuration(item.durationMs)}
                      </span>
                    </div>
                    <pre className="m-0 p-3 text-[11px] leading-5 font-mono whitespace-pre-wrap break-words text-claude-textSecondary max-h-[220px] overflow-auto">
                      {item.output}
                    </pre>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodePage;
