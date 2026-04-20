import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  Play,
  RefreshCw,
  Shield,
  Terminal,
} from 'lucide-react';
import {
  CodeCommandResult,
  CodeFileResult,
  CodeWorkspaceEntry,
  getAgentConfig,
  listCodeWorkspace,
  readCodeFile,
  runCodeCommand,
  updateAgentConfig,
} from '../api';
import { getStoredUiLanguage } from '../utils/chineseClientText';
import { copyToClipboard } from '../utils/clipboard';

type PermissionMode = 'workspace_write' | 'full_access';

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

const CodePage = () => {
  const uiLanguage = getStoredUiLanguage();
  const isZh = uiLanguage === 'zh-CN';
  const [workspacePath, setWorkspacePath] = useState(() => localStorage.getItem('code_workspace_path') || '');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<CodeWorkspaceEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFileResult | null>(null);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<CodeCommandResult[]>([]);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('full_access');
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [runningCommand, setRunningCommand] = useState(false);
  const [error, setError] = useState('');

  const relativeCurrentPath = useMemo(() => getRelativePath(workspacePath, currentPath || workspacePath), [workspacePath, currentPath]);
  const breadcrumbParts = useMemo(() => splitPath(relativeCurrentPath === '.' ? '' : relativeCurrentPath), [relativeCurrentPath]);

  const refreshAgentConfig = useCallback(async () => {
    try {
      const config = await getAgentConfig();
      setPermissionMode(config.permissionMode || 'full_access');
    } catch (_) {}
  }, []);

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
    localStorage.setItem('code_workspace_path', dir);
    await loadDirectory(dir, dir);
  };

  const openWorkspaceFolder = () => {
    const api = (window as any).electronAPI;
    if (workspacePath && api?.openFolder) api.openFolder(workspacePath);
  };

  const openEntry = async (entry: CodeWorkspaceEntry) => {
    if (entry.type === 'directory') {
      setSelectedFile(null);
      await loadDirectory(entry.path);
      return;
    }
    setLoadingFile(true);
    setError('');
    try {
      const file = await readCodeFile(workspacePath, entry.path);
      setSelectedFile(file);
    } catch (err: any) {
      setError(err?.message || (isZh ? '读取文件失败' : 'Failed to read file'));
    } finally {
      setLoadingFile(false);
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
    } catch (err: any) {
      setError(err?.message || (isZh ? '命令执行失败' : 'Command failed'));
    } finally {
      setRunningCommand(false);
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

  return (
    <div className="h-full bg-claude-bg text-claude-text overflow-hidden">
      <div className="h-full flex flex-col">
        <div className="h-[52px] border-b border-claude-border flex items-center justify-between px-5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-claude-textSecondary" />
              <h1 className="text-[16px] font-semibold">{isZh ? '代码工作区' : 'Code workspace'}</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-claude-border text-claude-textSecondary">
                {isZh ? '本地模式' : 'Local mode'}
              </span>
            </div>
            <div className="text-[12px] text-claude-textSecondary mt-1 truncate max-w-[760px]">
              {workspacePath || (isZh ? '选择一个本地文件夹，开始浏览文件和运行命令' : 'Choose a local folder to browse files and run commands')}
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
              <div className="mx-auto w-14 h-14 rounded-xl border border-claude-border flex items-center justify-center text-claude-textSecondary mb-5">
                <FolderOpen size={26} />
              </div>
              <h2 className="text-[22px] font-semibold mb-2">{isZh ? '先选择一个项目文件夹' : 'Start with a project folder'}</h2>
              <p className="text-[14px] leading-6 text-claude-textSecondary mb-5">
                {isZh
                  ? '这里会成为 Code 模式的工作区。默认权限会把文件访问限制在这个目录内，完全访问权限则允许全盘文件操作与命令执行。'
                  : 'This folder becomes the Code workspace. Default mode limits file access to it; full access allows system-wide file operations and commands.'}
              </p>
              <button onClick={chooseWorkspace} className="h-9 px-4 rounded-md bg-claude-text text-claude-bg text-[13px] font-medium hover:opacity-90">
                {isZh ? '选择文件夹' : 'Choose folder'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_360px]">
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
                  <div className="text-[13px] font-medium truncate">
                    {selectedFile ? selectedFile.name : (isZh ? '文件预览' : 'File preview')}
                  </div>
                  <div className="text-[11px] text-claude-textSecondary truncate">
                    {selectedFile ? getRelativePath(workspacePath, selectedFile.path) : (isZh ? '从左侧选择一个文件' : 'Select a file from the left')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFile && (
                    <>
                      <span className="text-[11px] text-claude-textSecondary">{formatBytes(selectedFile.size)}</span>
                      <button onClick={() => copyToClipboard(selectedFile.content || selectedFile.path)} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '复制内容' : 'Copy content'}>
                        <Copy size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
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
                          {isZh ? '这个文件不会在预览区展开，后面可以继续补图片/PDF 的专门查看器。' : 'This file is not expanded in the preview. Image/PDF viewers can be added next.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <pre className="m-0 p-4 text-[12px] leading-[1.55] font-mono whitespace-pre-wrap break-words text-claude-text">
                      {selectedFile.content}
                      {selectedFile.truncated && '\n\n... file truncated at 1 MB'}
                    </pre>
                  )
                ) : (
                  <div className="h-full flex items-center justify-center px-8">
                    <div className="text-center max-w-[440px]">
                      <File size={30} className="mx-auto text-claude-textSecondary mb-3" />
                      <div className="text-[15px] font-medium mb-1">{isZh ? '预览代码与文本文件' : 'Preview code and text files'}</div>
                      <p className="text-[13px] text-claude-textSecondary leading-6">
                        {isZh ? '这一页是 Code 模式的第一层骨架。接下来可以继续加 diff、编辑、MCP 工具和任务流。' : 'This is the first layer of Code mode. Diff, editing, MCP tools, and task flows can build on top of it.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </main>

            <aside className="border-l border-claude-border min-h-0 flex flex-col">
              <div className="h-[42px] px-4 border-b border-claude-border flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">{isZh ? '命令面板' : 'Command panel'}</div>
                  <div className="text-[11px] text-claude-textSecondary">{isZh ? '工作目录固定为当前工作区' : 'Runs from the selected workspace'}</div>
                </div>
                <button onClick={openWorkspaceFolder} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary" title={isZh ? '在资源管理器打开' : 'Open in Explorer'}>
                  <ExternalLink size={14} />
                </button>
              </div>

              <div className="p-3 border-b border-claude-border">
                <div className={`mb-2 rounded-md border px-3 py-2 text-[12px] leading-5 ${permissionMode === 'full_access' ? 'border-[#C6613F]/30 bg-[#C6613F]/10 text-[#C6613F]' : 'border-claude-border bg-claude-input text-claude-textSecondary'}`}>
                  {permissionMode === 'full_access'
                    ? (isZh ? '完全访问权限已启用：允许命令执行和全盘文件操作。' : 'Full access is enabled: commands and system-wide file operations are allowed.')
                    : (isZh ? '默认权限：命令执行已禁用，文件限制在当前工作区内。' : 'Default mode: commands are disabled and files stay inside the workspace.')}
                </div>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitCommand();
                  }}
                  placeholder={isZh ? '输入命令，例如：dir 或 npm test' : 'Enter a command, e.g. dir or npm test'}
                  className="w-full h-24 resize-none rounded-md border border-claude-border bg-claude-input px-3 py-2 text-[12px] font-mono outline-none focus:border-[#2E7CF6]/70"
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
                    {isZh ? '命令结果会显示在这里。默认权限下后端会拒绝 shell，切到完全访问权限后即可执行。' : 'Command output appears here. Default mode blocks shell; full access allows execution.'}
                  </div>
                ) : commandHistory.map((item, index) => (
                  <div key={`${item.command}-${index}`} className="rounded-md border border-claude-border bg-claude-input overflow-hidden">
                    <div className="px-3 py-2 border-b border-claude-border flex items-center justify-between gap-2">
                      <code className="text-[11px] truncate text-claude-text">{item.command}</code>
                      <span className={`text-[10px] shrink-0 ${item.isError ? 'text-[#C6613F]' : 'text-claude-textSecondary'}`}>
                        {item.isError ? (isZh ? '错误' : 'error') : 'ok'} · {formatDuration(item.durationMs)}
                      </span>
                    </div>
                    <pre className="m-0 p-3 text-[11px] leading-5 font-mono whitespace-pre-wrap break-words text-claude-textSecondary max-h-[240px] overflow-auto">
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
