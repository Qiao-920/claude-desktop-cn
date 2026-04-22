import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  FolderGit2,
  FolderOpen,
  Github,
  LayoutGrid,
  Link2,
  MessageSquareText,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAgentConfig, getGithubStatus, getProjects, Project } from '../api';
import { getStoredUiLanguage } from '../utils/chineseClientText';

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
  return '未知';
};

type CoworkTaskStatus = 'todo' | 'doing' | 'done';

type CoworkTask = {
  id: string;
  title: string;
  description: string;
  status: CoworkTaskStatus;
  source: string;
  updatedAt: string;
};

const COWORK_BOARD_STORAGE_KEY = 'cowork_task_board_v1';

const makeTaskId = () => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createSeedTasks = (isZh: boolean, workspacePath: string): CoworkTask[] => {
  const now = new Date().toISOString();
  return [
    {
      id: makeTaskId(),
      title: isZh ? '确认当前工作区' : 'Confirm current workspace',
      description: workspacePath || (isZh ? '进入 Code 页选择项目目录。' : 'Open Code and choose a project folder.'),
      status: workspacePath ? 'done' : 'todo',
      source: 'Code',
      updatedAt: now,
    },
    {
      id: makeTaskId(),
      title: isZh ? '补齐发布说明' : 'Complete release notes',
      description: isZh ? '把每个版本的更新内容写到 GitHub Release，而不是堆在 README。' : 'Keep changelog entries in GitHub Releases instead of piling them into README.',
      status: 'doing',
      source: 'Release',
      updatedAt: now,
    },
    {
      id: makeTaskId(),
      title: isZh ? '整理下一轮产品功能' : 'Plan the next product slice',
      description: isZh ? '继续围绕工作区、命令执行、权限、预览稳定性推进。' : 'Continue around workspace, command execution, permissions, and preview stability.',
      status: 'todo',
      source: 'Product',
      updatedAt: now,
    },
  ];
};

const CoworkPage = () => {
  const navigate = useNavigate();
  const isZh = getStoredUiLanguage() === 'zh-CN';
  const [projects, setProjects] = useState<Project[]>([]);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [permissionLabel, setPermissionLabel] = useState<string>(formatPermissionLabel(undefined, isZh));
  const [loading, setLoading] = useState(true);

  const workspacePath = localStorage.getItem('code_workspace_path') || '';
  const [boardTasks, setBoardTasks] = useState<CoworkTask[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(COWORK_BOARD_STORAGE_KEY) || '[]');
      return Array.isArray(raw) && raw.length > 0 ? raw : createSeedTasks(isZh, workspacePath);
    } catch {
      return createSeedTasks(isZh, workspacePath);
    }
  });
  const [newTaskTitle, setNewTaskTitle] = useState('');
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

  useEffect(() => {
    localStorage.setItem(COWORK_BOARD_STORAGE_KEY, JSON.stringify(boardTasks));
  }, [boardTasks]);

  const openSettingsSection = (section: string) => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }));
  };

  const boardColumns: Array<{ key: CoworkTaskStatus; title: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { key: 'todo', title: isZh ? '待处理' : 'To do', icon: Circle },
    { key: 'doing', title: isZh ? '进行中' : 'Doing', icon: Clock3 },
    { key: 'done', title: isZh ? '已完成' : 'Done', icon: CheckCircle2 },
  ];

  const moveTask = (taskId: string, status: CoworkTaskStatus) => {
    setBoardTasks((current) => current.map((task) => task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task));
  };

  const addBoardTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    setBoardTasks((current) => [
      {
        id: makeTaskId(),
        title,
        description: isZh ? '从协作页手动添加。' : 'Added manually from Cowork.',
        status: 'todo',
        source: 'Cowork',
        updatedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setNewTaskTitle('');
  };

  const resetBoardTasks = () => {
    setBoardTasks(createSeedTasks(isZh, workspacePath));
  };

  const summaryCards = [
    {
      title: isZh ? '活跃项目' : 'Active projects',
      value: loading ? (isZh ? '加载中…' : 'Loading…') : String(activeProjects.length),
      hint: isZh
        ? '这里会持续收拢项目、对话、文件和协作入口。'
        : 'This page keeps project, chat, file, and coordination entry points together.',
      icon: LayoutGrid,
    },
    {
      title: 'GitHub',
      value:
        githubConnected === null
          ? isZh
            ? '检查中…'
            : 'Checking…'
          : githubConnected
            ? isZh
              ? '已连接'
              : 'Connected'
            : isZh
              ? '未连接'
              : 'Disconnected',
      hint: isZh ? `已挂接 ${linkedSourceCount} 个仓库来源` : `${linkedSourceCount} linked repository sources`,
      icon: Github,
    },
    {
      title: isZh ? '当前权限' : 'Permission mode',
      value: loading ? (isZh ? '加载中…' : 'Loading…') : permissionLabel,
      hint: workspacePath
        ? isZh
          ? '已检测到代码工作区，命令和文件操作可以直接衔接。'
          : 'A code workspace is already available for file and command work.'
        : isZh
          ? '还没有选择代码工作区。'
          : 'No code workspace has been selected yet.',
      icon: ShieldCheck,
    },
    {
      title: isZh ? '归档项目' : 'Archived projects',
      value: loading ? (isZh ? '加载中…' : 'Loading…') : String(archivedProjectCount),
      hint: isZh
        ? '这里会继续承接历史项目、归档视图和后续协作记录。'
        : 'Archived work, history views, and later coordination records continue to land here.',
      icon: FolderGit2,
    },
  ];

  const quickActions = [
    {
      title: isZh ? '继续做项目' : 'Continue with projects',
      description: isZh
        ? '去 Projects 管理知识库、GitHub 来源、文件和项目对话。'
        : 'Manage knowledge files, GitHub sources, files, and project conversations in Projects.',
      action: isZh ? '打开 Projects' : 'Open Projects',
      onClick: () => navigate('/projects'),
      icon: LayoutGrid,
    },
    {
      title: isZh ? '进入代码工作区' : 'Open the code workspace',
      description: workspacePath
        ? isZh
          ? `当前工作区：${workspacePath}`
          : `Current workspace: ${workspacePath}`
        : isZh
          ? '先选一个本地目录，随后就能看文件、跑命令、看 Git 状态。'
          : 'Choose a local folder first, then browse files, run commands, and inspect Git.',
      action: isZh ? '打开 Code' : 'Open Code',
      onClick: () => navigate('/code'),
      icon: FolderOpen,
    },
    {
      title: isZh ? '整理权限与环境' : 'Tune permissions and environment',
      description: isZh
        ? '把权限模式、Shell、工作区记忆和 Git 偏好统一收口到设置页。'
        : 'Centralize permission mode, shell defaults, workspace memory, and Git preferences in Settings.',
      action: isZh ? '打开设置' : 'Open settings',
      onClick: () => openSettingsSection('permissions'),
      icon: Settings2,
    },
  ];

  const taskQueue = [
    {
      done: !!workspacePath,
      title: isZh ? '确认代码工作区' : 'Confirm the code workspace',
      description: workspacePath
        ? workspacePath
        : isZh
          ? '还没有绑定目录。先去 Code 里选择一个项目文件夹。'
          : 'No directory is linked yet. Choose a project folder in Code first.',
      action: isZh ? '去 Code' : 'Go to Code',
      onClick: () => navigate('/code'),
    },
    {
      done: !!githubConnected,
      title: isZh ? '连接 GitHub' : 'Connect GitHub',
      description:
        githubConnected === null
          ? isZh
            ? '正在检查连接状态。'
            : 'Checking connection status.'
          : githubConnected
            ? isZh
              ? '仓库来源已经可用，可以继续补项目来源和文件上下文。'
              : 'Repository sources are ready. You can keep wiring project sources and file context.'
            : isZh
              ? '连接后，Add from GitHub 和项目仓库来源都会更顺手。'
              : 'Once connected, Add from GitHub and project repository sources become much smoother.',
      action: isZh ? '去设置' : 'Open settings',
      onClick: () => openSettingsSection('mcp'),
    },
    {
      done: activeProjects.length > 0,
      title: isZh ? '建立项目中枢' : 'Build a project hub',
      description:
        activeProjects.length > 0
          ? isZh
            ? `当前已有 ${activeProjects.length} 个活跃项目，可以继续整理资料和上下文。`
            : `${activeProjects.length} active projects already exist. Keep organizing files and context from there.`
          : isZh
            ? '还没有活跃项目。建议先从一个项目开始，把文件和仓库来源挂进去。'
            : 'There are no active projects yet. Start with one project and attach files and repository sources.',
      action: isZh ? '去 Projects' : 'Open Projects',
      onClick: () => navigate('/projects'),
    },
  ];

  const workflowPanels = [
    {
      title: isZh ? '现在该去哪里用' : 'Where to work right now',
      text: isZh
        ? '如果你是要选目录、看文件、跑命令、看 Git，就去“代码”页；如果你要整理资料、连接仓库、维护项目上下文，就去“项目”页。'
        : 'Use Code for folders, files, commands, and Git. Use Projects for repository sources, knowledge files, and project context.',
      icon: Wrench,
    },
    {
      title: isZh ? '协作页现在负责什么' : 'What Cowork is responsible for now',
      text: isZh
        ? '它现在更像总览和路由层，把项目、权限、GitHub 和工作区的关键信号集中起来，方便你快速跳转。'
        : 'Cowork now acts as the overview and routing layer, bringing together projects, permissions, GitHub, and workspace signals for quick jumps.',
      icon: Link2,
    },
    {
      title: isZh ? '下一层继续补什么' : 'What lands next',
      text: isZh
        ? '后面适合继续补共享任务列表、审批流、多成员分工和项目状态时间线，把它从总览页推进成真正的协作中心。'
        : 'Next up are shared task lists, approval flow, multi-member coordination, and project status timelines, turning this into a true collaboration hub.',
      icon: Sparkles,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-claude-bg text-claude-text">
      <div className="mx-auto max-w-[1180px] px-8 py-10">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-input text-claude-textSecondary">
            <UsersRound size={26} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold tracking-tight">
              {isZh ? '协作工作区' : 'Cowork workspace'}
            </h1>
            <p className="mt-2 max-w-[800px] text-[14px] leading-7 text-claude-textSecondary">
              {isZh
                ? '这里不再只是一个空白占位页了。现在它会把项目、GitHub、权限和代码工作区的关键状态收拢到一起，适合用来做总览、跳转和下一步决策。'
                : 'This is no longer a placeholder. It now gathers the most important project, GitHub, permission, and code-workspace signals into one place for overview, routing, and next-step decisions.'}
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
                <div className="mt-1 text-[22px] font-semibold text-claude-text">{card.value}</div>
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

        <div className="mt-6 rounded-2xl border border-claude-border bg-claude-input p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <UsersRound size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '任务看板' : 'Task board'}
                </h2>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                {isZh
                  ? '先用本地看板把产品任务、发布事项和工作区事项收起来。后面可以继续接多人分工、GitHub Issues 和状态流。'
                  : 'A local board for product, release, and workspace tasks. Later it can connect to assignees, GitHub Issues, and status streams.'}
              </p>
            </div>
            <button
              type="button"
              onClick={resetBoardTasks}
              className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
            >
              {isZh ? '重置模板' : 'Reset'}
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addBoardTask();
                }
              }}
              placeholder={isZh ? '添加一个任务，例如：补齐预览错误提示' : 'Add a task, e.g. improve preview diagnostics'}
              className="h-10 flex-1 rounded-lg border border-claude-border bg-claude-bg px-3 text-[13px] text-claude-text outline-none"
            />
            <button
              type="button"
              onClick={addBoardTask}
              disabled={!newTaskTitle.trim()}
              className="flex h-10 items-center gap-2 rounded-lg bg-claude-text px-4 text-[13px] font-medium text-claude-bg disabled:opacity-50"
            >
              <Plus size={14} />
              {isZh ? '添加' : 'Add'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4">
            {boardColumns.map((column) => {
              const Icon = column.icon;
              const tasks = boardTasks.filter((task) => task.status === column.key);
              return (
                <div key={column.key} className="min-h-[260px] rounded-xl border border-claude-border bg-claude-bg p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-claude-text">
                      <Icon size={15} className="text-claude-textSecondary" />
                      {column.title}
                    </div>
                    <span className="rounded-full bg-claude-hover px-2 py-0.5 text-[11px] text-claude-textSecondary">{tasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {tasks.length > 0 ? tasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-claude-border bg-claude-input px-3 py-3">
                        <div className="text-[13px] font-medium text-claude-text">{task.title}</div>
                        <div className="mt-1 text-[12px] leading-5 text-claude-textSecondary">{task.description}</div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="rounded border border-claude-border px-1.5 py-0.5 text-[10px] text-claude-textSecondary">{task.source}</span>
                          <div className="flex gap-1">
                            {boardColumns.filter((item) => item.key !== task.status).map((target) => (
                              <button
                                key={target.key}
                                type="button"
                                onClick={() => moveTask(task.id, target.key)}
                                className="rounded border border-claude-border px-2 py-1 text-[10px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                              >
                                {target.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-lg border border-dashed border-claude-border px-3 py-6 text-center text-[12px] leading-6 text-claude-textSecondary">
                        {isZh ? '这一列暂时为空。' : 'Nothing here yet.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '当前待处理事项' : 'Current queue'}
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {taskQueue.map((task) => (
                  <div
                    key={task.title}
                    className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {task.done ? (
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                          ) : (
                            <AlertCircle size={16} className="shrink-0 text-[#C98B6E]" />
                          )}
                          <div className="text-[14px] font-medium text-claude-text">{task.title}</div>
                        </div>
                        <div className="mt-2 pl-6 text-[12px] leading-6 text-claude-textSecondary">
                          {task.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={task.onClick}
                        className="shrink-0 rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-text transition-colors hover:bg-claude-hover"
                      >
                        {task.action}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
                      ? '还没有活跃项目。你可以先去 Projects 创建一个项目，或者先从 GitHub 接一个仓库来源进来。'
                      : 'There are no active projects yet. Start in Projects by creating one, or bring in a repository source from GitHub first.'}
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
                          {project.description ||
                            (isZh ? '这个项目还没有补描述。' : 'This project does not have a description yet.')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-claude-textSecondary">
                          <span className="rounded-full border border-claude-border px-2 py-1">
                            {isZh ? `文件 ${project.file_count || 0}` : `Files ${project.file_count || 0}`}
                          </span>
                          <span className="rounded-full border border-claude-border px-2 py-1">
                            {isZh ? `对话 ${project.chat_count || 0}` : `Chats ${project.chat_count || 0}`}
                          </span>
                          <span className="rounded-full border border-claude-border px-2 py-1">
                            {isZh
                              ? `GitHub 来源 ${project.github_sources?.length || 0}`
                              : `GitHub ${project.github_sources?.length || 0}`}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={16} className="mt-1 shrink-0 text-claude-textSecondary" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
              <div className="flex items-center gap-3">
                <MessageSquareText size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '协作页现在负责什么' : 'What Cowork handles now'}
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {workflowPanels.map((panel) => {
                  const Icon = panel.icon;
                  return (
                    <div key={panel.title} className="rounded-xl border border-claude-border bg-claude-bg px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-claude-textSecondary" />
                        <div className="text-[14px] font-medium text-claude-text">{panel.title}</div>
                      </div>
                      <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">{panel.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-claude-border bg-claude-input p-6">
              <div className="flex items-center gap-3">
                <Link2 size={18} className="text-claude-textSecondary" />
                <h2 className="text-[17px] font-semibold text-claude-text">
                  {isZh ? '当前工作方式' : 'Current workflow'}
                </h2>
              </div>
              <div className="mt-4 space-y-3 text-[13px] leading-7 text-claude-textSecondary">
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary/80">
                    {isZh ? '代码工作区' : 'Code workspace'}
                  </div>
                  <div className="mt-1 break-all text-claude-text">
                    {workspacePath || (isZh ? '尚未选择工作区' : 'No workspace selected')}
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary/80">
                    {isZh ? 'GitHub 连接' : 'GitHub connection'}
                  </div>
                  <div className="mt-1 text-claude-text">
                    {githubConnected === null
                      ? isZh
                        ? '检查中…'
                        : 'Checking…'
                      : githubConnected
                        ? isZh
                          ? '已连接，可继续补仓库来源和文件上下文。'
                          : 'Connected, ready for repository sources and file context.'
                        : isZh
                          ? '还没连接，适合先去设置里完成授权。'
                          : 'Not connected yet. Completing auth in Settings is the next good step.'}
                  </div>
                </div>
                <div className="rounded-xl border border-claude-border bg-claude-bg px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary/80">
                    {isZh ? '推荐路线' : 'Recommended path'}
                  </div>
                  <div className="mt-1 text-claude-text">
                    {isZh
                      ? '选目录、看文件、跑命令、看 Git 状态时，直接去“代码”页；整理资料、维护项目和仓库来源时，去“项目”页。'
                      : 'Go to Code for folders, files, commands, and Git status. Go to Projects for source management and project context.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoworkPage;
