import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppWindow,
  Archive,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  FolderCog,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe2,
  Languages,
  LogOut,
  MonitorCog,
  MonitorIcon,
  Palette,
  PlugZap,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
  UserCog,
  UserRound,
  Workflow,
} from 'lucide-react';
import {
  changePassword,
  CodeGitStatusResult,
  deleteSession,
  disconnectGithub,
  getCodeGitStatus,
  getAgentConfig,
  getConversations,
  getGithubAuthUrl,
  getGithubStatus,
  getProviderModels,
  getProjects,
  getSessions,
  getSkills,
  getUserProfile,
  getUserUsage,
  logout,
  logoutOtherSessions,
  updateAgentConfig,
  updateUserProfile,
  Project,
} from '../api';
import ProviderSettings from './ProviderSettings';
import {
  ChatStyle,
  createCustomChatStyle,
  getAllChatStyles,
  getChatStyleDescription,
  getChatStyleLabel,
  getDefaultChatStyleId,
  saveCustomChatStyles,
  setDefaultChatStyleId,
} from '../utils/chatStyles';
import { UiLanguage, getStoredUiLanguage, setStoredUiLanguage } from '../utils/chineseClientText';

interface SettingsPageProps {
  onClose: () => void;
}

type PermissionMode = 'workspace_write' | 'project' | 'full_access';
type SettingsSection =
  | 'general'
  | 'appearance'
  | 'models'
  | 'personalization'
  | 'permissions'
  | 'git'
  | 'mcp'
  | 'environment'
  | 'worktree'
  | 'archived'
  | 'usage'
  | 'account';

const WORK_OPTIONS = [
  '软件工程',
  '产品经理',
  '数据科学',
  '设计',
  '市场运营',
  '研究',
  '教育',
  '金融',
  '法律',
  '医疗健康',
  '自由职业',
  '其他',
];

const OPEN_TARGET_OPTIONS: PickerOption[] = [
  { value: 'vscode', label: 'VS Code', description: '优先在 VS Code 中打开工作区，适合继续编码。', icon: Code2 },
  { value: 'default', label: '默认应用', description: '交给系统默认应用决定如何打开当前路径。', icon: AppWindow },
  { value: 'explorer', label: '文件资源管理器', description: '直接在系统文件夹里查看内容。', icon: FolderOpen },
  { value: 'git-bash', label: 'Git Bash', description: '把工作区作为起点打开 Git Bash。', icon: FolderGit2 },
  { value: 'pycharm', label: 'PyCharm', description: '检测到 JetBrains 环境时用 PyCharm 打开。', icon: FolderCog },
];

const SHELL_OPTIONS: PickerOption[] = [
  { value: 'powershell', label: 'PowerShell', description: 'Windows 下最稳妥，适合大多数命令。', icon: TerminalSquare },
  { value: 'cmd', label: 'Command Prompt', description: '兼容老脚本和传统批处理命令。', icon: MonitorCog },
  { value: 'git-bash', label: 'Git Bash', description: '更适合 Git、Node 和类 Unix 命令。', icon: GitBranch },
  { value: 'wsl', label: 'WSL', description: '如果你装了 WSL，可直接用 Linux 环境执行。', icon: Workflow },
];

const LANGUAGE_OPTIONS: PickerOption[] = [
  { value: 'zh-CN', label: '简体中文', description: '优先显示完整中文界面。', icon: Languages },
  { value: 'en', label: 'English', description: '切回英文界面，方便对照原生 Claude/Codex。', icon: Globe2 },
];

const DENSITY_OPTIONS: PickerOption[] = [
  { value: 'compact', label: '紧凑', description: '信息密度更高，适合长时间工作。', icon: Gauge },
  { value: 'standard', label: '标准', description: '在可读性和紧凑度之间取一个中间值。', icon: Smartphone },
  { value: 'comfortable', label: '舒适', description: '更大的间距和更松的排版。', icon: MonitorIcon },
];

const SETTING_NAV_META: Record<SettingsSection, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; badge?: string }> = {
  general: { label: '常规', icon: MonitorCog },
  appearance: { label: '外观', icon: Palette },
  models: { label: '模型', icon: Bot },
  personalization: { label: '个性化', icon: UserRound },
  permissions: { label: '权限', icon: ShieldCheck },
  git: { label: 'Git', icon: GitBranch },
  mcp: { label: 'MCP 服务器', icon: PlugZap },
  environment: { label: '环境', icon: MonitorCog },
  worktree: { label: '工作树', icon: Workflow },
  archived: { label: '已归档聊天', icon: Archive },
  usage: { label: '使用情况', icon: BarChart3 },
  account: { label: '账号', icon: UserCog },
};

const formatTime = (value?: string) => {
  if (!value) return '—';
  const normalized = value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value;
  const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPercent = (value?: number) => `${Math.max(0, Math.min(100, Number(value || 0))).toFixed(0)}%`;

const formatUsageValue = (used?: number, total?: number) => {
  if (!total) return `${Number(used || 0).toLocaleString()}`;
  return `${Number(used || 0).toLocaleString()} / ${Number(total || 0).toLocaleString()}`;
};

const SectionCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-claude-border bg-claude-input px-6 py-5">
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold text-claude-text">{title}</h3>
      {subtitle && <p className="mt-1 text-[13px] leading-6 text-claude-textSecondary">{subtitle}</p>}
    </div>
    {children}
  </section>
);

type PickerOption = {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const SettingPickerCard = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const CurrentIcon = current.icon;

  return (
    <div ref={rootRef} className="relative rounded-2xl border border-claude-border bg-claude-bg p-4">
      <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-claude-textSecondary/80">{label}</div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
          open ? 'border-[#2E7CF6]/40 bg-[#2E7CF6]/8' : 'border-claude-border hover:bg-claude-hover'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-claude-input text-claude-textSecondary shadow-sm">
            <CurrentIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-claude-text">{current.label}</div>
            <div className="mt-0.5 text-[12px] leading-5 text-claude-textSecondary">{current.description}</div>
          </div>
        </div>
        <ChevronsUpDown size={16} className="shrink-0 text-claude-textSecondary" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-claude-border bg-claude-input shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
          <div className="max-h-[320px] overflow-y-auto p-2">
            {options.map((option) => {
              const OptionIcon = option.icon;
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                    active ? 'bg-[#2E7CF6]/12' : 'hover:bg-claude-hover'
                  }`}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    active ? 'bg-[#2E7CF6]/16 text-[#2E7CF6]' : 'bg-claude-bg text-claude-textSecondary'
                  }`}>
                    <OptionIcon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-[14px] font-medium text-claude-text">{option.label}</div>
                      {active && <Check size={15} className="shrink-0 text-[#2E7CF6]" />}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-5 text-claude-textSecondary">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const PlaceholderSection = ({
  title,
  status,
  description,
  bullets,
}: {
  title: string;
  status: '已接骨架' | '已接入口' | '规划中';
  description: string;
  bullets: string[];
}) => (
  <div className="space-y-5">
    <SectionCard title={title} subtitle={description}>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center rounded-full border border-[#2E7CF6]/20 bg-[#2E7CF6]/10 px-2.5 py-1 text-[12px] font-medium text-[#2E7CF6]">
          {status}
        </span>
      </div>
      <ul className="space-y-2 text-[13px] leading-6 text-claude-textSecondary">
        {bullets.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-claude-textSecondary/60 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  </div>
);

const InfoStat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) => (
  <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
    <div className="text-[13px] text-claude-textSecondary">{label}</div>
    <div className="mt-1 text-[15px] font-medium text-claude-text">{value}</div>
    {hint ? <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">{hint}</div> : null}
  </div>
);

const InlineActionButton = ({
  children,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
      tone === 'danger'
        ? 'border-[#C6613F]/20 text-[#C6613F] hover:bg-[#C6613F]/6'
        : 'border-claude-border text-claude-text hover:bg-claude-hover'
    }`}
  >
    {children}
  </button>
);

const SettingsPage = ({ onClose }: SettingsPageProps) => {
  const navigate = useNavigate();
  const isSelfHosted = localStorage.getItem('user_mode') === 'selfhosted';
  const [section, setSection] = useState<SettingsSection>(() => {
    const saved = localStorage.getItem('settings_section') as SettingsSection | null;
    const validSections: SettingsSection[] = [
      'general',
      'appearance',
      'models',
      'personalization',
      'permissions',
      'git',
      'mcp',
      'environment',
      'worktree',
      'archived',
      'usage',
      'account',
    ];
    return saved && validSections.includes(saved) ? saved : 'general';
  });
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(getStoredUiLanguage());
  const isZh = uiLanguage === 'zh-CN';
  const [uiDensity, setUiDensity] = useState(localStorage.getItem('ui_density') || 'compact');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [chatFont, setChatFont] = useState(localStorage.getItem('chat_font') || 'default');
  const [sendKey, setSendKey] = useState(localStorage.getItem('sendKey') || 'enter');
  const [newlineKey, setNewlineKey] = useState(
    localStorage.getItem('newlineKey') ||
      (localStorage.getItem('sendKey') === 'enter' ? 'shift_enter' : 'enter'),
  );
  const [defaultOpenTarget, setDefaultOpenTarget] = useState(localStorage.getItem('default_open_target') || 'vscode');
  const [integratedShell, setIntegratedShell] = useState(localStorage.getItem('integrated_shell') || 'powershell');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('full_access');

  const [profile, setProfile] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [gitStatus, setGitStatus] = useState<CodeGitStatusResult | null>(null);
  const [skillStats, setSkillStats] = useState({ enabled: 0, builtIn: 0, custom: 0 });
  const [codeCommandTimeout, setCodeCommandTimeout] = useState(localStorage.getItem('code_command_timeout_ms') || '120000');
  const [persistCommandHistory, setPersistCommandHistory] = useState(localStorage.getItem('code_persist_command_history') !== '0');
  const [rememberWorkspace, setRememberWorkspace] = useState(localStorage.getItem('code_remember_workspace') !== '0');
  const [gitPushAfterCommit, setGitPushAfterCommit] = useState(localStorage.getItem('git_push_after_commit') === '1');
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('code_recent_workspaces') || '[]');
      return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const activeWorkspacePath = localStorage.getItem('code_workspace_path') || '';

  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [workFunction, setWorkFunction] = useState('');
  const [personalPreferences, setPersonalPreferences] = useState('');
  const [defaultModel, setDefaultModel] = useState(localStorage.getItem('default_model') || 'claude-opus-4-6-thinking');
  const [providerModels, setProviderModels] = useState<Array<{ base: string; label: string }>>([]);

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);

  const [chatStyles, setChatStyles] = useState<ChatStyle[]>(() => getAllChatStyles());
  const [defaultChatStyle, setDefaultChatStyle] = useState(() => getDefaultChatStyleId());
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDescription, setNewStyleDescription] = useState('');
  const [newStyleInstructions, setNewStyleInstructions] = useState('');
  const [styleError, setStyleError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    localStorage.removeItem('settings_section');
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        if (isSelfHosted) {
          const saved = JSON.parse(localStorage.getItem('user_profile') || '{}');
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const nextProfile = { ...user, ...saved };
          setProfile(nextProfile);
          setFullName(nextProfile.full_name || nextProfile.nickname || '');
          setDisplayName(nextProfile.display_name || nextProfile.nickname || '');
          setWorkFunction(nextProfile.work_function || '');
          setPersonalPreferences(nextProfile.personal_preferences || '');
        } else {
          const data = await getUserProfile();
          const nextProfile = data?.user || data || {};
          setProfile(nextProfile);
          setFullName(nextProfile.full_name || nextProfile.nickname || '');
          setDisplayName(nextProfile.display_name || nextProfile.nickname || '');
          setWorkFunction(nextProfile.work_function || '');
          setPersonalPreferences(nextProfile.personal_preferences || '');
          setTheme(nextProfile.theme || localStorage.getItem('theme') || 'dark');
          setChatFont(nextProfile.chat_font || localStorage.getItem('chat_font') || 'default');
          setDefaultModel(nextProfile.default_model || localStorage.getItem('default_model') || 'claude-opus-4-6-thinking');
        }
      } catch {
        // ignore
      }

      try {
        const data = await getUserUsage();
        setUsage(data);
      } catch {
        setUsage(null);
      }

      try {
        const data = await getSessions();
        setSessions(data.sessions || []);
        setCurrentSessionId(data.currentSessionId || '');
      } catch {
        setSessions([]);
        setCurrentSessionId('');
      }

      try {
        const config = await getAgentConfig();
        setPermissionMode(config.permissionMode || 'full_access');
      } catch {
        setPermissionMode('full_access');
      }

      if (isSelfHosted) {
        try {
          const models = await getProviderModels();
          setProviderModels(models.map((m: any) => ({ base: m.id, label: m.name || m.id })));
        } catch {
          setProviderModels([]);
        }
      }

      try {
        const data = await getProjects();
        setProjects(Array.isArray(data) ? data : []);
      } catch {
        setProjects([]);
      }

      try {
        const data = await getConversations();
        setRecentConversations(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        setRecentConversations([]);
      }

      try {
        const data = await getGithubStatus();
        setGithubConnected(!!data?.connected);
      } catch {
        setGithubConnected(false);
      }

      if (activeWorkspacePath) {
        try {
          const data = await getCodeGitStatus(activeWorkspacePath);
          setGitStatus(data);
        } catch {
          setGitStatus(null);
        }
      } else {
        setGitStatus(null);
      }

      try {
        const data = await getSkills();
        const examples = Array.isArray(data?.examples) ? data.examples : [];
        const mine = Array.isArray(data?.my_skills) ? data.my_skills : [];
        const all = [...examples, ...mine];
        setSkillStats({
          enabled: all.filter((item: any) => item?.enabled).length,
          builtIn: examples.length,
          custom: mine.length,
        });
      } catch {
        setSkillStats({ enabled: 0, builtIn: 0, custom: 0 });
      }
    };

    load();
  }, [activeWorkspacePath, isSelfHosted]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-density', uiDensity);
  }, [uiDensity]);

  useEffect(() => {
    document.documentElement.setAttribute('data-chat-font', chatFont);
  }, [chatFont]);

  const navItems = useMemo(() => {
    const items: Array<{ key: SettingsSection; label: string; badge?: string }> = [
      { key: 'general', label: '常规' },
      { key: 'appearance', label: '外观' },
      ...(isSelfHosted ? [{ key: 'models', label: '模型' as const }] : []),
      { key: 'personalization', label: '个性化' },
      { key: 'permissions', label: '权限' },
      { key: 'git', label: 'Git' },
      { key: 'mcp', label: 'MCP 服务器' },
      { key: 'environment', label: '环境' },
      { key: 'worktree', label: '工作树' },
      { key: 'archived', label: '已归档聊天' },
      { key: 'usage', label: '使用情况' },
      ...(!isSelfHosted ? [{ key: 'account', label: '账号' as const }] : []),
    ];
    return items;
  }, [isSelfHosted]);

  const defaultModelIsThinking = defaultModel.endsWith('-thinking');
  const defaultModelBase = defaultModel.replace(/-thinking$/, '');
  const defaultModelOptions =
    isSelfHosted && providerModels.length > 0
      ? providerModels
      : [
          { base: 'claude-opus-4-6', label: 'Opus 4.6' },
          { base: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
          { base: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
        ];

  const presetChatStyles = chatStyles.filter((style) => style.kind === 'preset');
  const customChatStyles = chatStyles.filter((style) => style.kind === 'custom');

  const initials = (displayName || fullName || profile?.nickname || 'U').slice(0, 1).toUpperCase();
  const archivedProjects = useMemo(
    () => projects.filter((project) => Number(project.is_archived) === 1),
    [projects],
  );
  const linkedSourceCount = useMemo(
    () => projects.reduce((total, project) => total + (project.github_sources?.length || 0), 0),
    [projects],
  );

  const persistProfile = async () => {
    const payload = {
      full_name: fullName,
      display_name: displayName,
      work_function: workFunction,
      personal_preferences: personalPreferences,
      theme,
      chat_font: chatFont,
    };

    try {
      if (isSelfHosted) {
        localStorage.setItem('user_profile', JSON.stringify(payload));
        setProfile((prev: any) => ({ ...(prev || {}), ...payload }));
      } else {
        const data = await updateUserProfile(payload);
        setProfile((prev: any) => ({ ...(prev || {}), ...(data || {}) }));
      }
      window.dispatchEvent(new Event('userProfileUpdated'));
      setSaveMsg('已保存');
      window.setTimeout(() => setSaveMsg(''), 2000);
    } catch (error: any) {
      setSaveMsg(error?.message || '保存失败');
    }
  };

  const applyTheme = (nextTheme: string) => {
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    const root = document.documentElement;
    if (nextTheme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else if (nextTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      root.classList.toggle('dark', prefersDark);
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
    if (!isSelfHosted) {
      updateUserProfile({ theme: nextTheme }).catch(() => {});
    }
  };

  const applyFont = (nextFont: string) => {
    setChatFont(nextFont);
    localStorage.setItem('chat_font', nextFont);
    document.documentElement.setAttribute('data-chat-font', nextFont);
    if (!isSelfHosted) {
      updateUserProfile({ chat_font: nextFont }).catch(() => {});
    }
  };

  const applyLanguage = (language: UiLanguage) => {
    setUiLanguage(language);
    setStoredUiLanguage(language);
  };

  const applyUiDensity = (density: string) => {
    setUiDensity(density);
    localStorage.setItem('ui_density', density);
    document.documentElement.setAttribute('data-ui-density', density);
  };

  const applyPermissionMode = async (mode: PermissionMode) => {
    setPermissionMode(mode);
    try {
      const config = await updateAgentConfig({ permissionMode: mode });
      setPermissionMode(config.permissionMode || mode);
      window.dispatchEvent(new CustomEvent('agentConfigUpdated', { detail: config }));
    } catch {
      // ignore
    }
  };

  const saveBooleanPref = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value);
    localStorage.setItem(key, value ? '1' : '0');
  };

  const saveStringPref = (key: string, value: string, setter: (value: string) => void) => {
    setter(value);
    localStorage.setItem(key, value);
  };

  const openCodePage = () => {
    onClose();
    navigate('/code');
  };

  const openProjectsPage = () => {
    onClose();
    navigate('/projects');
  };

  const openChatPage = (conversationId: string) => {
    onClose();
    navigate(`/chat/${conversationId}`);
  };

  const clearWorkspaceHistory = () => {
    setRecentWorkspaces([]);
    localStorage.removeItem('code_recent_workspaces');
  };

  const clearCurrentWorkspace = () => {
    localStorage.removeItem('code_workspace_path');
    setGitStatus(null);
  };

  const handleGithubConnect = async () => {
    try {
      const { url } = await getGithubAuthUrl();
      const api = (window as any).electronAPI;
      if (api?.openExternal) api.openExternal(url);
      else window.open(url, '_blank');
    } catch {
      // ignore
    }
  };

  const handleGithubDisconnect = async () => {
    try {
      await disconnectGithub();
      setGithubConnected(false);
    } catch {
      // ignore
    }
  };

  const applyDefaultModel = (base: string, thinking: boolean) => {
    const next = thinking ? `${base}-thinking` : base;
    setDefaultModel(next);
    localStorage.setItem('default_model', next);
    if (!isSelfHosted) {
      updateUserProfile({ default_model: next }).catch(() => {});
    }
  };

  const handleCreateStyle = () => {
    const name = newStyleName.trim();
    const instructions = newStyleInstructions.trim();
    if (!name || !instructions) {
      setStyleError(uiLanguage === 'zh-CN' ? '名称和风格说明都要填写。' : 'Please fill in both the style name and the instructions.');
      return;
    }
    const created = createCustomChatStyle({
      name,
      description: newStyleDescription.trim(),
      instructions,
    });
    const nextStyles = [...chatStyles, created];
    setChatStyles(nextStyles);
    saveCustomChatStyles(nextStyles);
    setNewStyleName('');
    setNewStyleDescription('');
    setNewStyleInstructions('');
    setStyleError('');
  };

  const handleDeleteStyle = (styleId: string) => {
    const nextStyles = chatStyles.filter((style) => style.id !== styleId);
    setChatStyles(nextStyles);
    saveCustomChatStyles(nextStyles);
    if (defaultChatStyle === styleId) {
      const fallback = nextStyles[0]?.id || 'balanced';
      setDefaultChatStyle(fallback);
      setDefaultChatStyleId(fallback);
    }
  };

  const handleChangePassword = async () => {
    setPwdError('');
    setPwdMsg('');
    if (!pwdCurrent || !pwdNew || !pwdConfirm) {
      setPwdError('请填写所有字段');
      return;
    }
    if (pwdNew.length < 6) {
      setPwdError('新密码至少 6 位');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('两次输入的新密码不一致');
      return;
    }

    setPwdSaving(true);
    try {
      await changePassword(pwdCurrent, pwdNew);
      setPwdMsg('密码已更新，其他设备将重新登录。');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
    } catch (error: any) {
      setPwdError(error?.message || '修改失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const currentSection = (() => {
    switch (section) {
      case 'general':
        return (
          <div className="space-y-5">
            <SectionCard title="常规" subtitle="先把常用的基础选项收在这里，尽量对齐原生 Claude / Codex 的设置结构。">
              <div className="grid grid-cols-2 gap-4">
                <SettingPickerCard
                  label="默认打开目标"
                  value={defaultOpenTarget}
                  options={OPEN_TARGET_OPTIONS}
                  onChange={(next) => {
                    setDefaultOpenTarget(next);
                    localStorage.setItem('default_open_target', next);
                  }}
                />
                <SettingPickerCard
                  label="集成终端 Shell"
                  value={integratedShell}
                  options={SHELL_OPTIONS}
                  onChange={(next) => {
                    setIntegratedShell(next);
                    localStorage.setItem('integrated_shell', next);
                  }}
                />
                <SettingPickerCard
                  label="语言"
                  value={uiLanguage}
                  options={LANGUAGE_OPTIONS}
                  onChange={(next) => applyLanguage(next as UiLanguage)}
                />
                <SettingPickerCard
                  label="详细级别"
                  value={uiDensity}
                  options={DENSITY_OPTIONS}
                  onChange={applyUiDensity}
                />
              </div>
              <div className="mt-4 rounded-xl border border-[#2E7CF6]/18 bg-[#2E7CF6]/8 px-4 py-3 text-[12px] leading-6 text-claude-textSecondary">
                说明：`默认打开目标` 会影响聊天页右上角“打开工作区”的行为；`集成终端 Shell` 会影响 Code 模式命令面板使用的默认解释器。
              </div>
            </SectionCard>

            {!isSelfHosted && (
              <SectionCard title="默认模型" subtitle="影响新建聊天默认使用的 Clawparrot 模型。">
                <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                  <div>
                    <div className="text-[13px] text-claude-textSecondary mb-1.5">默认模型</div>
                    <select
                      value={defaultModelBase}
                      onChange={(e) => applyDefaultModel(e.target.value, defaultModelIsThinking)}
                      className="w-full rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none"
                    >
                      {defaultModelOptions.map((model) => (
                        <option key={model.base} value={model.base}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => applyDefaultModel(defaultModelBase, !defaultModelIsThinking)}
                    className={`h-[46px] rounded-xl border px-4 text-[13px] font-medium transition-colors ${
                      defaultModelIsThinking
                        ? 'border-[#2E7CF6]/30 bg-[#2E7CF6]/10 text-[#2E7CF6]'
                        : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'
                    }`}
                  >
                    {defaultModelIsThinking ? '已开启深度思考' : '开启深度思考'}
                  </button>
                </div>
              </SectionCard>
            )}

            <SectionCard title="输入行为" subtitle="这部分是原生产品里最常用的发送和换行习惯。">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">发送消息</div>
                  <select
                    value={sendKey}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSendKey(next);
                      localStorage.setItem('sendKey', next);
                    }}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="enter">Enter</option>
                    <option value="ctrl_enter">Ctrl+Enter</option>
                    <option value="alt_enter">Alt+Enter</option>
                    <option value="cmd_enter">Cmd+Enter</option>
                  </select>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">换行</div>
                  <select
                    value={newlineKey}
                    onChange={(e) => {
                      setNewlineKey(e.target.value);
                      localStorage.setItem('newlineKey', e.target.value);
                    }}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="enter">Enter</option>
                    <option value="shift_enter">Shift+Enter</option>
                    <option value="ctrl_enter">Ctrl+Enter</option>
                    <option value="alt_enter">Alt+Enter</option>
                  </select>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="用户模式" subtitle="保留你现在这套自部署 / Clawparrot 双模式切换。">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'selfhosted', label: '自部署', desc: '使用你自己的 API Key 和本地配置' },
                  { value: 'clawparrot', label: 'Clawparrot', desc: '使用托管 API 服务' },
                ].map((item) => {
                  const active = (localStorage.getItem('user_mode') || 'selfhosted') === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => {
                        const prevMode = localStorage.getItem('user_mode') || 'selfhosted';
                        const nextMode = item.value;
                        localStorage.setItem('user_mode', nextMode);
                        if (prevMode !== nextMode) {
                          localStorage.removeItem('chat_models');
                          localStorage.removeItem('default_model');
                          if (nextMode === 'clawparrot') {
                            localStorage.removeItem('CUSTOM_API_KEY');
                            localStorage.removeItem('CUSTOM_BASE_URL');
                          }
                          localStorage.removeItem('cross_mode_overrides');
                        }
                        window.location.reload();
                      }}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${
                        active
                          ? 'border-[#2E7CF6]/40 bg-[#2E7CF6]/10'
                          : 'border-claude-border hover:bg-claude-hover'
                      }`}
                    >
                      <div className="text-[14px] font-medium text-claude-text">{item.label}</div>
                      <div className="mt-1 text-[12px] leading-5 text-claude-textSecondary">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-5">
            <SectionCard title="外观" subtitle="把最影响观感的几项集中到一起，顺手做一轮界面收紧。">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'light', label: '浅色' },
                  { value: 'auto', label: '跟随系统' },
                  { value: 'dark', label: '深色' },
                ].map((item) => {
                  const active = theme === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => applyTheme(item.value)}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${
                        active ? 'border-[#2E7CF6]/40 bg-[#2E7CF6]/10' : 'border-claude-border hover:bg-claude-hover'
                      }`}
                    >
                      <div className="text-[14px] font-medium text-claude-text">{item.label}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="聊天字体" subtitle="你提到内容偏大、不够紧凑，所以这里保留字体和密度两层调节。">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { value: 'default', label: '默认' },
                  { value: 'sans', label: 'Sans' },
                  { value: 'system', label: '系统' },
                  { value: 'dyslexic', label: '易读' },
                ].map((item) => {
                  const active = chatFont === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => applyFont(item.value)}
                      className={`rounded-xl border px-4 py-4 text-center transition-all ${
                        active ? 'border-[#2E7CF6]/40 bg-[#2E7CF6]/10' : 'border-claude-border hover:bg-claude-hover'
                      }`}
                    >
                      <div className="text-[18px] mb-1 text-claude-text">Aa</div>
                      <div className="text-[13px] font-medium text-claude-text">{item.label}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="关于" subtitle="应用标识与版本信息。">
              <div className="flex items-center justify-between rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                <div>
                  <div className="text-[14px] font-medium text-claude-text">claude-desktop-cn</div>
                  <div className="mt-1 text-[12px] text-claude-textSecondary">Windows 桌面客户端</div>
                </div>
                <div className="text-[13px] font-mono text-claude-text">v{__APP_VERSION__}</div>
              </div>
            </SectionCard>
          </div>
        );

      case 'models':
        return (
          <div className="space-y-5">
            <SectionCard title="模型" subtitle="这里保留自部署模型配置页，作为原生骨架里的模型入口。">
              <ProviderSettings />
            </SectionCard>
          </div>
        );

      case 'personalization':
        return (
          <div className="space-y-5">
            <SectionCard title="个人资料" subtitle="这部分会影响 Claude 在所有对话里的称呼、偏好和默认表达方式。">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-4 items-start">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-claude-btn-hover text-[24px] font-medium text-claude-text">
                  {initials}
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 text-[13px] text-claude-textSecondary">全名</div>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none"
                      placeholder="例如你的真实姓名"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[13px] text-claude-textSecondary">你的职业是什么？</div>
                    <select
                      value={workFunction}
                      onChange={(e) => setWorkFunction(e.target.value)}
                      className="w-full rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none"
                    >
                      <option value="">选择你的职业</option>
                      {WORK_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 text-[13px] text-claude-textSecondary">Claude 应该怎么称呼你？</div>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none"
                      placeholder="例如你的名字或昵称"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[13px] text-claude-textSecondary">Claude 在回答中应考虑哪些个人偏好？</div>
                    <textarea
                      value={personalPreferences}
                      onChange={(e) => setPersonalPreferences(e.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none resize-none"
                      placeholder="例如：默认使用中文、代码注释保留英文、回答先给结论。"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                {saveMsg && <span className="text-[12px] text-claude-textSecondary">{saveMsg}</span>}
                <button
                  onClick={persistProfile}
                  className="rounded-xl bg-claude-text px-4 py-2 text-[13px] font-medium text-claude-bg hover:opacity-90"
                >
                  保存资料
                </button>
              </div>
            </SectionCard>

            <SectionCard title="回答风格" subtitle="默认风格会作用于新对话；你也可以保存自己的聊天风格模板。">
              <div className="space-y-5">
                <div>
                  <div className="mb-3 text-[13px] text-claude-textSecondary">默认风格</div>
                  <div className="grid grid-cols-2 gap-3">
                    {presetChatStyles.map((style) => {
                      const active = defaultChatStyle === style.id;
                      return (
                        <button
                          key={style.id}
                          onClick={() => {
                            setDefaultChatStyle(style.id);
                            setDefaultChatStyleId(style.id);
                          }}
                          className={`rounded-xl border px-4 py-4 text-left transition-all ${
                            active
                              ? 'border-[#2E7CF6]/40 bg-[#2E7CF6]/10'
                              : 'border-claude-border hover:bg-claude-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[14px] font-medium text-claude-text">
                              {getChatStyleLabel(style, uiLanguage)}
                            </div>
                            {active && <Check size={14} className="text-[#2E7CF6]" />}
                          </div>
                          <div className="mt-1.5 text-[12px] leading-5 text-claude-textSecondary">
                            {getChatStyleDescription(style, uiLanguage)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-[13px] text-claude-textSecondary">自定义风格</div>
                  {customChatStyles.length > 0 ? (
                    <div className="space-y-3">
                      {customChatStyles.map((style) => (
                        <div key={style.id} className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-[14px] font-medium text-claude-text">{style.name}</div>
                              {style.description && (
                                <div className="mt-1 text-[12px] text-claude-textSecondary">{style.description}</div>
                              )}
                              <div className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-claude-textSecondary">
                                {style.instructions}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setDefaultChatStyle(style.id);
                                  setDefaultChatStyleId(style.id);
                                }}
                                className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                              >
                                设为默认
                              </button>
                              <button
                                onClick={() => handleDeleteStyle(style.id)}
                                className="rounded-lg border border-red-500/20 px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-500/5"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-claude-border px-4 py-4 text-[12px] text-claude-textSecondary">
                      还没有自定义风格，下面可以直接新建一套。
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-4 text-[14px] font-medium text-claude-text">新建风格</div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      value={newStyleName}
                      onChange={(e) => {
                        setNewStyleName(e.target.value);
                        setStyleError('');
                      }}
                      className="rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
                      placeholder="风格名称"
                    />
                    <input
                      value={newStyleDescription}
                      onChange={(e) => setNewStyleDescription(e.target.value)}
                      className="rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
                      placeholder="适用场景简介"
                    />
                  </div>
                  <textarea
                    value={newStyleInstructions}
                    onChange={(e) => {
                      setNewStyleInstructions(e.target.value);
                      setStyleError('');
                    }}
                    rows={4}
                    className="mt-4 w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none resize-none"
                    placeholder="例如：先给结论，再列风险与下一步；默认中文，术语保留英文。"
                  />
                  {styleError && <div className="mt-2 text-[12px] text-red-500">{styleError}</div>}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleCreateStyle}
                      className="rounded-xl bg-claude-text px-4 py-2 text-[13px] font-medium text-claude-bg hover:opacity-90"
                    >
                      保存风格
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'permissions':
        return (
          <div className="space-y-5">
            <SectionCard
              title="权限"
              subtitle="这套权限会影响聊天页里的执行模式和代码页里的命令能力。你想要的“像我这样能动文件和命令”，核心就是这里。"
            >
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    value: 'workspace_write' as PermissionMode,
                    label: '安全模式',
                    desc: '只允许当前工作区文件操作，禁用命令执行。',
                  },
                  {
                    value: 'project' as PermissionMode,
                    label: '项目权限',
                    desc: '允许当前工作区文件操作与命令执行，但不越界访问全盘。',
                  },
                  {
                    value: 'full_access' as PermissionMode,
                    label: '完全访问',
                    desc: '允许全盘文件操作和命令执行，请谨慎使用。',
                  },
                ].map((item) => {
                  const active = permissionMode === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => applyPermissionMode(item.value)}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${
                        active
                          ? 'border-[#C6613F]/40 bg-[#C6613F]/10'
                          : 'border-claude-border hover:bg-claude-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[14px] font-medium text-claude-text">{item.label}</div>
                        {active && <Check size={14} className="text-[#C6613F]" />}
                      </div>
                      <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        );

      case 'git':
        return (
          <div className="space-y-5">
            <SectionCard
              title="Git"
              subtitle={
                isZh
                  ? '把仓库状态、Git 偏好和 Code 工作流入口收在一起，方便检查差异、整理来源和准备发布。'
                  : 'Bring repository status, Git preferences, and Code workflow entry points together for reviewing diffs, organizing sources, and preparing releases.'
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <InfoStat
                  label={isZh ? '当前工作区' : 'Current workspace'}
                  value={activeWorkspacePath || (isZh ? '未选择' : 'Not selected')}
                  hint={activeWorkspacePath || (isZh ? '先去 Code 选择一个本地目录。' : 'Choose a local folder in Code first.')}
                />
                <InfoStat
                  label={isZh ? '仓库状态' : 'Repository status'}
                  value={
                    !activeWorkspacePath
                      ? isZh ? '未初始化' : 'Not initialized'
                      : gitStatus?.isRepo
                        ? isZh ? '已检测到 Git 仓库' : 'Git repository detected'
                        : isZh ? '不是 Git 仓库' : 'Not a Git repository'
                  }
                  hint={gitStatus?.isRepo ? `${gitStatus.branch || 'main'} · ${gitStatus.summary || ''}` : (isZh ? 'Code 页会根据这里决定是否显示 diff 和提交面板。' : 'Code uses this to decide whether to show diff and commit controls.')}
                />
                <InfoStat
                  label={isZh ? '已挂接仓库来源' : 'Linked sources'}
                  value={linkedSourceCount}
                  hint={isZh ? '来自 Projects 的 GitHub 仓库来源。' : 'GitHub repository sources attached from Projects.'}
                />
              </div>

              <div className="mt-4 rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium text-claude-text">{isZh ? '最近 Git 改动' : 'Recent Git changes'}</div>
                    <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">
                      {isZh ? '这里是轻量总览。单文件 diff、暂存、取消暂存和撤销都在 Code 页继续处理。' : 'This is a lightweight overview. Single-file diff, stage, unstage, and restore continue in Code.'}
                    </div>
                  </div>
                  <InlineActionButton onClick={openCodePage}>{isZh ? '打开 Code' : 'Open Code'}</InlineActionButton>
                </div>

                {gitStatus?.isRepo && gitStatus.files.length > 0 ? (
                  <div className="space-y-2">
                    {gitStatus.files.slice(0, 6).map((file) => (
                      <div key={file.path} className="flex items-center justify-between gap-3 rounded-lg border border-claude-border px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-claude-text">{file.path}</div>
                          <div className="mt-1 text-[11px] text-claude-textSecondary">
                            {file.code || 'M'}{file.staged ? (isZh ? ' · 已暂存' : ' · staged') : ''}{file.unstaged ? (isZh ? ' · 工作区' : ' · working tree') : ''}
                          </div>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-claude-textSecondary" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-claude-border px-3 py-4 text-[13px] leading-6 text-claude-textSecondary">
                    {isZh ? '当前没有可展示的 Git 变更。' : 'There are no Git changes to show right now.'}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-medium text-claude-text">{isZh ? '提交后自动推送' : 'Push after commit'}</div>
                      <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '完成 commit 后自动执行 push，适合发布流。' : 'Run push automatically after a successful commit.'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveBooleanPref('git_push_after_commit', !gitPushAfterCommit, setGitPushAfterCommit)}
                      className={`relative h-7 w-12 rounded-full transition-colors ${gitPushAfterCommit ? 'bg-[#2E7CF6]' : 'bg-claude-border'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${gitPushAfterCommit ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[14px] font-medium text-claude-text">{isZh ? '下一步建议' : 'Suggested next step'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <InlineActionButton onClick={openCodePage}>{isZh ? '查看差异' : 'Review diff'}</InlineActionButton>
                    <InlineActionButton onClick={openProjectsPage}>{isZh ? '整理项目来源' : 'Open Projects'}</InlineActionButton>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'mcp':
        return (
          <div className="space-y-5">
            <SectionCard
              title={isZh ? 'MCP 与外部能力' : 'MCP and external capabilities'}
              subtitle={isZh ? '把 GitHub、Skills 和权限范围做成一个实用总览，后续再补逐个服务诊断。' : 'A practical overview for GitHub, Skills, and permission scope. Per-service diagnostics can land next.'}
            >
              <div className="grid grid-cols-3 gap-4">
                <InfoStat
                  label="GitHub"
                  value={githubConnected === null ? (isZh ? '检查中' : 'Checking') : githubConnected ? (isZh ? '已连接' : 'Connected') : (isZh ? '未连接' : 'Disconnected')}
                  hint={isZh ? 'Add from GitHub、项目仓库来源和仓库选择器都依赖这条连接。' : 'Add from GitHub, project sources, and repository pickers all depend on this connection.'}
                />
                <InfoStat label={isZh ? '已启用 Skills' : 'Enabled skills'} value={skillStats.enabled} hint={isZh ? `内置 ${skillStats.builtIn} · 自定义 ${skillStats.custom}` : `Built-in ${skillStats.builtIn} · Custom ${skillStats.custom}`} />
                <InfoStat label={isZh ? '权限范围' : 'Permission scope'} value={permissionMode} hint={isZh ? '命令、文件和外部能力都会受当前权限模式影响。' : 'Commands, files, and external capabilities are constrained by the current permission mode.'} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[14px] font-medium text-claude-text">{isZh ? 'GitHub 连接' : 'GitHub connection'}</div>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                    {githubConnected ? (isZh ? '当前已经可用，可以继续挂接仓库来源。' : 'The connection is ready. You can keep attaching repository sources.') : (isZh ? '连接后，仓库选择和项目来源会更顺手。' : 'Once connected, repository picking and project sources become smoother.')}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {githubConnected ? (
                      <InlineActionButton tone="danger" onClick={handleGithubDisconnect}>{isZh ? '断开 GitHub' : 'Disconnect GitHub'}</InlineActionButton>
                    ) : (
                      <InlineActionButton onClick={handleGithubConnect}>{isZh ? '连接 GitHub' : 'Connect GitHub'}</InlineActionButton>
                    )}
                    <InlineActionButton onClick={openProjectsPage}>{isZh ? '打开 Projects' : 'Open Projects'}</InlineActionButton>
                    <InlineActionButton onClick={() => setSection('permissions')}>{isZh ? '查看权限设置' : 'Open permissions'}</InlineActionButton>
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[14px] font-medium text-claude-text">{isZh ? '下一层准备补什么' : 'What lands next'}</div>
                  <ul className="mt-3 space-y-2 text-[12px] leading-6 text-claude-textSecondary">
                    <li>• {isZh ? '逐个 MCP 服务开关和状态检测' : 'Per-service MCP toggles and status checks'}</li>
                    <li>• {isZh ? '能力来源说明、权限提示和失败诊断' : 'Capability source hints, permission prompts, and failure diagnostics'}</li>
                    <li>• {isZh ? '更完整的 Skills 分类和调用说明' : 'A richer Skills catalog and invocation guide'}</li>
                  </ul>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'environment':
        return (
          <div className="space-y-5">
            <SectionCard title={isZh ? '环境' : 'Environment'} subtitle={isZh ? '集中管理会影响 Code 页体验的 Shell、超时、命令历史和工作区记忆。' : 'Manage the shell, timeout, command history, and workspace memory used by Code.'}>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-1 text-[13px] text-claude-textSecondary">{isZh ? '命令超时' : 'Command timeout'}</div>
                  <select
                    value={codeCommandTimeout}
                    onChange={(e) => saveStringPref('code_command_timeout_ms', e.target.value, setCodeCommandTimeout)}
                    className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
                  >
                    <option value="60000">60s</option>
                    <option value="120000">120s</option>
                    <option value="300000">300s</option>
                    <option value="600000">600s</option>
                  </select>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '长任务可以设长一点，排查小问题时可以设短一点。' : 'Use a higher limit for long jobs and a lower one while debugging small commands.'}</div>
                </div>
                <InfoStat
                  label={isZh ? '当前默认 Shell' : 'Current default shell'}
                  value={integratedShell === 'powershell' ? 'PowerShell' : integratedShell === 'cmd' ? 'Command Prompt' : integratedShell === 'git-bash' ? 'Git Bash' : 'WSL'}
                  hint={isZh ? '也可以在“常规”里切换。' : 'You can also change this in General.'}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                {[
                  {
                    key: 'code_persist_command_history',
                    value: persistCommandHistory,
                    setter: setPersistCommandHistory,
                    title: isZh ? '保留命令历史' : 'Persist command history',
                    desc: isZh ? '重新打开应用后，命令面板还能记住最近输入。' : 'Keep recent command input available after reopening the app.',
                  },
                  {
                    key: 'code_remember_workspace',
                    value: rememberWorkspace,
                    setter: setRememberWorkspace,
                    title: isZh ? '记住最近工作区' : 'Remember recent workspaces',
                    desc: isZh ? '下次进入 Code 时优先回到最近目录。' : 'Prefer the most recently used folder when entering Code.',
                  },
                ].map((item) => (
                  <div key={item.key} className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[14px] font-medium text-claude-text">{item.title}</div>
                        <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">{item.desc}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveBooleanPref(item.key, !item.value, item.setter)}
                        className={`relative h-7 w-12 rounded-full transition-colors ${item.value ? 'bg-[#2E7CF6]' : 'bg-claude-border'}`}
                      >
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${item.value ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        );

      case 'worktree':
        return (
          <div className="space-y-5">
            <SectionCard title={isZh ? '工作区与工作树' : 'Workspace and worktree'} subtitle={isZh ? '把当前目录、最近目录和清理动作集中到这里。' : 'Centralize the current folder, recent folders, and cleanup actions here.'}>
              <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">{isZh ? '当前工作区' : 'Current workspace'}</div>
                  <div className="mt-1 break-all text-[14px] font-medium text-claude-text">{activeWorkspacePath || (isZh ? '未选择' : 'Not selected')}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <InlineActionButton onClick={openCodePage}>{isZh ? '打开 Code' : 'Open Code'}</InlineActionButton>
                    {activeWorkspacePath && <InlineActionButton tone="danger" onClick={clearCurrentWorkspace}>{isZh ? '清空当前工作区' : 'Clear current workspace'}</InlineActionButton>}
                  </div>
                  <div className="mt-3 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '文件树、Git 面板和命令控制台都会围绕这个目录工作。' : 'The file tree, Git panel, and command console all operate around this folder.'}</div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">{isZh ? '最近工作区' : 'Recent workspaces'}</div>
                  <div className="mt-3 space-y-2">
                    {recentWorkspaces.length > 0 ? recentWorkspaces.slice(0, 6).map((path) => (
                      <div key={path} className="rounded-lg border border-claude-border px-3 py-2 text-[12px] leading-6 text-claude-textSecondary">{path}</div>
                    )) : (
                      <div className="rounded-lg border border-dashed border-claude-border px-3 py-4 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '最近还没有保存过工作区历史。' : 'No workspace history has been saved yet.'}</div>
                    )}
                  </div>
                  {recentWorkspaces.length > 0 && <div className="mt-3"><InlineActionButton tone="danger" onClick={clearWorkspaceHistory}>{isZh ? '清空最近历史' : 'Clear recent history'}</InlineActionButton></div>}
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'archived':
        return (
          <div className="space-y-5">
            <SectionCard title={isZh ? '历史与归档' : 'History and archive'} subtitle={isZh ? '这里先汇总设备会话、最近对话和归档项目。' : 'Summarize device sessions, recent conversations, and archived projects here.'}>
              <div className="grid grid-cols-3 gap-4">
                <InfoStat label={isZh ? '当前设备会话' : 'Active device sessions'} value={sessions.length} />
                <InfoStat label={isZh ? '最近对话' : 'Recent conversations'} value={recentConversations.length} />
                <InfoStat label={isZh ? '归档项目' : 'Archived projects'} value={archivedProjects.length} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-3 text-[13px] text-claude-textSecondary">{isZh ? '最近对话' : 'Recent conversations'}</div>
                  <div className="space-y-2">
                    {recentConversations.length > 0 ? recentConversations.slice(0, 6).map((conversation) => (
                      <button key={conversation.id} type="button" onClick={() => openChatPage(conversation.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-claude-border px-3 py-2 text-left hover:bg-claude-hover">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-claude-text">{conversation.title || (isZh ? '未命名对话' : 'Untitled chat')}</div>
                          <div className="mt-1 text-[11px] text-claude-textSecondary">{formatTime(conversation.updated_at || conversation.created_at)}</div>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-claude-textSecondary" />
                      </button>
                    )) : <div className="rounded-lg border border-dashed border-claude-border px-3 py-4 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '当前还没有可展示的最近会话。' : 'There are no recent conversations to show yet.'}</div>}
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-3 text-[13px] text-claude-textSecondary">{isZh ? '归档项目' : 'Archived projects'}</div>
                  <div className="space-y-2">
                    {archivedProjects.length > 0 ? archivedProjects.slice(0, 6).map((project) => (
                      <button key={project.id} type="button" onClick={openProjectsPage} className="flex w-full items-center justify-between gap-3 rounded-lg border border-claude-border px-3 py-2 text-left hover:bg-claude-hover">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-claude-text">{project.name}</div>
                          <div className="mt-1 text-[11px] text-claude-textSecondary">{isZh ? `文件 ${project.file_count || 0} · 对话 ${project.chat_count || 0}` : `Files ${project.file_count || 0} · Chats ${project.chat_count || 0}`}</div>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-claude-textSecondary" />
                      </button>
                    )) : <div className="rounded-lg border border-dashed border-claude-border px-3 py-4 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '现在还没有归档项目。' : 'There are no archived projects yet.'}</div>}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'usage':
        return (
          <div className="space-y-5">
            <SectionCard title={isZh ? '使用情况' : 'Usage'} subtitle={isZh ? '汇总平台配额、本地项目和客户端活跃度。' : 'Summarize platform quota, local projects, and client activity.'}>
              {isSelfHosted ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <InfoStat label={isZh ? '项目总数' : 'Total projects'} value={projects.length} />
                    <InfoStat label={isZh ? '活跃项目' : 'Active projects'} value={projects.length - archivedProjects.length} />
                    <InfoStat label={isZh ? '最近对话' : 'Recent chats'} value={recentConversations.length} />
                    <InfoStat label={isZh ? '已启用 Skills' : 'Enabled skills'} value={skillStats.enabled} />
                  </div>
                  <div className="rounded-xl border border-dashed border-claude-border px-4 py-4 text-[13px] leading-6 text-claude-textSecondary">{isZh ? '自部署模式下，后续可以继续加入本地推理速度、请求数、平均耗时和模型命中率。' : 'In self-hosted mode, good next additions are local inference speed, request counts, average latency, and model hit rate.'}</div>
                </div>
              ) : usage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <InfoStat label="Tokens" value={formatUsageValue(usage.token_used, usage.token_quota)} hint={isZh ? `已使用 ${formatPercent(usage.usage_percent)}` : `${formatPercent(usage.usage_percent)} used`} />
                    <InfoStat label={isZh ? '消息数' : 'Messages'} value={formatUsageValue(usage.message_used, usage.message_quota)} />
                    <InfoStat label={isZh ? '本地上下文' : 'Local context'} value={`${projects.length} / ${recentConversations.length}`} hint={isZh ? '项目数 / 最近对话数' : 'Projects / recent conversations'} />
                  </div>
                  <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                    <div className="text-[14px] font-medium text-claude-text">{isZh ? '当前账号状态' : 'Account status'}</div>
                    <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">{isZh ? '这里先展示配额和活跃度基础总览。后面适合继续补工具调用次数、失败重试率和模型使用占比。' : 'This currently shows a basic quota and activity overview. Good next additions include tool call counts, retry rate, and model share.'}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-claude-border px-4 py-4 text-[13px] leading-6 text-claude-textSecondary">{isZh ? '暂时还没有拿到可展示的使用统计。' : 'Usage statistics are not available yet.'}</div>
              )}
            </SectionCard>
          </div>
        );
      case 'account':
        return (
          <div className="space-y-5">
            <SectionCard title="账号" subtitle="账号安全和会话管理先保留基础版。">
              <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                <div className="text-[13px] text-claude-textSecondary mb-1">邮箱地址</div>
                <div className="text-[14px] text-claude-text">{profile?.email || '—'}</div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => {
                      setShowPwdForm(true);
                      setPwdError('');
                      setPwdMsg('');
                    }}
                    className="rounded-lg border border-claude-border px-3 py-1.5 text-[13px] text-claude-text hover:bg-claude-hover"
                  >
                    修改密码
                  </button>
                  <button
                    onClick={() => logout()}
                    className="rounded-lg border border-[#C6613F]/20 px-3 py-1.5 text-[13px] text-[#C6613F] hover:bg-[#C6613F]/5"
                  >
                    退出登录
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="活跃会话" subtitle="保留当前设备会话和其他设备退出能力。">
              <div className="space-y-3">
                {sessions.length > 0 ? (
                  sessions.map((sessionItem) => {
                    const isCurrent = sessionItem.id === currentSessionId;
                    return (
                      <div
                        key={sessionItem.id}
                        className="flex items-center justify-between rounded-xl border border-claude-border bg-claude-bg px-4 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {sessionItem.device?.includes('Android') || sessionItem.device?.includes('iOS') ? (
                              <Smartphone size={15} className="text-claude-textSecondary" />
                            ) : (
                              <MonitorIcon size={15} className="text-claude-textSecondary" />
                            )}
                            <span className="truncate text-[14px] font-medium text-claude-text">
                              {sessionItem.device || '未知设备'}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-[#2E7CF6]/10 px-2 py-0.5 text-[11px] text-[#2E7CF6]">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[12px] text-claude-textSecondary">
                            {sessionItem.location || '未知位置'} · 最近活跃 {formatTime(sessionItem.last_active)}
                          </div>
                        </div>
                        {!isCurrent && (
                          <button
                            onClick={async () => {
                              await deleteSession(sessionItem.id);
                              setSessions((prev) => prev.filter((item) => item.id !== sessionItem.id));
                            }}
                            className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover"
                          >
                            退出此设备
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[13px] text-claude-textSecondary">暂无活跃会话。</div>
                )}
                {sessions.length > 1 && (
                  <div className="flex justify-end">
                    <button
                      onClick={async () => {
                        await logoutOtherSessions();
                        setSessions((prev) => prev.filter((item) => item.id === currentSessionId));
                      }}
                      className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover"
                    >
                      退出其他设备
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        );

      default:
        return null;
    }
  })();

  return (
    <div className="flex h-full bg-claude-bg text-claude-text">
      <aside className="w-[220px] shrink-0 border-r border-claude-border px-4 pt-12 pb-6">
        <button
          onClick={onClose}
          className="mb-6 inline-flex items-center gap-2 text-[12px] text-claude-textSecondary hover:text-claude-text"
        >
          <ChevronRight size={14} className="rotate-180" />
          返回应用
        </button>
        <h1 className="mb-5 text-[28px] font-[Spectral] font-semibold tracking-tight">设置</h1>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = section === item.key;
            const Icon = SETTING_NAV_META[item.key].icon;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active ? 'bg-claude-btn-hover text-claude-text' : 'text-claude-textSecondary hover:bg-claude-hover'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    active ? 'bg-claude-bg text-claude-text' : 'bg-claude-bg/50 text-claude-textSecondary'
                  }`}>
                    <Icon size={16} />
                  </span>
                  <span className="text-[14px] font-medium">{item.label}</span>
                </span>
                {item.badge && (
                  <span className="rounded-full bg-claude-hover px-2 py-0.5 text-[10px] text-claude-textSecondary">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 pt-12 pb-20">
        <div className="mx-auto max-w-[1120px]">
          {currentSection}
        </div>
      </main>

      {showPwdForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowPwdForm(false)}>
          <div
            className="w-full max-w-[420px] rounded-2xl border border-claude-border bg-claude-bg px-6 py-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[18px] font-semibold text-claude-text">修改密码</div>
              <button onClick={() => setShowPwdForm(false)} className="text-claude-textSecondary hover:text-claude-text">
                <LogOut size={16} className="rotate-180" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
                placeholder="当前密码"
                className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
              />
              <input
                type="password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                placeholder="新密码（至少 6 位）"
                className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
              />
              <input
                type="password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
                placeholder="确认新密码"
                className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
              />
            </div>
            {pwdError && <div className="mt-3 text-[12px] text-red-500">{pwdError}</div>}
            {pwdMsg && <div className="mt-3 text-[12px] text-emerald-500">{pwdMsg}</div>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowPwdForm(false)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-claude-textSecondary hover:bg-claude-hover"
              >
                取消
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                className="rounded-lg bg-claude-text px-4 py-1.5 text-[13px] font-medium text-claude-bg disabled:opacity-50"
              >
                {pwdSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
