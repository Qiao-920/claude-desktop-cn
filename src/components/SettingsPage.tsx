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
                        localStorage.setItem('user_mode', item.value);
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
            <SectionCard title="Git" subtitle="把当前工作区的仓库状态和默认行为收口到这里，和代码页右侧的 Git 面板互补。">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">当前工作区</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text break-all">
                    {activeWorkspacePath || '尚未选择工作区'}
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">仓库状态</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">
                    {!activeWorkspacePath ? '未初始化' : gitStatus?.isRepo ? '已检测到 Git 仓库' : '不是 Git 仓库'}
                  </div>
                  {gitStatus?.isRepo && (
                    <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                      分支 {gitStatus.branch || 'unknown'} · {gitStatus.clean ? '工作区干净' : `改动 ${gitStatus.files.length} 个文件`}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">已连接 GitHub 源</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">{linkedSourceCount}</div>
                  <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                    来自项目页绑定的仓库来源总数
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-2 text-[13px] text-claude-textSecondary">提交后动作</div>
                  <button
                    type="button"
                    onClick={() => saveBooleanPref('git_push_after_commit', !gitPushAfterCommit, setGitPushAfterCommit)}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                      gitPushAfterCommit
                        ? 'border-[#2E7CF6]/35 bg-[#2E7CF6]/10 text-[#2E7CF6]'
                        : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'
                    }`}
                  >
                    {gitPushAfterCommit ? '已开启：提交后提醒继续推送' : '关闭：提交后不额外提示'}
                  </button>
                  <div className="mt-3 text-[12px] leading-6 text-claude-textSecondary">
                    这是当前桌面端的 Git 偏好开关。代码页下一步会继续把它接到提交成功后的工作流里。
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-2 text-[13px] text-claude-textSecondary">快速入口</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openCodePage}
                      className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                    >
                      打开代码页
                    </button>
                    <button
                      type="button"
                      onClick={openProjectsPage}
                      className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                    >
                      打开项目页
                    </button>
                  </div>
                  <div className="mt-3 text-[12px] leading-6 text-claude-textSecondary">
                    现在真正的单文件差异、暂存、提交、推送都已经落在代码页里，这里负责总览和默认行为。
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'mcp':
        return (
          <div className="space-y-5">
            <SectionCard title="MCP 服务器" subtitle="这一页先做成“工具接入总览”。当前客户端还没有逐台服务器编辑器，但已经能看到与外部能力相关的关键状态。">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">GitHub 连接</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">
                    {githubConnected === null ? '检查中…' : githubConnected ? '已连接' : '未连接'}
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                    Add from GitHub 与项目 GitHub 源同步都依赖这里
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">已启用技能</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">{skillStats.enabled}</div>
                  <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                    内置 {skillStats.builtIn} · 自定义 {skillStats.custom}
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">当前权限范围</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">
                    {permissionMode === 'workspace_write'
                      ? '安全模式'
                      : permissionMode === 'project'
                        ? '项目权限'
                        : '完全访问'}
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                    外部工具和代码能力最终都会受这里约束
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-3 text-[13px] text-claude-textSecondary">GitHub 连接管理</div>
                  <div className="flex flex-wrap gap-2">
                    {githubConnected ? (
                      <button
                        type="button"
                        onClick={handleGithubDisconnect}
                        className="rounded-lg border border-[#C6613F]/20 px-3 py-1.5 text-[12px] text-[#C6613F] hover:bg-[#C6613F]/6"
                      >
                        断开 GitHub
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGithubConnect}
                        className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                      >
                        连接 GitHub
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openProjectsPage}
                      className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                    >
                      管理项目来源
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-2 text-[13px] text-claude-textSecondary">现阶段说明</div>
                  <div className="text-[12px] leading-6 text-claude-textSecondary">
                    现在已经能看到技能、GitHub 连接和权限模式这些“会影响工具可见性”的真实状态。下一步再继续补逐台 MCP 服务的启停、作用域、超时和中文说明。
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'environment':
        return (
          <div className="space-y-5">
            <SectionCard title="环境" subtitle="把命令执行时真正会影响体验的几个参数先变成可配：终端、超时、历史保留和工作区记忆。">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-1 text-[13px] text-claude-textSecondary">命令超时</div>
                  <select
                    value={codeCommandTimeout}
                    onChange={(e) => saveStringPref('code_command_timeout_ms', e.target.value, setCodeCommandTimeout)}
                    className="w-full rounded-xl border border-claude-border bg-claude-input px-4 py-3 text-[14px] text-claude-text outline-none"
                  >
                    <option value="60000">60 秒</option>
                    <option value="120000">120 秒</option>
                    <option value="300000">300 秒</option>
                    <option value="600000">600 秒</option>
                  </select>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                    代码页控制台会按这里的超时上限执行命令。
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-1 text-[13px] text-claude-textSecondary">命令历史保留</div>
                  <button
                    type="button"
                    onClick={() => saveBooleanPref('code_persist_command_history', !persistCommandHistory, setPersistCommandHistory)}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                      persistCommandHistory
                        ? 'border-[#2E7CF6]/35 bg-[#2E7CF6]/10 text-[#2E7CF6]'
                        : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'
                    }`}
                  >
                    {persistCommandHistory ? '已开启：重开应用后保留命令记录' : '关闭：命令记录只保留本次会话'}
                  </button>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                    这一项会和代码页控制台联动，方便你继续追命令输出。
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-1 text-[13px] text-claude-textSecondary">工作区记忆</div>
                  <button
                    type="button"
                    onClick={() => saveBooleanPref('code_remember_workspace', !rememberWorkspace, setRememberWorkspace)}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                      rememberWorkspace
                        ? 'border-[#2E7CF6]/35 bg-[#2E7CF6]/10 text-[#2E7CF6]'
                        : 'border-claude-border text-claude-textSecondary hover:bg-claude-hover'
                    }`}
                  >
                    {rememberWorkspace ? '已开启：记住最近工作区' : '关闭：不保留上次工作区'}
                  </button>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                    你更偏向原生 Claude Code 的工作流，这个开关就是对应的环境层。
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-1 text-[13px] text-claude-textSecondary">当前默认 Shell</div>
                  <div className="text-[14px] font-medium text-claude-text">
                    {integratedShell === 'powershell'
                      ? 'PowerShell'
                      : integratedShell === 'cmd'
                        ? 'Command Prompt'
                        : integratedShell === 'git-bash'
                          ? 'Git Bash'
                          : 'WSL'}
                  </div>
                  <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                    如需切换解释器，可回到上方“常规”里的集成终端设置。
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'worktree':
        return (
          <div className="space-y-5">
            <SectionCard title="工作树" subtitle="这里开始承接代码页的工作区记忆，把当前目录、最近目录和清理动作集中起来。">
              <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">当前工作区</div>
                  <div className="mt-1 break-all text-[14px] font-medium text-claude-text">
                    {activeWorkspacePath || '尚未选择工作区'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openCodePage}
                      className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                    >
                      打开代码页
                    </button>
                    {activeWorkspacePath && (
                      <button
                        type="button"
                        onClick={clearCurrentWorkspace}
                        className="rounded-lg border border-[#C6613F]/20 px-3 py-1.5 text-[12px] text-[#C6613F] hover:bg-[#C6613F]/6"
                      >
                        清空当前工作区
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">最近工作区</div>
                  <div className="mt-3 space-y-2">
                    {recentWorkspaces.length > 0 ? (
                      recentWorkspaces.slice(0, 5).map((item) => (
                        <div key={item} className="rounded-lg border border-claude-border px-3 py-2 text-[12px] break-all text-claude-textSecondary">
                          {item}
                        </div>
                      ))
                    ) : (
                      <div className="text-[12px] leading-6 text-claude-textSecondary">
                        还没有保存的最近工作区记录。
                      </div>
                    )}
                  </div>
                  {recentWorkspaces.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={clearWorkspaceHistory}
                        className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text hover:bg-claude-hover"
                      >
                        清空最近记录
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'archived':
        return (
          <div className="space-y-5">
            <SectionCard title="已归档聊天" subtitle="当前服务端还没有独立的 archive 字段，所以这页先承接“历史会话总览”与后续归档入口。">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">当前会话设备数</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">{sessions.length}</div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">最近聊天数</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">{recentConversations.length}</div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="text-[13px] text-claude-textSecondary">归档项目数</div>
                  <div className="mt-1 text-[14px] font-medium text-claude-text">{archivedProjects.length}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-3 text-[13px] text-claude-textSecondary">最近聊天</div>
                  <div className="space-y-2">
                    {recentConversations.length > 0 ? (
                      recentConversations.slice(0, 6).map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => openChatPage(conversation.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-claude-border px-3 py-2 text-left hover:bg-claude-hover"
                        >
                          <span className="truncate text-[13px] text-claude-text">
                            {conversation.title || '未命名聊天'}
                          </span>
                          <ChevronRight size={14} className="shrink-0 text-claude-textSecondary" />
                        </button>
                      ))
                    ) : (
                      <div className="text-[12px] leading-6 text-claude-textSecondary">还没有聊天历史。</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                  <div className="mb-3 text-[13px] text-claude-textSecondary">已归档项目</div>
                  <div className="space-y-2">
                    {archivedProjects.length > 0 ? (
                      archivedProjects.slice(0, 6).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={openProjectsPage}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-claude-border px-3 py-2 text-left hover:bg-claude-hover"
                        >
                          <span className="truncate text-[13px] text-claude-text">{project.name}</span>
                          <ChevronRight size={14} className="shrink-0 text-claude-textSecondary" />
                        </button>
                      ))
                    ) : (
                      <div className="text-[12px] leading-6 text-claude-textSecondary">
                        当前还没有归档项目。后面把聊天归档正式接上后，这里会继续汇总历史线程。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 'usage':
        return (
          <div className="space-y-5">
            <SectionCard title="使用情况" subtitle="把当前额度、消息量和平台侧统计放在一起。">
              {isSelfHosted ? (
                <div className="rounded-xl border border-dashed border-claude-border px-4 py-4 text-[13px] leading-6 text-claude-textSecondary">
                  你当前处于自部署模式。平台套餐额度不一定适用，建议以后在这里补本地推理统计、请求次数、平均速度和模型命中率。
                </div>
              ) : usage ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                    <div className="text-[13px] text-claude-textSecondary mb-1">Token 用量</div>
                    <div className="text-[20px] font-semibold text-claude-text">
                      {formatUsageValue(usage.token_used, usage.token_quota)}
                    </div>
                    <div className="mt-2 text-[12px] text-claude-textSecondary">
                      已使用 {formatPercent(usage.usage_percent)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                    <div className="text-[13px] text-claude-textSecondary mb-1">今日消息</div>
                    <div className="text-[20px] font-semibold text-claude-text">
                      {usage.messages?.today ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                    <div className="text-[13px] text-claude-textSecondary mb-1">本月消息</div>
                    <div className="text-[20px] font-semibold text-claude-text">
                      {usage.messages?.month ?? 0}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-claude-textSecondary">正在加载用量数据…</div>
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
