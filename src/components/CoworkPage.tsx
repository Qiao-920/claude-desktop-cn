import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  FolderGit2,
  FolderOpen,
  Github,
  LayoutGrid,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAgentConfig, getGithubStatus, getProjects, Project } from '../api';
import { getStoredUiLanguage } from '../utils/chineseClientText';

type PermissionLabel = '安全模式' | '项目权限' | '完全访问' | 'Unknown';

const formatPermissionLabel = (permissionMode?: string, isZh = true): string => {
  if (!isZh) {
    if (permissionMode === 'workspace_write') return 'Safe mode';
    if (permissionMode === 'project') return 'Project scope';
    if (permissionMode === 'full_access') return 'Full access';
    return 'Unknown';
  }

  if (permissionMode === 'workspace_write') return '安全模式';
  if (permissionMode === 'project') return '项目权限';
  if (permissionMode === 'full_access') return '完全访问';
  return 'Unknown';
};

const CoworkPage = () => {
  const navigate = useNavigate();
  const isZh = getStoredUiLanguage() === 'zh-CN';
  const [projects, setProjects] = useState<Project[]>([]);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [permissionLabel, setPermissionLabel] = useState<string>(formatPermissionLabel(undefined, isZh));
  const [loading, setLoading] = useState(true);

  const workspacePath = localStorage.getItem('code_workspace_path') || '';
  const linkedSourceCount = useMemo(
    () => projects.reduce((total, project) => total + (project.github_sources?.length || 0), 0),
    [projects],
  );
  const archivedProjectCount = useMemo(
    () => projects.filter((project) => Number(project.is_archived) === 1).length,
    [projects],
  );
  const activeProjects = useMemo(
    () => projects.filter((project) => Number(project.is_archived) !== 1).slice(0, 6),
    [projects],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [projectList, githubStatus, agentConfig] = await Promise.allSettled([
          getProjects(),
          getGithubStatus(),
          getAgentConfig(),
        ]);

        if (cancelled) return;

        if (projectList.status === 'fulfilled') {
          setProjects(projectList.value || []);
        }

        if (githubStatus.status === 'fulfilled') {
          setGithubConnected(!!githubStatus.value?.connected);
        } else {
          setGithubConnected(false);
        }

        if (agentConfig.status === 'fulfilled') {
          setPermissionLabel(formatPermissionLabel(agentConfig.value?.permissionMode, isZh));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isZh]);

  const openSettingsSection = (section: string) => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }));
  };

  const summaryCards = isZh
    ? [
        {
          title: '活跃项目',
          value: String(activeProjects.length),
          hint: '这里会继续汇总项目、共享资料和执行入口。',
          icon: LayoutGrid,
        },
        {
          title: 'GitHub 连接',
          value: githubConnected === null ? '检查中' : githubConnected ? '已连接' : '未连接',
          hint: `已挂载 ${linkedSourceCount} 个仓库来源`,
          icon: Github,
        },
        {
          title: '当前权限',
          value: permissionLabel,
          hint: workspacePath ? '已检测到代码工作区' : '还没有选择代码工作区',
          icon: ShieldCheck,
        },
        {
          title: '归档项目',
          value: String(archivedProjectCount),
          hint: '后面会把归档项目和历史任务流一并放进来。',
          icon: FolderGit2,
        },
      ]
    : [
        {
          title: 'Active projects',
          value: String(activeProjects.length),
          hint: 'This page now summarizes projects, shared context, and execution entry points.',
          icon: LayoutGrid,
        },
        {
          title: 'GitHub status',
          value: githubConnected === null ? 'Checking' : githubConnected ? 'Connected' : 'Disconnected',
          hint: `${linkedSourceCount} linked GitHub sources`,
          icon: Github,
        },
        {
          title: 'Permission mode',
          value: permissionLabel,
          hint: workspacePath ? 'A code workspace is already selected' : 'No code workspace selected yet',
          icon: ShieldCheck,
        },
        {
          title: 'Archived projects',
          value: String(archivedProjectCount),
          hint: 'Archived project workflows will continue to land here.',
          icon: FolderGit2,
        },
      ];

  const quickActions = isZh
    ? [
        {
          title: '继续做项目',
          description: '去项目页维护知识库、GitHub 源、文件和项目对话。',
          action: '打开 Projects',
          onClick: () => navigate('/projects'),
          icon: LayoutGrid,
        },
        {
          title: '进入代码工作区',
          description: workspacePath ? `当前工作区：${workspacePath}` : '选择一个目录后，就能在代码页里看文件、跑命令、看 Git。',
          action: '打开 Code',
          onClick: () => navigate('/code'),
          icon: FolderOpen,
        },
        {
          title: '整理权限与环境',
          description: '把权限、Shell、工作区和 Git 默认行为统一收口到设置页里。',
          action: '打开设置',
          onClick: () => openSettingsSection('permissions'),
          icon: Settings2,
        },
      ]
    : [
        {
          title: 'Continue with projects',
          description: 'Go to Projects to manage knowledge files, GitHub sources, and project conversations.',
          action: 'Open Projects',
          onClick: () => navigate('/projects'),
          icon: LayoutGrid,
        },
        {
          title: 'Open the code workspace',
          description: workspacePath ? `Current workspace: ${workspacePath}` : 'Choose a folder first, then browse files, run commands, and inspect Git in Code.',
          action: 'Open Code',
          onClick: () => navigate('/code'),
          icon: FolderOpen,
        },
        {
          title: 'Tune permissions and environment',
          description: 'Centralize permissions, shell defaults, workspace behavior, and Git preferences.',
          action: 'Open settings',
          onClick: () => openSettingsSection('permissions'),
          icon: Settings2,
        },
      ];

  return (
    <div className="h-full overflow-y-auto bg-claude-bg text-claude-text">
      <div className="mx-auto max-w-[1120px] px-8 py-10">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-input text-claude-textSecondary">
            <UsersRound size={26} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold tracking-tight">
              {isZh ? '协作工作区' : 'Cowork workspace'}
            </h1>
            <p className="mt-2 max-w-[760px] text-[14px] leading-7 text-claude-textSecondary">
              {isZh
                ? '这一页不再只是“已接入口”的空白占位了。现在它会把项目、GitHub、权限和代码工作区的关键状态收拢到一起，适合拿来做总览和跳转。'
                : 'This page is no longer just a staged placeholder. It now collects the important project, GitHub, permission, and code-workspace signals in one place for coordination and quick jumps.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-2xl border border-claude-border bg-claude-input p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-claude-hover text-claude-textSecondary">
                  <Icon size={18} />
                </div>
                <div className="text-[13px] text-claude-textSecondary">{card.title}</div>
                <div className="mt-1 text-[22px] font-semibold text-claude-text">{loading ? (isZh ? '加载中…' : 'Loading…') : card.value}</div>
                <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">{card.hint}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="rounded-2xl border border-claude-border bg-claude-input p-5 text-left transition-colors hover:bg-claude-hover"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-claude-bg text-claude-textSecondary">
                    <Icon size={18} />
                  </div>
                  <ArrowRight size={16} className="text-claude-textSecondary" />
                </div>
                <div className="text-[16px] font-semibold text-claude-text">{item.title}</div>
                <div className="mt-2 text-[13px] leading-6 text-claude-textSecondary">{item.description}</div>
                <div className="mt-4 text-[13px] font-medium text-[#C98B6E]">{item.action}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-[1.15fr_0.85fr] gap-4">
          <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
            <div className="flex items-center gap-3">
              <FolderGit2 size={18} className="text-claude-textSecondary" />
              <h2 className="text-[17px] font-semibold text-claude-text">
                {isZh ? '最近活跃项目' : 'Recently active projects'}
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {activeProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-claude-border px-4 py-5 text-[13px] leading-6 text-claude-textSecondary">
                  {isZh
                    ? '还没有项目。你可以先去 Projects 页创建项目，或者先从 GitHub 接一个仓库进来。'
                    : 'No projects yet. Start in Projects by creating one, or link a repository from GitHub first.'}
                </div>
              ) : (
                activeProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate('/projects')}
                    className="flex w-full items-start justify-between gap-4 rounded-xl border border-claude-border bg-claude-bg px-4 py-4 text-left transition-colors hover:bg-claude-hover"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-claude-text">{project.name}</div>
                      <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">
                        {project.description || (isZh ? '还没有补项目描述。' : 'No project description yet.')}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-claude-textSecondary">
                        <span className="rounded-full border border-claude-border px-2 py-1">
                          {isZh ? `文件 ${project.file_count || 0}` : `Files ${project.file_count || 0}`}
                        </span>
                        <span className="rounded-full border border-claude-border px-2 py-1">
                          {isZh ? `对话 ${project.chat_count || 0}` : `Chats ${project.chat_count || 0}`}
                        </span>
                        <span className="rounded-full border border-claude-border px-2 py-1">
                          {isZh ? `GitHub 源 ${project.github_sources?.length || 0}` : `GitHub ${project.github_sources?.length || 0}`}
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-claude-textSecondary" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
              <div className="flex items-center gap-3">
                <Wrench size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '当前工作方式' : 'Current workflow'}
                </h2>
              </div>
              <div className="mt-4 space-y-3 text-[13px] leading-7 text-claude-textSecondary">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary/80">
                    {isZh ? '代码工作区' : 'Code workspace'}
                  </div>
                  <div className="mt-1 text-claude-text">
                    {workspacePath || (isZh ? '尚未选择工作区' : 'No workspace selected')}
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary/80">
                    {isZh ? '推荐路径' : 'Recommended path'}
                  </div>
                  <div className="mt-1 text-claude-text">
                    {isZh
                      ? '需要选目录、看文件、跑命令、看 Git 状态时，直接去“代码”页。'
                      : 'For directory selection, file editing, command execution, and Git status, jump straight to Code.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
              <div className="flex items-center gap-3">
                <MessageSquareText size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '下一层准备补什么' : 'What lands next'}
                </h2>
              </div>
              <ul className="mt-4 space-y-2 text-[13px] leading-7 text-claude-textSecondary">
                <li>{isZh ? '共享任务列表和执行人视图' : 'Shared task lists and assignee views'}</li>
                <li>{isZh ? '审阅流、状态回退和批注记录' : 'Review flow, status rollback, and annotations'}</li>
                <li>{isZh ? '项目总览和聊天 / 代码动作汇总' : 'Project rollups plus consolidated chat/code actions'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoworkPage;
