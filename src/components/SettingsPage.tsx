import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  LogOut,
  MonitorIcon,
  Smartphone,
} from 'lucide-react';
import {
  changePassword,
  deleteSession,
  getAgentConfig,
  getProviderModels,
  getSessions,
  getUserProfile,
  getUserUsage,
  logout,
  logoutOtherSessions,
  updateAgentConfig,
  updateUserProfile,
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
  const isSelfHosted = localStorage.getItem('user_mode') === 'selfhosted';
  const [section, setSection] = useState<SettingsSection>('general');
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
    };

    load();
  }, [isSelfHosted]);

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
      { key: 'git', label: 'Git', badge: '骨架' },
      { key: 'mcp', label: 'MCP 服务器', badge: '骨架' },
      { key: 'environment', label: '环境', badge: '骨架' },
      { key: 'worktree', label: '工作树', badge: '骨架' },
      { key: 'archived', label: '已归档聊天', badge: '骨架' },
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
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">默认打开目标</div>
                  <select
                    value={defaultOpenTarget}
                    onChange={(e) => {
                      setDefaultOpenTarget(e.target.value);
                      localStorage.setItem('default_open_target', e.target.value);
                    }}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="vscode">VS Code</option>
                    <option value="folder">系统文件夹</option>
                    <option value="internal">应用内打开</option>
                  </select>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">集成终端 Shell</div>
                  <select
                    value={integratedShell}
                    onChange={(e) => {
                      setIntegratedShell(e.target.value);
                      localStorage.setItem('integrated_shell', e.target.value);
                    }}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">CMD</option>
                    <option value="git-bash">Git Bash</option>
                  </select>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">语言</div>
                  <select
                    value={uiLanguage}
                    onChange={(e) => applyLanguage(e.target.value as UiLanguage)}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="zh-CN">中文（中国）</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[13px] text-claude-textSecondary mb-1">详细级别</div>
                  <select
                    value={uiDensity}
                    onChange={(e) => applyUiDensity(e.target.value)}
                    className="w-full bg-transparent text-[14px] text-claude-text outline-none"
                  >
                    <option value="compact">紧凑</option>
                    <option value="comfortable">舒适</option>
                  </select>
                </div>
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
          <PlaceholderSection
            title="Git"
            status="已接骨架"
            description="这一栏先补成原生化骨架。真正的文件差异、暂存、提交、推送目前已经在代码页右侧面板可用。"
            bullets={[
              '当前代码页已支持 Git 状态、单文件差异、暂存/取消暂存、提交、推送。',
              '下一步适合继续补默认仓库、分支切换、拉取策略、凭据和忽略规则。',
              '后续这里会成为 Git 全局偏好与默认行为入口。',
            ]}
          />
        );

      case 'mcp':
        return (
          <PlaceholderSection
            title="MCP 服务器"
            status="已接骨架"
            description="这里将对齐原生产品的工具服务器管理位置。"
            bullets={[
              '后续可放服务器启停、连接状态、超时设置和作用域控制。',
              '适合增加每个工具的中文说明、是否允许在聊天/代码页调用。',
              '这部分会直接影响技能、外部工具和自动化能力的可见性。',
            ]}
          />
        );

      case 'environment':
        return (
          <PlaceholderSection
            title="环境"
            status="已接骨架"
            description="这里以后会放终端、解释器、环境变量和运行时偏好。"
            bullets={[
              '适合补默认 Node / Python 路径、代理和 PATH 继承策略。',
              '你提到希望像 VS Code 那样工作，这里就是未来对应的环境层。',
              '当前可执行命令主要在代码页右侧控制台完成。',
            ]}
          />
        );

      case 'worktree':
        return (
          <PlaceholderSection
            title="工作树"
            status="已接骨架"
            description="代码页已经有工作区概念，这里会成为更正式的工作区管理入口。"
            bullets={[
              '适合补最近工作区、默认目录、收藏目录与多工作树切换。',
              '后续可以加入“打开即加载 Git 状态”和“记住上次目录”。',
              '如果你希望更接近原生 Claude Code，这一层会非常关键。',
            ]}
          />
        );

      case 'archived':
        return (
          <PlaceholderSection
            title="已归档聊天"
            status="已接骨架"
            description="原生产品里这部分会负责归档历史、恢复对话和查看旧线程。"
            bullets={[
              '现在先把入口补齐，后续再接归档筛选、恢复与批量整理。',
              '适合加“按项目 / 日期 / 模型”筛选。',
              '也可以接入自动压缩后的对话摘要浏览。',
            ]}
          />
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
      <aside className="w-[240px] shrink-0 border-r border-claude-border px-5 pt-14 pb-6">
        <button
          onClick={onClose}
          className="mb-6 inline-flex items-center gap-2 text-[12px] text-claude-textSecondary hover:text-claude-text"
        >
          <ChevronRight size={14} className="rotate-180" />
          返回应用
        </button>
        <h1 className="mb-6 text-[30px] font-[Spectral] font-semibold tracking-tight">设置</h1>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active ? 'bg-claude-btn-hover text-claude-text' : 'text-claude-textSecondary hover:bg-claude-hover'
                }`}
              >
                <span className="text-[14px] font-medium">{item.label}</span>
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

      <main className="flex-1 overflow-y-auto px-10 pt-14 pb-24">
        <div className="mx-auto max-w-[980px]">
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
