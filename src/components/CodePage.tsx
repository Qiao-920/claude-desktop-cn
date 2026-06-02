import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  MessageSquareText,
  Download,
  Ellipsis,
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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useNavigate } from 'react-router-dom';
import {
  CodeCommandResult,
  CodeCommandAuditEntry,
  CodeFileResult,
  CodeGitFile,
  CodeGitFileDiffResult,
  CodeGitStatusResult,
  CodeWorkspaceHealthResult,
  CodeWorkspaceEntry,
  createCodeEntry,
  createConversation,
  deleteCodeEntry,
  getConversation,
  getAgentConfig,
  getCodeCommandAudit,
  getCodeGitFileDiff,
  getCodeGitStatus,
  getCodeWorkspaceHealth,
  listCodeWorkspace,
  readCodeFile,
  renameCodeEntry,
  restoreCodeFileFromGit,
  runCodeCommand,
  runCodeGitAction,
  runCodeGitFileAction,
  saveCodeFile,
  sendMessage,
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

type AssistantRequestItem = {
  id: string;
  prompt: string;
  createdAt: number;
};

type EmbeddedAssistantMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  isThinking?: boolean;
  created_at?: string;
  error?: boolean;
};

type BottomPanelTab = 'problems' | 'output' | 'debug' | 'terminal' | 'ports';

type AssistantAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  preview: string;
  source: 'upload' | 'context';
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

type CommandApprovalState = {
  command: string;
  approval: {
    risk?: { level: 'normal' | 'medium' | 'high'; reason: string };
    permissionMode?: PermissionMode;
    message?: string;
  };
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

const formatRiskLabel = (level?: string, isZh = true) => {
  if (level === 'high') return isZh ? '高风险' : 'High risk';
  if (level === 'medium') return isZh ? '需确认' : 'Needs approval';
  return isZh ? '正常' : 'Normal';
};

const riskToneClass = (level?: string) => {
  if (level === 'high') return 'border-[#C6613F]/40 bg-[#C6613F]/10 text-[#C6613F]';
  if (level === 'medium') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400';
};

const healthToneClass = (status?: string) => {
  if (status === 'ok') return 'text-emerald-400';
  if (status === 'warning') return 'text-amber-300';
  return 'text-[#C6613F]';
};

const healthFixToneClass = (severity?: string) => {
  if (severity === 'error') return 'border-[#C6613F]/40 bg-[#C6613F]/10 text-[#C6613F]';
  if (severity === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  return 'border-[#2E7CF6]/35 bg-[#2E7CF6]/10 text-[#6EA8FF]';
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

const stripThinkTags = (value: string) => (
  (value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim()
);

const inferCodeLanguage = (fileName: string) => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    ps1: 'powershell',
    cjs: 'javascript',
    mjs: 'javascript',
    py: 'python',
    xml: 'xml',
  };
  return map[ext] || 'text';
};

const editorSyntaxTheme = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...(vscDarkPlus['pre[class*="language-"]'] || {}),
    background: '#1e1e1e',
    margin: 0,
    padding: 0,
    fontSize: '12px',
    lineHeight: '1.65',
    fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
  },
  'code[class*="language-"]': {
    ...(vscDarkPlus['code[class*="language-"]'] || {}),
    background: 'transparent',
    fontSize: '12px',
    lineHeight: '1.65',
    fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
  },
};

const getTextPreview = (value: string, maxLines = 160, maxChars = 12000) => {
  if (!value) return '';
  const lines = value.split(/\r?\n/).slice(0, maxLines);
  const joined = lines.join('\n');
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}\n...` : joined;
};

const extractCodeBlocks = (value: string) => {
  if (!value) return [] as string[];
  const blocks: string[] = [];
  const regex = /```(?:[\w.+-]+)?\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    blocks.push(match[1].replace(/\s+$/, ''));
  }
  return blocks;
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

interface CodePageProps {
  desktopTabId?: string;
}

const CodePage = ({ desktopTabId }: CodePageProps) => {
  const navigate = useNavigate();
  const uiLanguage = getStoredUiLanguage();
  const isZh = uiLanguage === 'zh-CN';
  const workspaceStorageKey = desktopTabId ? `code_workspace_path:${desktopTabId}` : 'code_workspace_path';
  const commandHistoryStorageKey = desktopTabId ? `code_command_history:${desktopTabId}` : 'code_command_history';
  const commandDraftStorageKey = desktopTabId ? `code_command_draft:${desktopTabId}` : 'code_command_draft';
  const assistantHistoryStorageKey = desktopTabId ? `code_assistant_history:${desktopTabId}` : 'code_assistant_history';
  const assistantConversationStorageKey = desktopTabId ? `code_assistant_conversation:${desktopTabId}` : 'code_assistant_conversation';
  const [workspacePath, setWorkspacePath] = useState(() => localStorage.getItem(workspaceStorageKey) || localStorage.getItem('code_workspace_path') || '');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<CodeWorkspaceEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFileResult | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [command, setCommand] = useState(() => localStorage.getItem(commandDraftStorageKey) || '');
  const [commandHistory, setCommandHistory] = useState<CodeCommandResult[]>([]);
  const [workspaceHealth, setWorkspaceHealth] = useState<CodeWorkspaceHealthResult | null>(null);
  const [commandAudit, setCommandAudit] = useState<CodeCommandAuditEntry[]>([]);
  const [auditDecisionFilter, setAuditDecisionFilter] = useState<'all' | 'approval_required' | 'approved' | 'blocked' | 'denied' | 'executed' | 'completed' | 'failed'>('all');
  const [auditRiskFilter, setAuditRiskFilter] = useState<'all' | 'low' | 'normal' | 'medium' | 'high'>('all');
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
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingGitDiff, setLoadingGitDiff] = useState(false);
  const [gitBusyAction, setGitBusyAction] = useState<GitAction | null>(null);
  const [gitFileBusyAction, setGitFileBusyAction] = useState<GitFileAction | null>(null);
  const [fileOperationBusy, setFileOperationBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [assistantHistory, setAssistantHistory] = useState<AssistantRequestItem[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(assistantHistoryStorageKey) || '[]');
      return Array.isArray(raw) ? raw.filter((item) => item && typeof item.prompt === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [assistantConversationId, setAssistantConversationId] = useState(() => localStorage.getItem(assistantConversationStorageKey) || '');
  const [assistantMessages, setAssistantMessages] = useState<EmbeddedAssistantMessage[]>([]);
  const [assistantStreaming, setAssistantStreaming] = useState(false);
  const [assistantConversationLoading, setAssistantConversationLoading] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [assistantApplyNotice, setAssistantApplyNotice] = useState('');
  const [assistantAttachments, setAssistantAttachments] = useState<AssistantAttachment[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomPanelTab>('terminal');
  const [showAssistantMenu, setShowAssistantMenu] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => Number(localStorage.getItem('code_left_pane_width') || '280'));
  const [rightPaneWidth, setRightPaneWidth] = useState(() => Number(localStorage.getItem('code_right_pane_width') || '520'));
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => Number(localStorage.getItem('code_bottom_panel_height') || '232'));
  const [showRightPane, setShowRightPane] = useState(() => localStorage.getItem('code_show_right_pane') !== '0');
  const [showBottomPane, setShowBottomPane] = useState(() => localStorage.getItem('code_show_bottom_pane') !== '0');
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [treeMenu, setTreeMenu] = useState<TreeContextMenuState | null>(null);
  const [workspaceDialog, setWorkspaceDialog] = useState<WorkspaceDialogState | null>(null);
  const [pendingApproval, setPendingApproval] = useState<CommandApprovalState | null>(null);
  const [error, setError] = useState('');
  const treeMenuRef = useRef<HTMLDivElement | null>(null);
  const assistantFileInputRef = useRef<HTMLInputElement | null>(null);
  const assistantScrollRef = useRef<HTMLDivElement | null>(null);
  const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeStateRef = useRef<null | { type: 'left' | 'right' | 'bottom'; startX: number; startY: number; startWidth?: number; startHeight?: number }>(null);

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
  const selectedFileRelativePath = useMemo(() => (
    selectedFile ? getRelativePath(workspacePath, selectedFile.path) : ''
  ), [selectedFile, workspacePath]);
  const assistantFilePreview = useMemo(() => {
    if (!selectedFileRelativePath || !isEditableFile) return '';
    return getTextPreview(editorContent, 160, 12000);
  }, [editorContent, isEditableFile, selectedFileRelativePath]);
  const attachmentContextBlock = useMemo(() => {
    if (!assistantAttachments.length) return '';
    return assistantAttachments
      .map((item) => {
        const sourceLabel = item.source === 'context'
          ? (isZh ? '来自当前上下文' : 'From current context')
          : (isZh ? '来自上传内容' : 'From upload');
        const previewText = item.preview
          ? `\n\`\`\`\n${item.preview}\n\`\`\``
          : `\n${isZh ? '这个附件不是纯文本，先根据名称和类型理解它。' : 'This attachment is not plain text. Infer from its name and type first.'}`;
        return `${isZh ? '附件' : 'Attachment'}：${item.name} (${sourceLabel}, ${item.mimeType || 'file'}, ${formatBytes(item.size)})${previewText}`;
      })
      .join('\n\n');
  }, [assistantAttachments, isZh]);
  const workspaceIssues = useMemo(() => (
    workspaceHealth?.checks?.filter((item) => item.status !== 'ok') || []
  ), [workspaceHealth]);
  const detectedPorts = useMemo(() => {
    const seen = new Set<string>();
    const matches: Array<{ port: string; source: string }> = [];
    const regex = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?[: ](\d{2,5})\b/g;
    commandHistory.forEach((entry) => {
      const text = `${entry.command}\n${entry.output || ''}`;
      let result: RegExpExecArray | null;
      while ((result = regex.exec(text)) !== null) {
        const port = result[1];
        if (!seen.has(port)) {
          seen.add(port);
          matches.push({ port, source: entry.command });
        }
      }
    });
    return matches.slice(0, 8);
  }, [commandHistory]);
  const debugLines = useMemo(() => {
    const rows: string[] = [];
    if (assistantStreaming) rows.push(isZh ? 'Claude 正在生成回复…' : 'Claude is generating a reply...');
    if (assistantError) rows.push(`${isZh ? '对话错误' : 'Assistant error'}: ${assistantError}`);
    if (error) rows.push(`${isZh ? '代码页错误' : 'Code page error'}: ${error}`);
    if (pendingApproval?.approval?.message) rows.push(`${isZh ? '等待确认' : 'Awaiting approval'}: ${pendingApproval.approval.message}`);
    if (commandHistory[0]) rows.push(`${isZh ? '最近命令' : 'Last command'}: ${commandHistory[0].command}`);
    if (!rows.length) rows.push(isZh ? '这里会显示代码页的调试信息、审批状态和 Claude 运行提示。' : 'Debug messages, approval state, and Claude runtime hints appear here.');
    return rows;
  }, [assistantError, assistantStreaming, commandHistory, error, isZh, pendingApproval]);
  const codeLanguage = useMemo(() => inferCodeLanguage(selectedFile?.name || ''), [selectedFile?.name]);
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
    if (workspaceHealth?.suggestedCommands?.length) {
      const healthCommands = workspaceHealth.suggestedCommands.slice(0, 4).map((item) => ({
        label: item.label,
        command: item.command,
        desc: isZh ? '来自工作区健康检查的建议命令' : 'Suggested by workspace health check',
      }));
      return [
        { label: isZh ? 'Git 状态' : 'Git status', command: 'git status --short --branch', desc: isZh ? '查看分支和改动' : 'Check branch and changes' },
        ...healthCommands,
      ];
    }
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
  }, [isZh, workspaceHealth]);
  const filteredCommandAudit = useMemo(() => {
    return commandAudit.filter((entry) => {
      if (auditDecisionFilter !== 'all') {
        const normalizedDecision = entry.decision === 'completed' ? 'executed' : entry.decision;
        if (auditDecisionFilter === 'completed') {
          if (normalizedDecision !== 'executed') return false;
        } else if (normalizedDecision !== auditDecisionFilter) {
          return false;
        }
      }
      if (auditRiskFilter !== 'all') {
        const normalizedRisk = (entry.risk?.level || 'normal') === 'normal' ? 'low' : (entry.risk?.level || 'normal');
        if (auditRiskFilter !== normalizedRisk && !(auditRiskFilter === 'normal' && normalizedRisk === 'low')) return false;
      }
      return true;
    });
  }, [auditDecisionFilter, auditRiskFilter, commandAudit]);

  const launchClaudeTask = useCallback((prompt: string) => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    setAssistantHistory((prev) => [
      { id: `assistant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, prompt: nextPrompt, createdAt: Date.now() },
      ...prev.filter((item) => item.prompt !== nextPrompt),
    ].slice(0, 6));
    sessionStorage.setItem('prefill_input', nextPrompt);
    navigate('/');
  }, [navigate]);

  const buildAssistantContextPrompt = useCallback((nextPrompt: string, options?: { includeCurrentFile?: boolean }) => {
    const includeCurrentFile = options?.includeCurrentFile ?? false;
    return [
      workspacePath ? `${isZh ? '当前工作区' : 'Current workspace'}：${workspacePath}` : '',
      includeCurrentFile && selectedFileRelativePath ? `${isZh ? '当前文件' : 'Current file'}：${selectedFileRelativePath}` : '',
      includeCurrentFile && selectedFileRelativePath && isEditableFile
        ? `${isZh ? '当前文件内容摘要（回答时请优先参考这里）' : 'Current file excerpt (please prioritize this while answering)'}：\n\`\`\`\n${assistantFilePreview}\n\`\`\``
        : '',
      attachmentContextBlock ? `${isZh ? '附加上下文' : 'Attached context'}：\n${attachmentContextBlock}` : '',
      includeCurrentFile && isDirty
        ? (isZh ? '注意：当前文件有未保存的本地修改，回答时请把这些改动也算进去。' : 'Note: the current file has unsaved local edits. Please include them in your reasoning.')
        : '',
      nextPrompt,
    ].filter(Boolean).join('\n\n');
  }, [assistantFilePreview, attachmentContextBlock, isDirty, isEditableFile, isZh, selectedFileRelativePath, workspacePath]);

  const openAssistantUpload = useCallback(() => {
    assistantFileInputRef.current?.click();
    setShowAssistantMenu(false);
  }, []);

  const addCurrentFileAsContext = useCallback(() => {
    if (!selectedFile || selectedFile.binary) {
      setAssistantError(isZh ? '请先打开一个可读取的文本文件，再把它加到上下文里。' : 'Open a readable text file before adding it as context.');
      setShowAssistantMenu(false);
      return;
    }
    const nextAttachment: AssistantAttachment = {
      id: `ctx-${Date.now().toString(36)}`,
      name: selectedFile.name,
      mimeType: selectedFile.mimeType || 'text/plain',
      size: selectedFile.size,
      preview: getTextPreview(editorContent, 220, 10000),
      source: 'context',
    };
    setAssistantAttachments((prev) => [nextAttachment, ...prev.filter((item) => item.name !== nextAttachment.name)].slice(0, 4));
    setAssistantError('');
    setShowAssistantMenu(false);
  }, [editorContent, isZh, selectedFile]);

  const removeAssistantAttachment = useCallback((id: string) => {
    setAssistantAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAssistantFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const nextAttachments = await Promise.all(files.slice(0, 4).map(async (file) => {
      let preview = '';
      const isTextLike = file.type.startsWith('text/') || /\.(md|txt|json|ts|tsx|js|jsx|css|html|yml|yaml|env)$/i.test(file.name);
      if (isTextLike) {
        try {
          const raw = await file.text();
          preview = getTextPreview(raw, 220, 10000);
        } catch {
          preview = '';
        }
      }
      return {
        id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        preview,
        source: 'upload' as const,
      };
    }));
    setAssistantAttachments((prev) => [...nextAttachments, ...prev].slice(0, 4));
    setAssistantError('');
    event.target.value = '';
  }, []);

  useEffect(() => {
    localStorage.setItem(assistantHistoryStorageKey, JSON.stringify(assistantHistory));
  }, [assistantHistory, assistantHistoryStorageKey]);

  useEffect(() => {
    localStorage.setItem('code_left_pane_width', String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    localStorage.setItem('code_right_pane_width', String(rightPaneWidth));
  }, [rightPaneWidth]);

  useEffect(() => {
    localStorage.setItem('code_bottom_panel_height', String(bottomPanelHeight));
  }, [bottomPanelHeight]);

  useEffect(() => {
    localStorage.setItem('code_show_right_pane', showRightPane ? '1' : '0');
  }, [showRightPane]);

  useEffect(() => {
    localStorage.setItem('code_show_bottom_pane', showBottomPane ? '1' : '0');
  }, [showBottomPane]);

  useEffect(() => {
    if (!assistantConversationId) {
      setAssistantMessages([]);
      return;
    }
    let cancelled = false;
    setAssistantConversationLoading(true);
    getConversation(assistantConversationId)
      .then((data) => {
        if (cancelled) return;
        const nextMessages = Array.isArray(data?.messages)
          ? data.messages
              .filter((message: any) => message && (message.role === 'user' || message.role === 'assistant'))
              .map((message: any) => ({
                id: message.id,
                role: message.role,
                content: String(message.content || ''),
                thinking: typeof message.thinking === 'string' ? message.thinking : undefined,
                isThinking: !!message.isThinking,
                created_at: message.created_at,
              }))
          : [];
        setAssistantMessages(nextMessages.slice(-10));
      })
      .catch(() => {
        if (cancelled) return;
        setAssistantError(isZh ? '右侧对话加载失败，请稍后重试。' : 'Failed to load side chat.');
      })
      .finally(() => {
        if (!cancelled) setAssistantConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assistantConversationId, isZh]);

  useEffect(() => {
    if (!assistantConversationId) {
      localStorage.removeItem(assistantConversationStorageKey);
      return;
    }
    localStorage.setItem(assistantConversationStorageKey, assistantConversationId);
  }, [assistantConversationId, assistantConversationStorageKey]);

  useEffect(() => {
    const container = assistantScrollRef.current;
    const anchor = assistantScrollAnchorRef.current;
    if (!container || !anchor) return;
    const maxOffset = 120;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= maxOffset;
    if (!isNearBottom && !assistantStreaming) return;
    requestAnimationFrame(() => {
      anchor.scrollIntoView({ block: 'end' });
    });
  }, [assistantMessages, assistantStreaming]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      if (state.type === 'left' && typeof state.startWidth === 'number') {
        const next = Math.min(420, Math.max(220, state.startWidth + (event.clientX - state.startX)));
        setLeftPaneWidth(next);
      }
      if (state.type === 'right' && typeof state.startWidth === 'number') {
        const next = Math.min(760, Math.max(360, state.startWidth - (event.clientX - state.startX)));
        setRightPaneWidth(next);
      }
      if (state.type === 'bottom' && typeof state.startHeight === 'number') {
        const next = Math.min(420, Math.max(160, state.startHeight - (event.clientY - state.startY)));
        setBottomPanelHeight(next);
      }
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const sendEmbeddedAssistantPrompt = useCallback(async (rawPrompt: string, options?: { includeCurrentFile?: boolean }) => {
    const nextPrompt = rawPrompt.trim();
    if (!nextPrompt || assistantStreaming) return;

    const contextPrompt = buildAssistantContextPrompt(nextPrompt, options);

    setAssistantError('');
    setAssistantStreaming(true);

    const optimisticUser: EmbeddedAssistantMessage = {
      role: 'user',
      content: nextPrompt,
      created_at: new Date().toISOString(),
    };
    const optimisticAssistant: EmbeddedAssistantMessage = {
      role: 'assistant',
      content: '',
      isThinking: true,
      created_at: new Date().toISOString(),
    };
    setAssistantMessages((prev) => [...prev.slice(-8), optimisticUser, optimisticAssistant]);

    let conversationId = assistantConversationId;
    try {
      if (!conversationId) {
        const created = await createConversation(isZh ? '代码侧栏助手' : 'Code sidebar assistant');
        conversationId = created?.id;
        if (!conversationId) {
          throw new Error(isZh ? '创建对话失败' : 'Failed to create conversation');
        }
        setAssistantConversationId(conversationId);
      }

      await sendMessage(
        conversationId,
        contextPrompt,
        null,
        (_delta, full) => {
          setAssistantMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              last.content = full;
              last.isThinking = false;
            }
            return next.slice(-10);
          });
        },
        (full) => {
          setAssistantStreaming(false);
          setAssistantMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              last.content = full;
              last.isThinking = false;
              last.error = false;
            }
            return next.slice(-10);
          });
        },
        (err) => {
          setAssistantStreaming(false);
          setAssistantError(err || (isZh ? '发送失败' : 'Send failed'));
          setAssistantMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              last.content = err || (isZh ? '发送失败，请稍后重试。' : 'Send failed. Please try again.');
              last.isThinking = false;
              last.error = true;
            }
            return next.slice(-10);
          });
        },
        (thinkingDelta, thinkingFull) => {
          setAssistantMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              last.thinking = thinkingFull;
              last.isThinking = true;
              if (!last.content) {
                last.content = thinkingDelta;
              }
            }
            return next.slice(-10);
          });
        },
        undefined,
        { displayMessage: nextPrompt },
      );
    } catch (error: any) {
      setAssistantStreaming(false);
      setAssistantError(error?.message || (isZh ? '发送失败' : 'Send failed'));
      setAssistantMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          last.content = error?.message || (isZh ? '发送失败，请稍后重试。' : 'Send failed. Please try again.');
          last.isThinking = false;
          last.error = true;
        }
        return next.slice(-10);
      });
    }
  }, [assistantConversationId, assistantStreaming, buildAssistantContextPrompt, isZh]);

  const sendEmbeddedAssistantPromptWithContext = useCallback(async (rawPrompt: string) => {
    await sendEmbeddedAssistantPrompt(rawPrompt, { includeCurrentFile: true });
  }, [sendEmbeddedAssistantPrompt]);

  const sendEmbeddedAssistantMessage = useCallback(async () => {
    const nextPrompt = assistantDraft.trim();
    if (!nextPrompt) return;
    setAssistantDraft('');
    await sendEmbeddedAssistantPrompt(nextPrompt);
  }, [assistantDraft, sendEmbeddedAssistantPrompt]);

  const askAboutSelectedFile = useCallback(() => {
    if (!selectedFileRelativePath) return;
    setAssistantDraft(
      isZh
        ? `请先用普通人也能看懂的话，解释当前文件「${selectedFileRelativePath}」是做什么的，然后告诉我如果要修改它，最应该先动哪一块。`
        : `Explain what the current file "${selectedFileRelativePath}" does, then tell me what part should be changed first.`,
    );
  }, [isZh, selectedFileRelativePath]);

  const applyAssistantCodeToEditor = useCallback((nextContent: string) => {
    if (!selectedFile || !isEditableFile) {
      setAssistantError(isZh ? '请先打开一个可编辑的文本文件，再应用 Claude 给出的代码。' : 'Open an editable text file before applying Claude code.');
      return;
    }
    setEditorContent(nextContent);
    setShowDiff(true);
    setAssistantError('');
    setAssistantApplyNotice(
      isZh
        ? `已把 Claude 给出的代码放进「${selectedFile.name}」草稿。你可以先看差异，确认后再点保存。`
        : `Claude's code has been placed into the draft for "${selectedFile.name}". Review the diff, then save when you're ready.`,
    );
  }, [isEditableFile, isZh, selectedFile]);

  useEffect(() => {
    setAssistantApplyNotice('');
  }, [selectedFile?.path]);

  const startPaneResize = (type: 'left' | 'right' | 'bottom', event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStateRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: type === 'left' ? leftPaneWidth : type === 'right' ? rightPaneWidth : undefined,
      startHeight: type === 'bottom' ? bottomPanelHeight : undefined,
    };
    document.body.style.cursor = type === 'bottom' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const workspaceAssistantPrompts = useMemo(() => {
    const selectedPath = selectedFile ? getRelativePath(workspacePath, selectedFile.path) : '';
    const gitHint = gitStatus?.isRepo
      ? (isZh ? '这个目录已经接入 Git。' : 'This directory is already tracked by Git.')
      : (isZh ? '这个目录目前还不是 Git 仓库。' : 'This directory is not a Git repository yet.');
    const workspaceHint = workspacePath
      ? `${isZh ? '当前工作区' : 'Current workspace'}：${workspacePath}`
      : '';

    return [
      {
        title: isZh ? '先帮我看懂这个项目' : 'Explain this project first',
        description: isZh ? '适合第一次打开项目时先快速看懂结构。' : 'Best for a first look at the project structure.',
        prompt: [
          workspaceHint,
          gitHint,
          isZh
            ? '请先用普通人也能看懂的话，告诉我这个项目是做什么的、主要有哪些页面或模块、我下一步最适合改哪里。'
            : 'Explain what this project does, which pages or modules matter, and what to change next.',
        ].filter(Boolean).join('\n'),
      },
      {
        title: isZh ? '帮我修改当前文件' : 'Edit the current file',
        description: selectedPath
          ? (isZh ? `围绕当前选中的文件「${selectedPath}」发起修改。` : `Start from the selected file: ${selectedPath}`)
          : (isZh ? '先选一个文件，再让 Claude 直接帮你改。' : 'Select a file first, then ask Claude to edit it.'),
        prompt: selectedPath
          ? [
              workspaceHint,
              isZh
                ? `请先阅读文件「${selectedPath}」，用不懂代码的人也能看懂的话解释它是做什么的，然后等我继续告诉你要改什么。`
                : `Read "${selectedPath}", explain it simply, and wait for my requested change.`,
            ].join('\n')
          : '',
        disabled: !selectedPath,
      },
      {
        title: isZh ? '让 Claude 自己找问题' : 'Let Claude inspect for issues',
        description: isZh ? '适合遇到黑屏、报错、布局奇怪或未汉化这些问题。' : 'Useful for bugs, layout issues, and untranslated copy.',
        prompt: [
          workspaceHint,
          isZh
            ? '请先检查这个工作区里最值得优先修的地方，重点看黑屏、未汉化、布局错位和明显的交互问题，并告诉我你准备先改哪一处。'
            : 'Inspect the workspace for the most important issues first and tell me what you would fix first.',
        ].filter(Boolean).join('\n'),
      },
    ];
  }, [gitStatus?.isRepo, isZh, selectedFile, workspacePath]);

  const rememberWorkspacePath = useCallback((nextWorkspacePath: string) => {
    if (!nextWorkspacePath) return;
    const shouldRemember = localStorage.getItem('code_remember_workspace') !== '0';
    localStorage.setItem(workspaceStorageKey, nextWorkspacePath);
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
  }, [workspaceStorageKey]);

  useEffect(() => {
    if (localStorage.getItem('code_persist_command_history') === '0') return;
    try {
      const raw = JSON.parse(localStorage.getItem(commandHistoryStorageKey) || '[]');
      if (Array.isArray(raw)) {
        setCommandHistory(raw);
      }
    } catch {
      // ignore
    }
  }, [commandHistoryStorageKey]);

  useEffect(() => {
    if (localStorage.getItem('code_persist_command_history') === '0') {
      localStorage.removeItem(commandHistoryStorageKey);
      return;
    }
    localStorage.setItem(commandHistoryStorageKey, JSON.stringify(commandHistory.slice(0, 12)));
  }, [commandHistory, commandHistoryStorageKey]);

  useEffect(() => {
    if (!command.trim()) {
      localStorage.removeItem(commandDraftStorageKey);
      return;
    }
    localStorage.setItem(commandDraftStorageKey, command);
  }, [command, commandDraftStorageKey]);

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

  const refreshWorkspaceHealth = useCallback(async (workspaceOverride?: string) => {
    const root = workspaceOverride || workspacePath;
    if (!root) return;
    setLoadingHealth(true);
    try {
      const health = await getCodeWorkspaceHealth(root);
      setWorkspaceHealth(health);
    } catch (_) {
      setWorkspaceHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }, [workspacePath]);

  const refreshCommandAudit = useCallback(async (workspaceOverride?: string) => {
    const root = workspaceOverride || workspacePath;
    if (!root) return;
    try {
      const data = await getCodeCommandAudit(root);
      setCommandAudit(Array.isArray(data.entries) ? data.entries : []);
    } catch (_) {
      setCommandAudit([]);
    }
  }, [workspacePath]);

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
      refreshWorkspaceHealth(workspacePath);
      refreshCommandAudit(workspacePath);
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
    await refreshWorkspaceHealth(dir);
    await refreshCommandAudit(dir);
  };

  const openWorkspaceFolder = () => {
    const api = (window as any).electronAPI;
    if (workspacePath && api?.openFolder) api.openFolder(workspacePath);
  };

  const exportCommandAudit = async () => {
    if (!filteredCommandAudit.length) return;
    const payload = {
      workspacePath,
      exportedAt: new Date().toISOString(),
      filters: {
        decision: auditDecisionFilter,
        risk: auditRiskFilter,
      },
      entries: filteredCommandAudit,
    };
    await copyToClipboard(JSON.stringify(payload, null, 2));
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
      setAssistantApplyNotice('');
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
    setAssistantApplyNotice('');
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

  const submitCommand = async (commandOverride?: string, approved = false) => {
    const trimmed = (commandOverride ?? command).trim();
    if (!trimmed || !workspacePath || runningCommand) return;
    if (!approved && isDangerousCommand(trimmed)) {
      const ok = window.confirm(
        isZh
          ? `这条命令可能会删除文件、重置仓库或影响系统。\n\n${trimmed}\n\n确定继续执行吗？`
          : `This command may delete files, reset Git history, or affect the system:\n\n${trimmed}\n\nDo you want to continue?`
      );
      if (!ok) return;
    }
    setRunningCommand(true);
    setError('');
    try {
      const shellPreference = localStorage.getItem('integrated_shell') || 'powershell';
      const timeout = Number(localStorage.getItem('code_command_timeout_ms') || '120000') || 120000;
      const result = await runCodeCommand(workspacePath, trimmed, timeout, shellPreference, approved);
      setCommandHistory(prev => [result, ...prev].slice(0, 12));
      setPendingApproval(null);
      if (!commandOverride) setCommand('');
      await refreshGitStatus();
      await refreshWorkspaceHealth();
      await refreshCommandAudit();
      await loadDirectory(currentPath);
    } catch (err: any) {
      if (err?.requiresApproval) {
        setPendingApproval({
          command: trimmed,
          approval: err.approval || {
            risk: { level: 'medium', reason: err.message },
            permissionMode,
            message: err.message,
          },
        });
        await refreshCommandAudit();
        setError('');
      } else {
        setError(err?.message || (isZh ? '命令执行失败' : 'Command failed'));
        await refreshCommandAudit();
      }
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
      const ok = window.confirm(isZh ? `丢弃 ${getGitDisplayPath(file.path)} 的 Git 改动吗？这个操作不能撤销。` : `Discard Git changes in ${getGitDisplayPath(file.path)}? This cannot be undone.`);
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
          {isZh ? '这里还没有可显示的差异内容。' : 'No diff content is available yet.'}
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

  const renderAssistantMarkdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 whitespace-pre-wrap break-words">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-6 text-[#D4D4D4]">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[#FFFFFF]">{children}</strong>,
        em: ({ children }) => <em className="text-[#C586C0] not-italic">{children}</em>,
        a: ({ href, children }) => <a href={href} className="text-[#4FC1FF] hover:underline">{children}</a>,
        code(props) {
          const { children, className, inline, ...rest } = props as any;
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children || '').replace(/\n$/, '');
          if (!inline) {
            return (
              <SyntaxHighlighter
                // @ts-expect-error style typing from dependency
                style={vscDarkPlus}
                language={match?.[1] || 'text'}
                PreTag="div"
                customStyle={{
                  margin: '0 0 12px 0',
                  borderRadius: '8px',
                  background: '#1E1E1E',
                  border: '1px solid #2D2D30',
                  fontSize: '12px',
                  lineHeight: '1.6',
                }}
                {...rest}
              >
                {code}
              </SyntaxHighlighter>
            );
          }
          return (
            <code className="rounded bg-[#252526] px-1.5 py-0.5 font-mono text-[11px] text-[#DCDCAA]" {...rest}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  const renderBottomPanel = () => {
    if (activeBottomTab === 'problems') {
      if (!workspaceIssues.length) {
        return (
          <div className="px-4 py-4 text-[12px] text-[#9D9D9D]">
            {isZh ? '没有检测到新的问题。这里会显示工作区健康检查里的风险、缺失项和修复建议。' : 'No problems found. Workspace issues and fix suggestions will appear here.'}
          </div>
        );
      }
      return (
        <div className="divide-y divide-[#2A2A2A]">
          {workspaceIssues.map((item, index) => (
            <div key={`${item.label}-${index}`} className="px-4 py-3 text-[12px]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className={healthToneClass(item.status)} />
                <span className="font-medium text-[#E8E8E8]">{item.label}</span>
                <span className="text-[#8B8B8B]">{item.summary}</span>
              </div>
              {item.details ? (
                <div className="mt-1 pl-5 text-[#9D9D9D]">{item.details}</div>
              ) : null}
            </div>
          ))}
        </div>
      );
    }

    if (activeBottomTab === 'output') {
      if (!commandHistory.length) {
        return <div className="px-4 py-4 text-[12px] text-[#9D9D9D]">{isZh ? '这里会显示最近命令的输出结果。' : 'Recent command output will appear here.'}</div>;
      }
      return (
        <div className="divide-y divide-[#2A2A2A]">
          {commandHistory.slice(0, 6).map((entry, index) => (
            <div key={`${entry.command}-${index}`} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-mono text-[#C586C0]">{entry.command}</span>
                <span className={`${entry.isError ? 'text-[#F48771]' : 'text-[#4EC9B0]'}`}>{entry.isError ? (isZh ? '失败' : 'Failed') : (isZh ? '完成' : 'Done')}</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[#CE9178]">{entry.output || (isZh ? '没有输出。' : 'No output.')}</pre>
            </div>
          ))}
        </div>
      );
    }

    if (activeBottomTab === 'debug') {
      return (
        <div className="px-4 py-3 font-mono text-[11px] leading-6 text-[#9CDCFE]">
          {debugLines.map((line, index) => (
            <div key={`${line}-${index}`} className="border-b border-[#2A2A2A] py-1 last:border-b-0">{line}</div>
          ))}
        </div>
      );
    }

    if (activeBottomTab === 'ports') {
      if (!detectedPorts.length) {
        return <div className="px-4 py-4 text-[12px] text-[#9D9D9D]">{isZh ? '还没有检测到端口。后续运行本地服务后，这里会列出 localhost 端口。' : 'No ports detected yet. Localhost ports will appear here after you run a service.'}</div>;
      }
      return (
        <div className="divide-y divide-[#2A2A2A]">
          {detectedPorts.map((item) => (
            <div key={`${item.port}-${item.source}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
              <div>
                <div className="font-medium text-[#E8E8E8]">localhost:{item.port}</div>
                <div className="mt-1 text-[#8B8B8B]">{item.source}</div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(`http://localhost:${item.port}`)}
                className="rounded border border-[#3A3A3A] px-2 py-1 text-[11px] text-[#D4D4D4] hover:bg-[#252526]"
              >
                {isZh ? '复制地址' : 'Copy URL'}
              </button>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#2A2A2A]">
          {commandHistory.length === 0 ? (
            <div className="px-4 py-4 text-[12px] text-[#9D9D9D]">{isZh ? '终端输出会显示在这里。你也可以直接运行 Git、npm、pnpm、bun 或 powershell 命令。' : 'Terminal output will appear here. Run Git, npm, pnpm, bun, or PowerShell commands here.'}</div>
          ) : (
            commandHistory.slice(0, 8).map((entry, index) => (
              <div key={`${entry.command}-${index}`} className="px-4 py-3">
                <div className="mb-1 font-mono text-[11px] text-[#DCDCAA]">$ {entry.command}</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[#D4D4D4]">{entry.output || ''}</pre>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-[#2A2A2A] px-3 py-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {commandQuickActions.slice(0, 4).map((item) => (
              <button
                key={item.command}
                type="button"
                onClick={() => setCommand(item.command)}
                className="rounded border border-[#3A3A3A] px-2 py-1 text-[11px] text-[#9CDCFE] hover:bg-[#252526]"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded border border-[#3A3A3A] bg-[#1E1E1E] px-3 py-2">
            <span className="font-mono text-[11px] text-[#4EC9B0]">PS</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submitCommand();
                }
              }}
              placeholder={isZh ? '输入命令，例如：git status、npm run build' : 'Type a command, for example: git status'}
              className="h-8 flex-1 bg-transparent font-mono text-[12px] text-[#D4D4D4] outline-none placeholder:text-[#6A6A6A]"
            />
            <button
              type="button"
              onClick={() => submitCommand()}
              disabled={!command.trim() || runningCommand}
              className="rounded bg-[#0E639C] px-3 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningCommand ? (isZh ? '执行中' : 'Running') : (isZh ? '运行' : 'Run')}
            </button>
          </div>
        </div>
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
          {isZh ? '还没有读取到 Git 状态，请先刷新一次。' : 'Git status has not loaded yet. Try refreshing it first.'}
        </div>
      );
    }
    if (!gitStatus.isRepo) {
      return (
          <div className="rounded-md border border-claude-border bg-claude-input p-3 text-[12px] leading-5 text-claude-textSecondary">
            <div className="mb-1 font-medium text-claude-text">{isZh ? '不是 Git 仓库' : 'Not a Git repository'}</div>
            <div>{isZh ? '没有检测到 .git 目录，但你仍然可以浏览文件、编辑内容和运行命令。' : 'No .git folder was detected. You can still edit files and run commands.'}</div>
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
              {gitStatus.clean ? (isZh ? '骞插噣' : 'clean') : gitStatus.summary}
            </span>
          </div>
          {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <div className="mt-2 text-[11px] text-claude-textSecondary">
              {gitStatus.ahead > 0 && <span>{isZh ? `棰嗗厛 ${gitStatus.ahead}` : `ahead ${gitStatus.ahead}`}</span>}
              {gitStatus.ahead > 0 && gitStatus.behind > 0 && <span> 路 </span>}
              {gitStatus.behind > 0 && <span>{isZh ? `钀藉悗 ${gitStatus.behind}` : `behind ${gitStatus.behind}`}</span>}
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
                  {gitFileBusyAction === 'stage_file' ? (isZh ? '处理中...' : 'Working...') : gitFileActionLabel('stage_file', isZh)}
                </button>
                <button
                  onClick={() => runGitFileAction('unstage_file', selectedGitFile)}
                  disabled={!!gitFileBusyAction || !selectedGitFile.staged}
                  className="h-7 px-2 rounded-md border border-claude-border text-[11px] hover:bg-claude-hover disabled:opacity-40"
                >
                  {gitFileBusyAction === 'unstage_file' ? (isZh ? '处理中...' : 'Working...') : gitFileActionLabel('unstage_file', isZh)}
                </button>
                <button
                  onClick={() => runGitFileAction('discard_file', selectedGitFile)}
                  disabled={!!gitFileBusyAction}
                  className="h-7 px-2 rounded-md border border-[#C6613F]/40 text-[#C6613F] text-[11px] hover:bg-[#C6613F]/10 disabled:opacity-40"
                >
                  {gitFileBusyAction === 'discard_file' ? (isZh ? '处理中...' : 'Working...') : gitFileActionLabel('discard_file', isZh)}
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
                      <div className="px-3 py-2 text-[11px] font-medium bg-emerald-500/10 text-emerald-400">{isZh ? '已暂存改动' : 'Staged changes'}</div>
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
            {gitBusyAction === 'pull' ? (isZh ? '拉取中...' : 'Pulling...') : gitActionLabel('pull', isZh)}
          </button>
          <button onClick={() => runGitAction('stage_all')} disabled={!!gitBusyAction || gitStatus.clean} className="h-8 rounded-md border border-claude-border text-[12px] flex items-center justify-center gap-1.5 hover:bg-claude-hover disabled:opacity-50">
            <Check size={13} />
            {gitBusyAction === 'stage_all' ? (isZh ? '暂存中...' : 'Staging...') : gitActionLabel('stage_all', isZh)}
          </button>
        </div>
        <input
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={isZh ? '输入提交说明，例如：修复代码页右侧对话体验' : 'Enter a commit message'}
          className="w-full h-8 rounded-md border border-claude-border bg-claude-input px-2 text-[12px] outline-none focus:border-[#2E7CF6]/70"
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => runGitAction('commit')} disabled={!!gitBusyAction || !commitMessage.trim()} className="h-8 rounded-md bg-claude-text text-claude-bg text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Save size={13} />
            {gitBusyAction === 'commit' ? (isZh ? '提交中...' : 'Committing...') : gitActionLabel('commit', isZh)}
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
                {isZh ? '本地调试' : 'Local mode'}
              </span>
            </div>
            <div className="text-[12px] text-claude-textSecondary mt-1 truncate max-w-[760px]">
              {workspacePath || (isZh ? '选择一个本地项目目录，然后直接在右侧告诉 Claude 你想改什么。' : 'Choose a local folder, then tell Claude what you want to change on the right.')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBottomPane((prev) => !prev)}
              className={`h-8 px-3 rounded-md border text-[12px] flex items-center gap-1.5 transition-colors ${
                showBottomPane ? 'border-[#3A3A3A] text-[#D4D4D4] hover:bg-[#252526]' : 'border-[#0E639C]/45 bg-[#0E639C]/10 text-[#9CDCFE]'
              }`}
              title={isZh ? '切换底部面板' : 'Toggle bottom panel'}
            >
              <div className="grid h-3.5 w-3.5 grid-rows-[1fr_1fr] gap-[2px]">
                <span className="rounded-sm bg-current opacity-90" />
                <span className="rounded-sm bg-current opacity-55" />
              </div>
              {isZh ? '切换底部' : 'Bottom'}
            </button>
            <button
              type="button"
              onClick={() => setShowRightPane((prev) => !prev)}
              className={`h-8 px-3 rounded-md border text-[12px] flex items-center gap-1.5 transition-colors ${
                showRightPane ? 'border-[#3A3A3A] text-[#D4D4D4] hover:bg-[#252526]' : 'border-[#0E639C]/45 bg-[#0E639C]/10 text-[#9CDCFE]'
              }`}
              title={isZh ? '切换右侧面板' : 'Toggle right panel'}
            >
              <div className="grid h-3.5 w-3.5 grid-cols-[1fr_1fr] gap-[2px]">
                <span className="rounded-sm bg-current opacity-55" />
                <span className="rounded-sm bg-current opacity-90" />
              </div>
              {isZh ? '切换侧栏' : 'Side bar'}
            </button>
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
            <button onClick={chooseWorkspace} className="h-8 rounded-md bg-claude-text px-3 text-[12px] font-medium text-claude-bg hover:opacity-90">
              {isZh ? '选择项目目录' : 'Choose workspace'}
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

        {assistantApplyNotice && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-[#2E7CF6]/30 bg-[#2E7CF6]/10 px-3 py-2 text-[12px] text-[#9BC0FF] shrink-0">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>{assistantApplyNotice}</span>
          </div>
        )}

        {!workspacePath ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="max-w-[620px] text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-claude-border bg-claude-input text-claude-textSecondary">
                <FolderOpen size={26} />
              </div>
              <h2 className="mb-2 text-[24px] font-semibold">{isZh ? '先选一个项目目录，再直接和 Claude 说需求' : 'Choose a project folder, then talk to Claude'}</h2>
              <p className="mb-4 text-[14px] leading-7 text-claude-textSecondary">
                {isZh
                  ? '你不需要先懂 Git、命令行或文件树。先把项目目录交给 Claude，后面你就可以直接说“帮我改首页文案”“修一下黑屏”“把这页翻译成简体中文”。'
                  : 'You do not need to understand Git, terminals, or file trees first. Pick a project folder and then describe the change you want Claude to make.'}
              </p>
              <div className="mx-auto mb-5 grid max-w-[560px] grid-cols-3 gap-3 text-left">
                <div className="rounded-2xl border border-claude-border bg-claude-input px-4 py-4">
                  <div className="text-[12px] text-claude-textSecondary">{isZh ? '第 1 步' : 'Step 1'}</div>
                  <div className="mt-2 text-[13px] font-medium text-claude-text">{isZh ? '选择项目目录' : 'Pick a project folder'}</div>
                </div>
                <div className="rounded-2xl border border-claude-border bg-claude-input px-4 py-4">
                  <div className="text-[12px] text-claude-textSecondary">{isZh ? '第 2 步' : 'Step 2'}</div>
                  <div className="mt-2 text-[13px] font-medium text-claude-text">{isZh ? '先让 Claude 看懂项目' : 'Let Claude understand the project'}</div>
                </div>
                <div className="rounded-2xl border border-claude-border bg-claude-input px-4 py-4">
                  <div className="text-[12px] text-claude-textSecondary">{isZh ? '第 3 步' : 'Step 3'}</div>
                  <div className="mt-2 text-[13px] font-medium text-claude-text">{isZh ? '直接描述你想改什么' : 'Describe the change'}</div>
                </div>
              </div>
              <button onClick={chooseWorkspace} className="h-10 rounded-xl bg-claude-text px-5 text-[13px] font-medium text-claude-bg hover:opacity-90">
                {isZh ? '选择项目目录' : 'Choose folder'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            <aside className="border-r border-claude-border min-h-0 flex flex-col shrink-0" style={{ width: leftPaneWidth }}>
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
                    {isZh ? '这个目录目前是空的。' : 'This directory is currently empty.'}
                  </div>
                )}
              </div>
            </aside>
            <div
              className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#0E639C]/50"
              onMouseDown={(event) => startPaneResize('left', event)}
            />
            <main className="min-w-0 min-h-0 flex-1 flex flex-col">
              <div className="h-[42px] px-4 border-b border-claude-border flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate flex items-center gap-2">
                    <span>{selectedFile ? selectedFile.name : (isZh ? '文件预览' : 'File preview')}</span>
                    {isDirty && <span className="rounded border border-[#C6613F]/30 px-1.5 py-0.5 text-[10px] text-[#C6613F]">{isZh ? '未保存' : 'Unsaved'}</span>}
                  </div>
                  <div className="text-[11px] text-claude-textSecondary truncate">
                    {selectedFile ? getRelativePath(workspacePath, selectedFile.path) : (isZh ? '先从左侧选一个文件' : 'Select a file from the left')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFile && (
                    <>
                      <button
                        type="button"
                        onClick={askAboutSelectedFile}
                        className="h-7 rounded-lg border border-claude-border px-2.5 text-[11px] font-medium text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
                      >
                        {isZh ? '问 Claude' : 'Ask Claude'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedFileRelativePath) return;
                          sendEmbeddedAssistantPromptWithContext(
                            isZh
                              ? `请检查当前文件“${selectedFileRelativePath}”里的按钮、标题、提示语和说明文案，把还没汉化的内容改成自然的简体中文，并先告诉我你准备改哪里。`
                              : `Inspect "${selectedFileRelativePath}" for untranslated copy, convert it to natural Simplified Chinese, and tell me what you would change first.`,
                          );
                        }}
                        className="h-7 rounded-lg border border-claude-border px-2.5 text-[11px] font-medium text-claude-textSecondary transition-colors hover:bg-claude-hover hover:text-claude-text"
                      >
                        {isZh ? '翻译文案' : 'Translate copy'}
                      </button>
                      <span className="text-[11px] text-claude-textSecondary">{formatBytes(selectedFile.size)}</span>
                      {isEditableFile && (
                        <button onClick={() => setShowDiff(prev => !prev)} disabled={!isDirty} className={`p-1.5 rounded-md hover:bg-claude-hover disabled:opacity-40 disabled:cursor-not-allowed ${showDiff ? 'text-[#2E7CF6]' : 'text-claude-textSecondary'}`} title={isZh ? '差异预览' : 'Diff preview'}>
                          <GitCompare size={14} />
                        </button>
                      )}
                      {isEditableFile && (
                        <button onClick={revertEditorChanges} disabled={!isDirty} className="p-1.5 rounded-md hover:bg-claude-hover text-claude-textSecondary disabled:opacity-40 disabled:cursor-not-allowed" title={isZh ? '丢弃未保存改动' : 'Discard unsaved changes'}>
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
                    {isZh ? '正在读取文件...' : 'Reading file...'}
                  </div>
                ) : selectedFile ? (
                  selectedFile.binary ? (
                    <div className="h-full flex items-center justify-center px-8">
                      <div className="text-center max-w-[420px]">
                        <File size={30} className="mx-auto text-claude-textSecondary mb-3" />
                        <div className="mb-1 text-[15px] font-medium">{isZh ? '二进制文件' : 'Binary file'}</div>
                        <p className="text-[13px] text-claude-textSecondary leading-6">
                          {isZh ? '这个文件不是纯文本，当前只支持查看基本信息，还不能直接在这里编辑。' : 'This file is not plain text, so you can only inspect basic information here for now.'}
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
                        <span className="text-claude-textSecondary">{changedDiffLines === 0 ? (isZh ? '没有改动' : 'No changes') : `${changedDiffLines} ${isZh ? '处改动' : 'changed lines'}`}</span>
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
                    <div className="relative h-full w-full overflow-hidden bg-[#1E1E1E]">
                      <div
                        ref={editorScrollRef}
                        className="pointer-events-none absolute inset-0 overflow-auto"
                      >
                        <SyntaxHighlighter
                          // @ts-expect-error style typing from dependency
                          style={editorSyntaxTheme}
                          language={codeLanguage}
                          showLineNumbers
                          wrapLongLines
                          customStyle={{
                            margin: 0,
                            minHeight: '100%',
                            background: '#1E1E1E',
                            padding: '16px',
                          }}
                          lineNumberStyle={{
                            minWidth: '2.75em',
                            color: '#6A9955',
                            opacity: 0.9,
                            paddingRight: '18px',
                            userSelect: 'none',
                          }}
                          codeTagProps={{
                            style: {
                              fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
                              fontSize: '12px',
                              lineHeight: 1.65,
                            },
                          }}
                        >
                          {editorContent || ' '}
                        </SyntaxHighlighter>
                      </div>
                      <textarea
                        ref={editorTextareaRef}
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        onScroll={(e) => {
                          if (!editorScrollRef.current) return;
                          editorScrollRef.current.scrollTop = e.currentTarget.scrollTop;
                          editorScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                        }}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                            e.preventDefault();
                            saveSelectedFile();
                          }
                        }}
                        spellCheck={false}
                        className="absolute inset-0 h-full w-full resize-none bg-transparent p-4 font-mono text-[12px] leading-[1.65] text-transparent caret-[#E8E8E8] outline-none selection:bg-[#264F78]"
                      />
                    </div>
                  )
                ) : (
                  <div className="h-full bg-[#181818] text-[#C7C7C7]">
                    <div className="flex h-full items-center justify-center px-8">
                      <div className="w-full max-w-[520px] text-center">
                        <File size={28} className="mx-auto mb-4 text-[#6F6F6F]" />
                        <div className="text-[18px] font-semibold text-[#E8E8E8]">
                          {isZh ? '这里会显示你打开的文件' : 'Open a file to start editing'}
                        </div>
                        <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-7 text-[#9D9D9D]">
                          {isZh
                            ? '左边选文件，中间看内容，右边直接和 Claude 对话。你可以直接说“帮我改这个页面”或者“先解释这个项目是干嘛的”。'
                            : 'Pick a file on the left, review it here, and talk to Claude on the right.'}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={chooseWorkspace}
                            className="h-9 rounded-lg border border-[#3C3C3C] bg-[#252526] px-4 text-[12px] font-medium text-[#E8E8E8] hover:bg-[#2B2B2C]"
                          >
                            {isZh ? '切换项目目录' : 'Choose workspace'}
                          </button>
                          <button
                            type="button"
                            onClick={() => sendEmbeddedAssistantPromptWithContext(workspaceAssistantPrompts[0]?.prompt || (isZh ? '先帮我看懂这个项目。' : 'Help me understand this project first.'))}
                            className="h-9 rounded-lg border border-[#3C3C3C] bg-[#1F1F20] px-4 text-[12px] font-medium text-[#C7C7C7] hover:bg-[#29292A]"
                          >
                            {isZh ? '让 Claude 先看懂项目' : 'Let Claude inspect the project'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {showBottomPane ? (
                <>
                  <div
                    className="h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-[#0E639C]/50"
                    onMouseDown={(event) => startPaneResize('bottom', event)}
                  />
                  <div className="border-t border-claude-border bg-[#181818]" style={{ height: bottomPanelHeight }}>
                <div className="flex h-9 items-center justify-between gap-1 border-b border-claude-border px-3">
                  <div className="flex items-center gap-1">
                  {([
                    ['problems', isZh ? '问题' : 'Problems'],
                    ['output', isZh ? '输出' : 'Output'],
                    ['debug', isZh ? '调试控制台' : 'Debug Console'],
                    ['terminal', isZh ? '终端' : 'Terminal'],
                    ['ports', isZh ? '端口' : 'Ports'],
                  ] as Array<[BottomPanelTab, string]>).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveBottomTab(tab)}
                      className={`relative rounded px-2 py-1 text-[12px] transition-colors ${
                        activeBottomTab === tab
                          ? 'bg-[#2A2D2E] text-[#FFFFFF] after:absolute after:left-2 after:right-2 after:bottom-[-7px] after:h-[2px] after:bg-[#0E70C0] after:content-[\"\"]'
                          : 'text-[#9D9D9D] hover:bg-[#252526] hover:text-[#E8E8E8]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  </div>
                  <div className="flex items-center gap-2 text-[#8B8B8B]">
                    <button
                      type="button"
                      onClick={() => setShowBottomPane(false)}
                      className="rounded-md p-1.5 hover:bg-[#252526] hover:text-[#E8E8E8]"
                      title={isZh ? '隐藏底部面板' : 'Hide bottom panel'}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-36px)] overflow-hidden">
                  {renderBottomPanel()}
                </div>
              </div>
                </>
              ) : null}
            </main>

            {showRightPane ? (
              <>
                <div
                  className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#0E639C]/50"
                  onMouseDown={(event) => startPaneResize('right', event)}
                />
                <aside className="border-l border-claude-border min-h-0 flex flex-col shrink-0 bg-[#181818]" style={{ width: rightPaneWidth }}>
              <input
                ref={assistantFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAssistantFileUpload}
              />
              <div className="border-b border-claude-border">
                <div className="flex h-8 items-center gap-1 px-3 text-[#9A9A9A]">
                  <button type="button" className="rounded p-1 hover:bg-[#252526] hover:text-[#E8E8E8]" title={isZh ? '切换侧栏' : 'Toggle sidebar'}>
                    <div className="grid h-3.5 w-3.5 grid-cols-[1fr_1fr] gap-[2px]">
                      <span className="rounded-sm bg-current opacity-90" />
                      <span className="rounded-sm bg-current opacity-50" />
                    </div>
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-[#252526] hover:text-[#E8E8E8]" title={isZh ? 'AI 面板' : 'AI panel'}>
                    <MessageSquareText size={13} />
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-[#252526] hover:text-[#E8E8E8]" title={isZh ? '对话模式' : 'Chat mode'}>
                    <Ellipsis size={13} />
                  </button>
                </div>
                <div className="h-[42px] px-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#9A9A9A]">
                    <MessageSquareText size={13} />
                    <span>CLAUDE CODE</span>
                  </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => refreshGitStatus()}
                    className="rounded-md p-1.5 text-[#8B8B8B] transition-colors hover:bg-[#252526] hover:text-[#E8E8E8]"
                    title={isZh ? '刷新状态' : 'Refresh'}
                  >
                    <RefreshCw size={13} className={loadingGit ? 'animate-spin' : ''} />
                  </button>
                  {assistantConversationId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${assistantConversationId}`)}
                      className="rounded-md p-1.5 text-[#8B8B8B] transition-colors hover:bg-[#252526] hover:text-[#E8E8E8]"
                      title={isZh ? '打开完整聊天页' : 'Open full chat'}
                    >
                      <ExternalLink size={13} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowRightPane(false)}
                    className="rounded-md p-1.5 text-[#8B8B8B] transition-colors hover:bg-[#252526] hover:text-[#E8E8E8]"
                    title={isZh ? '隐藏右侧面板' : 'Hide right panel'}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              </div>

              <div className="border-b border-claude-border px-3 py-2 text-[11px] text-[#8B8B8B]">
                <div className="truncate">{selectedFile ? selectedFile.name : (isZh ? '未命名对话' : 'Untitled')}</div>
                <div className="mt-1 truncate">{workspacePath || (isZh ? '还没有选择项目目录' : 'No workspace selected')}</div>
              </div>

              <div ref={assistantScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                {assistantConversationLoading ? (
                  <div className="px-4 py-4 text-[12px] text-[#9D9D9D]">{isZh ? '正在加载侧边对话...' : 'Loading the side conversation...'}</div>
                ) : assistantMessages.length > 0 ? (
                  <div className="divide-y divide-[#2A2A2A]">
                    {assistantMessages.map((message, index) => {
                      const codeBlocks = message.role === 'assistant' ? extractCodeBlocks(message.content) : [];
                      const primaryCodeBlock = codeBlocks[0] || '';
                      const cleanContent = stripThinkTags(message.content);
                      return (
                        <div key={message.id || `${message.role}-${index}`} className="px-4 py-4">
                          <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.08em] text-[#8B8B8B]">
                            <span className={message.role === 'user' ? 'text-[#9CDCFE]' : 'text-[#D7BA7D]'}>{message.role === 'user' ? (isZh ? '你' : 'You') : 'Claude'}</span>
                            {message.isThinking ? <span className="text-[#D7BA7D]">{isZh ? '思考中…' : 'Thinking…'}</span> : null}
                          </div>
                          {message.role === 'assistant' ? (
                            <div className={`text-[13px] leading-7 ${message.error ? 'text-[#F48771]' : 'text-[#D4D4D4]'}`}>
                              {cleanContent ? renderAssistantMarkdown(cleanContent) : null}
                              {message.isThinking && message.thinking ? (
                                <div className="mt-3 flex items-center gap-2 font-mono text-[12px] text-[#D7BA7D]">
                                  <Ellipsis size={14} />
                                  <span>{isZh ? 'Thinking…' : 'Thinking…'}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-md border border-[#2A2A2A] bg-[#1F1F20] px-3 py-2 text-[13px] leading-7 text-[#E8E8E8] whitespace-pre-wrap break-words">{message.content}</div>
                          )}
                          {!message.isThinking && (cleanContent || message.content) ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(cleanContent || message.content)}
                                className="rounded border border-[#3A3A3A] px-2 py-1 text-[#9CDCFE] hover:bg-[#252526]"
                              >
                                {isZh ? '复制回复' : 'Copy reply'}
                              </button>
                              {message.role === 'assistant' ? (
                                <button
                                  type="button"
                                  onClick={() => setAssistantDraft(`${isZh ? '继续处理：' : 'Continue with:'}\n${cleanContent || message.content}`)}
                                  className="rounded border border-[#3A3A3A] px-2 py-1 text-[#9CDCFE] hover:bg-[#252526]"
                                >
                                  {isZh ? '继续追问' : 'Continue'}
                                </button>
                              ) : null}
                              {message.role === 'assistant' && primaryCodeBlock && isEditableFile ? (
                                <button
                                  type="button"
                                  onClick={() => applyAssistantCodeToEditor(primaryCodeBlock)}
                                  className="rounded border border-[#2D7D46] px-2 py-1 text-[#89D185] hover:bg-[#1D2A20]"
                                >
                                  {isZh ? '应用到当前文件' : 'Apply to current file'}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <div ref={assistantScrollAnchorRef} />
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-8 text-center">
                    <MessageSquareText size={34} className="mb-4 text-[#D7BA7D]" />
                    <div className="text-[30px] font-semibold text-[#E8E8E8]">{isZh ? '准备开始写代码？' : 'Ready to code?'}</div>
                    <p className="mt-3 max-w-[320px] text-[14px] leading-7 text-[#9D9D9D]">
                      {isZh ? '像 VS Code 侧边栏一样，直接在这里提需求、上传文件或补充上下文。' : 'Work with Claude here. Upload files, add context, or ask it to explain and modify the current project.'}
                    </p>
                  </div>
                )}
                {assistantError ? (
                  <div className="border-t border-[#472B28] px-4 py-3 text-[11px] text-[#F48771]">{assistantError}</div>
                ) : null}
              </div>

              <div className="border-t border-claude-border bg-[#181818] px-3 py-3">
                {assistantAttachments.length ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {assistantAttachments.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded border border-[#3A3A3A] bg-[#1F1F20] px-2 py-1 text-[11px] text-[#D4D4D4]">
                        <span className="max-w-[170px] truncate">{item.name}</span>
                        <button type="button" onClick={() => removeAssistantAttachment(item.id)} className="text-[#8B8B8B] hover:text-[#E8E8E8]">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="rounded-xl border border-[#3A3A3A] bg-[#1E1E1E]">
                  <textarea
                    value={assistantDraft}
                    onChange={(e) => setAssistantDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        sendEmbeddedAssistantMessage();
                      }
                    }}
                    placeholder={isZh ? '直接输入：帮我把这个页面改成简体中文，并让主按钮更明显。' : 'Type your request here.'}
                    className="h-28 w-full resize-none bg-transparent px-3 py-3 text-[13px] leading-7 text-[#E8E8E8] outline-none placeholder:text-[#6A6A6A]"
                  />
                  <div className="flex items-center justify-between border-t border-[#2A2A2A] px-3 py-2">
                    <div className="relative flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAssistantMenu((prev) => !prev)}
                        className="rounded-md p-1.5 text-[#BEBEBE] hover:bg-[#252526] hover:text-[#FFFFFF]"
                        title={isZh ? '添加附件或上下文' : 'Add attachment or context'}
                      >
                        <Upload size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={addCurrentFileAsContext}
                        className="rounded-md border border-[#3A3A3A] px-2 py-1 text-[11px] text-[#9CDCFE] hover:bg-[#252526]"
                      >
                        {isZh ? '添加上下文' : 'Add context'}
                      </button>
                      {showAssistantMenu ? (
                        <div className="absolute bottom-10 left-0 z-20 min-w-[180px] overflow-hidden rounded-lg border border-[#3A3A3A] bg-[#252526] shadow-2xl">
                          <button type="button" onClick={openAssistantUpload} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[#E8E8E8] hover:bg-[#2D2D30]">
                            <Upload size={13} />
                            {isZh ? '从电脑上传' : 'Upload from computer'}
                          </button>
                          <button type="button" onClick={addCurrentFileAsContext} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[#E8E8E8] hover:bg-[#2D2D30]">
                            <File size={13} />
                            {isZh ? '添加当前文件上下文' : 'Add current file context'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#8B8B8B]">{isZh ? 'Ctrl+Enter 发送' : 'Ctrl+Enter to send'}</span>
                      <button
                        type="button"
                        onClick={sendEmbeddedAssistantMessage}
                        disabled={!assistantDraft.trim() || assistantStreaming}
                        className="rounded-md bg-[#C96B42] px-3 py-1.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {assistantStreaming ? (isZh ? '发送中' : 'Sending') : (isZh ? '发送' : 'Send')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
                </aside>
              </>
            ) : null}
          </div>
        )}
      </div>
      {pendingApproval && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setPendingApproval(null)}>
          <div
            className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-claude-border bg-claude-bg shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-claude-border px-6 py-5">
              <div>
                <div className="text-[18px] font-semibold text-claude-text">
                  {isZh ? '需要确认后执行' : 'Approval required'}
                </div>
                <div className="mt-1 text-[13px] leading-6 text-claude-textSecondary">
                  {pendingApproval.approval.message || (isZh ? '这条命令可能会修改项目或影响系统，请先确认后再执行。' : 'This command may change the project or affect the system. Review it before running.')}
                </div>
              </div>
              <button
                onClick={() => setPendingApproval(null)}
                className="rounded-md p-1.5 text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className={`rounded border px-2 py-1 ${riskToneClass(pendingApproval.approval.risk?.level)}`}>
                  {formatRiskLabel(pendingApproval.approval.risk?.level, isZh)}
                </span>
                {pendingApproval.approval.permissionMode && (
                  <span className="rounded border border-claude-border px-2 py-1 text-claude-textSecondary">
                    {getPermissionCopy(pendingApproval.approval.permissionMode as PermissionMode, isZh).label}
                  </span>
                )}
              </div>
              {pendingApproval.approval.risk?.reason && (
                <div className="rounded-xl border border-[#C6613F]/30 bg-[#C6613F]/10 px-4 py-3 text-[13px] leading-6 text-[#ffb49d]">
                  {pendingApproval.approval.risk.reason}
                </div>
              )}
              <pre className="max-h-[220px] overflow-auto rounded-xl border border-claude-border bg-claude-input p-4 font-mono text-[12px] leading-5 text-claude-text">
                {pendingApproval.command}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-claude-border bg-claude-input/40 px-6 py-4">
              <button
                onClick={() => setPendingApproval(null)}
                className="h-9 rounded-xl border border-claude-border px-4 text-[13px] text-claude-textSecondary hover:bg-claude-hover"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => submitCommand(pendingApproval.command, true)}
                disabled={runningCommand}
                className="h-9 rounded-xl bg-[#C6613F] px-4 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {runningCommand ? (isZh ? '执行中...' : 'Running...') : (isZh ? '确认执行' : 'Run anyway')}
              </button>
            </div>
          </div>
        </div>
      )}
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
                        : (isZh ? `这会丢弃 ${workspaceDialog.entry.name} 当前未提交的 Git 改动。` : `This will discard uncommitted Git changes in ${workspaceDialog.entry.name}.`)}
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
                    ? (isZh ? '删除后无法自动撤销，请确认你真的不再需要这个条目。' : 'Deleting this entry cannot be automatically undone. Please confirm you no longer need it.')
                    : (isZh ? '这会用 Git 里的版本替换当前文件。' : 'This will replace the current file with the Git version.')}
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


