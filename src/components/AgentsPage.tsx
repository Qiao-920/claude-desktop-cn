import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Clock3,
  FolderOpen,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import {
  createProjectConversation,
  getProjects,
  Project,
  ProjectTask,
  ProjectTeamMember,
  updateProject,
} from '../api';

type AgentWorkspaceCard = {
  project: Project;
  member: ProjectTeamMember;
  latestConversation: any | null;
  assignedTasks: ProjectTask[];
  runnableTask: ProjectTask | null;
  updatedTaskCount: number;
  blockedTaskCount: number;
};

type AgentProjectGroup = {
  project: Project;
  cards: AgentWorkspaceCard[];
};

type AgentQueueItem = {
  project: Project;
  member: ProjectTeamMember;
  task: ProjectTask;
};

type AgentOutputItem = {
  project: Project;
  member: ProjectTeamMember;
  title: string;
  detail: string;
  updatedAt?: string;
  conversationId?: string;
  kind: 'task' | 'chat';
};

type BuiltInAgentTemplate = {
  id: string;
  nameZh: string;
  nameEn: string;
  roleZh: string;
  roleEn: string;
  focusZh: string;
  focusEn: string;
  model?: string;
};

const BUILT_IN_AGENT_TEMPLATES: BuiltInAgentTemplate[] = [
  {
    id: 'general-purpose',
    nameZh: '通用代理',
    nameEn: 'General-purpose',
    roleZh: '通用执行',
    roleEn: 'General execution',
    focusZh: '跨文件分析、推进复杂问题、拆解任务并收口。',
    focusEn: 'Cross-file analysis, complex task execution, and structured delivery.',
    model: 'claude-sonnet-4-6',
  },
  {
    id: 'code-executor',
    nameZh: '代码代理',
    nameEn: 'Code executor',
    roleZh: '代码实现',
    roleEn: 'Code implementation',
    focusZh: '修 bug、改代码、补测试、处理工作区任务。',
    focusEn: 'Fix bugs, implement code, add tests, and handle workspace tasks.',
    model: 'claude-sonnet-4-6',
  },
  {
    id: 'research-analyst',
    nameZh: '研究代理',
    nameEn: 'Research analyst',
    roleZh: '方案研究',
    roleEn: 'Research',
    focusZh: '查资料、比路线、总结结论和风险。',
    focusEn: 'Research sources, compare options, and summarize conclusions and risks.',
    model: 'claude-sonnet-4-6',
  },
  {
    id: 'release-manager',
    nameZh: '发布代理',
    nameEn: 'Release manager',
    roleZh: '发布与收口',
    roleEn: 'Release',
    focusZh: '整理变更、检查发布前事项、收集结果与回归风险。',
    focusEn: 'Prepare releases, review checklists, collect results, and surface rollout risks.',
    model: 'claude-sonnet-4-6',
  },
];

const getTeamStatusLabel = (status: ProjectTeamMember['status'], isZh: boolean) => {
  if (status === 'blocked') return isZh ? '阻塞' : 'Blocked';
  if (status === 'idle') return isZh ? '空闲' : 'Idle';
  return isZh ? '活跃' : 'Active';
};

const getTaskRunStateLabel = (state: ProjectTask['run_state'], isZh: boolean) => {
  if (state === 'running') return isZh ? '运行中' : 'Running';
  if (state === 'updated') return isZh ? '已更新' : 'Updated';
  if (state === 'blocked') return isZh ? '受阻' : 'Blocked';
  if (state === 'failed') return isZh ? '失败' : 'Failed';
  return isZh ? '空闲' : 'Idle';
};

const getConversationDetail = (conv: any, isZh: boolean) => {
  if (conv?.project_run_kind === 'task_execution') return isZh ? '任务执行会话' : 'Task execution chat';
  if (conv?.project_run_kind === 'role_chat') return isZh ? '角色会话' : 'Role chat';
  if (conv?.project_chat_kind === 'research') return isZh ? '研究会话' : 'Research chat';
  if (conv?.project_chat_kind === 'code') return isZh ? '代码会话' : 'Code chat';
  return isZh ? 'Agent 会话' : 'Agent chat';
};

const formatDateTime = (value?: string, isZh = false) => {
  if (!value) return isZh ? '暂无' : 'Not yet';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const buildAgentPrompt = (project: Project, member: ProjectTeamMember, isZh: boolean) => {
  const taskLines = (project.tasks || [])
    .filter((task) => task.assignee_id === member.id)
    .slice(0, 5)
    .map((task) => `- ${task.title}${task.status ? ` (${task.status})` : ''}`)
    .join('\n');

  if (isZh) {
    return [
      `你现在是项目《${project.name}》里的代理成员《${member.name}》。`,
      member.role ? `角色：${member.role}` : '',
      member.focus ? `关注点：${member.focus}` : '',
      project.next_action ? `当前下一步：${project.next_action}` : '',
      taskLines ? `你当前负责的任务：\n${taskLines}` : '你当前还没有被分配任务，请先阅读项目上下文并给出你建议接手的方向。',
      '请结合项目上下文继续推进，输出清晰的下一步动作、风险，以及需要我确认的事项。',
    ].filter(Boolean).join('\n\n');
  }

  return [
    `You are the agent teammate "${member.name}" inside project "${project.name}".`,
    member.role ? `Role: ${member.role}` : '',
    member.focus ? `Focus: ${member.focus}` : '',
    project.next_action ? `Current next step: ${project.next_action}` : '',
    taskLines ? `Your assigned tasks:\n${taskLines}` : 'You do not have an assigned task yet. Review the project context and propose where you should help next.',
    'Continue the work with clear next actions, risks, and anything that needs human confirmation.',
  ].filter(Boolean).join('\n\n');
};

const buildTaskExecutionPrompt = (project: Project, task: ProjectTask, member: ProjectTeamMember, isZh: boolean) => {
  if (isZh) {
    return [
      `请以项目《${project.name}》中代理《${member.name}》的身份执行这个任务。`,
      member.role ? `角色：${member.role}` : '',
      `任务：${task.title}`,
      task.description ? `说明：${task.description}` : '',
      project.next_action ? `项目下一步：${project.next_action}` : '',
      '请先判断最佳执行路径，再输出你已经完成的内容、还需要什么信息，以及下一步建议。',
    ].filter(Boolean).join('\n\n');
  }

  return [
    `Execute this task as agent "${member.name}" in project "${project.name}".`,
    member.role ? `Role: ${member.role}` : '',
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : '',
    project.next_action ? `Project next action: ${project.next_action}` : '',
    'Decide the best path forward, then report what you completed, what information you still need, and the recommended next step.',
  ].filter(Boolean).join('\n\n');
};

export default function AgentsPage() {
  const navigate = useNavigate();
  const isZh = localStorage.getItem('ui_language') === 'zh-CN';
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentDraft, setNewAgentDraft] = useState({
    name: '',
    role: '',
    focus: '',
    model: 'claude-sonnet-4-6',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(Array.isArray(data) ? data.filter((project) => !project.is_archived) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedProjectId) return;
    const firstProject = projects.find((project) => !project.is_archived);
    if (firstProject) setSelectedProjectId(firstProject.id);
  }, [projects, selectedProjectId]);

  const cards = useMemo<AgentWorkspaceCard[]>(() => (
    projects.flatMap((project) => {
      const conversations = Array.isArray((project as any).conversations) ? (project as any).conversations : [];
      const members = Array.isArray(project.team_members)
        ? project.team_members.filter((member) => member.kind === 'agent')
        : [];

      return members.map((member) => {
        const relatedConversations = conversations
          .filter((conv: any) => conv.project_member_id === member.id)
          .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const assignedTasks = (project.tasks || []).filter((task) => task.assignee_id === member.id);

        return {
          project,
          member,
          latestConversation: relatedConversations[0] || null,
          assignedTasks,
          runnableTask: assignedTasks.find((task) => task.status !== 'done') || null,
          updatedTaskCount: assignedTasks.filter((task) => task.run_state === 'updated').length,
          blockedTaskCount: assignedTasks.filter((task) => task.status === 'blocked' || task.run_state === 'blocked').length,
        };
      });
    })
  ), [projects]);

  const stats = useMemo(() => ({
    projects: new Set(cards.map((item) => item.project.id)).size,
    agents: cards.length,
    running: cards.filter((item) => item.assignedTasks.some((task) => task.run_state === 'running')).length,
    idle: cards.filter((item) => item.member.status === 'idle').length,
  }), [cards]);

  const groupedCards = useMemo<AgentProjectGroup[]>(() => {
    const grouped = new Map<string, AgentProjectGroup>();
    for (const card of cards) {
      const bucket = grouped.get(card.project.id);
      if (bucket) {
        bucket.cards.push(card);
      } else {
        grouped.set(card.project.id, { project: card.project, cards: [card] });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [cards]);

  const activeQueue = useMemo<AgentQueueItem[]>(() => (
    cards
      .flatMap((card) => card.assignedTasks
        .filter((task) => task.run_state === 'running' || task.status === 'doing' || task.run_state === 'blocked')
        .map((task) => ({ project: card.project, member: card.member, task })))
      .sort((a, b) => new Date(b.task.run_updated_at || b.task.updated_at || 0).getTime() - new Date(a.task.run_updated_at || a.task.updated_at || 0).getTime())
      .slice(0, 8)
  ), [cards]);

  const latestOutputs = useMemo<AgentOutputItem[]>(() => {
    const items: AgentOutputItem[] = [];
    for (const card of cards) {
      const summaryTasks = card.assignedTasks
        .filter((task) => task.run_summary)
        .sort((a, b) => new Date(b.run_updated_at || b.updated_at || 0).getTime() - new Date(a.run_updated_at || a.updated_at || 0).getTime());
      if (summaryTasks[0]) {
        items.push({
          project: card.project,
          member: card.member,
          title: summaryTasks[0].title,
          detail: summaryTasks[0].run_summary || '',
          updatedAt: summaryTasks[0].run_updated_at || summaryTasks[0].updated_at,
          conversationId: summaryTasks[0].linked_conversation_id,
          kind: 'task',
        });
      } else if (card.latestConversation) {
        items.push({
          project: card.project,
          member: card.member,
          title: card.latestConversation.title || (isZh ? '未命名会话' : 'Untitled chat'),
          detail: getConversationDetail(card.latestConversation, isZh),
          updatedAt: card.latestConversation.created_at,
          conversationId: card.latestConversation.id,
          kind: 'chat',
        });
      }
    }
    return items
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 8);
  }, [cards, isZh]);

  const blockedAgents = useMemo(() => (
    cards.filter((card) => card.blockedTaskCount > 0 || card.member.status === 'blocked').slice(0, 6)
  ), [cards]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const handleOpenAgentChat = useCallback(async (project: Project, member: ProjectTeamMember) => {
    const key = `${project.id}:${member.id}:chat`;
    setRunningKey(key);
    try {
      const title = isZh ? `${member.name} Agent 会话` : `${member.name} agent chat`;
      const model = member.model || localStorage.getItem('default_model') || 'claude-sonnet-4-6';
      const initialMessage = buildAgentPrompt(project, member, isZh);
      const conv = await createProjectConversation(project.id, title, model, {
        project_member_id: member.id,
        project_run_kind: 'role_chat',
        project_chat_kind: 'agent',
      });
      navigate(`/chat/${conv.id}`, { state: { initialMessage, model } });
    } finally {
      setRunningKey(null);
    }
  }, [isZh, navigate]);

  const handleRunTask = useCallback(async (project: Project, member: ProjectTeamMember, task: ProjectTask) => {
    const key = `${project.id}:${member.id}:${task.id}:run`;
    setRunningKey(key);
    try {
      const nextTasks = (project.tasks || []).map((item) => (
        item.id === task.id
          ? {
            ...item,
            assignee_id: member.id,
            status: item.status === 'todo' ? 'doing' : item.status,
            updated_at: new Date().toISOString(),
          }
          : item
      ));
      await updateProject(project.id, { tasks: nextTasks });
      const model = member.model || localStorage.getItem('default_model') || 'claude-sonnet-4-6';
      const initialMessage = buildTaskExecutionPrompt(project, task, member, isZh);
      const conv = await createProjectConversation(project.id, `${task.title} · ${member.name}`, model, {
        project_task_id: task.id,
        project_member_id: member.id,
        project_run_kind: 'task_execution',
        project_chat_kind: 'agent',
      });
      navigate(`/chat/${conv.id}`, { state: { initialMessage, model } });
    } finally {
      setRunningKey(null);
    }
  }, [isZh, navigate]);

  const handleAddTemplateAgent = useCallback(async (template: BuiltInAgentTemplate) => {
    if (!selectedProject) {
      window.alert(isZh ? '请先选择一个项目。' : 'Choose a project first.');
      return;
    }
    const nextName = isZh ? template.nameZh : template.nameEn;
    const exists = (selectedProject.team_members || []).some((member) => member.kind === 'agent' && member.name === nextName);
    if (exists) {
      window.alert(isZh ? '这个项目里已经有同名 Agent 了。' : 'An agent with the same name already exists in this project.');
      return;
    }
    const nextMembers = [
      ...(selectedProject.team_members || []),
      {
        id: crypto.randomUUID(),
        name: nextName,
        kind: 'agent' as const,
        role: isZh ? template.roleZh : template.roleEn,
        focus: isZh ? template.focusZh : template.focusEn,
        model: template.model || '',
        status: 'active' as const,
        updated_at: new Date().toISOString(),
      },
    ];
    await updateProject(selectedProject.id, { team_members: nextMembers });
    await loadData();
  }, [isZh, loadData, selectedProject]);

  const handleCreateAgent = useCallback(async () => {
    if (!selectedProject) {
      window.alert(isZh ? '请先选择一个项目。' : 'Choose a project first.');
      return;
    }
    if (!newAgentDraft.name.trim()) {
      window.alert(isZh ? '请先填写 Agent 名称。' : 'Enter an agent name first.');
      return;
    }
    const nextMembers = [
      ...(selectedProject.team_members || []),
      {
        id: crypto.randomUUID(),
        name: newAgentDraft.name.trim(),
        kind: 'agent' as const,
        role: newAgentDraft.role.trim(),
        focus: newAgentDraft.focus.trim(),
        model: newAgentDraft.model.trim(),
        status: 'active' as const,
        updated_at: new Date().toISOString(),
      },
    ];
    await updateProject(selectedProject.id, { team_members: nextMembers });
    setNewAgentDraft({
      name: '',
      role: '',
      focus: '',
      model: 'claude-sonnet-4-6',
    });
    setShowCreateForm(false);
    await loadData();
  }, [isZh, loadData, newAgentDraft, selectedProject]);

  const statCards = [
    {
      label: isZh ? '项目' : 'Projects',
      value: stats.projects,
      icon: <FolderOpen size={14} className="text-[#C98B6E]" />,
    },
    {
      label: 'Agent',
      value: stats.agents,
      icon: <Bot size={14} className="text-[#B699FF]" />,
    },
    {
      label: isZh ? '运行中' : 'Running',
      value: stats.running,
      icon: <RefreshCw size={14} className="text-[#7FD28A]" />,
    },
    {
      label: isZh ? '空闲' : 'Idle',
      value: stats.idle,
      icon: <Clock3 size={14} className="text-[#7AB0FF]" />,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-claude-bg px-4 pb-6 pt-4 text-claude-text xl:px-5">
      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-3">
        <section className="rounded-[20px] border border-claude-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-[760px]">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-[#C98B6E]" />
                <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-claude-text">
                  {isZh ? '多 Agent 工作台' : 'Multi-agent workspace'}
                </h1>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                {isZh
                  ? '这里像 Codex 一样，先选项目，再直接安装内置 Agent 或创建自己的 Agent。之后就能一键启动专属会话，或者把任务派给它执行。'
                  : 'Like Codex, choose a project first, then install built-in agents or create your own. Start a dedicated chat or dispatch tasks in one click.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="h-9 min-w-[180px] rounded-xl border border-claude-border bg-claude-input px-3 text-[12px] text-claude-text outline-none"
              >
                <option value="">{isZh ? '选择项目' : 'Choose project'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-claude-border px-3.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                <Plus size={13} />
                {isZh ? '新建 Agent' : 'New agent'}
              </button>
              <button
                onClick={loadData}
                className="inline-flex h-9 items-center rounded-xl border border-claude-border px-3.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                {isZh ? '刷新' : 'Refresh'}
              </button>
              <button
                onClick={() => navigate('/projects')}
                className="inline-flex h-9 items-center rounded-xl bg-claude-text px-3.5 text-[12px] font-medium text-claude-bg"
              >
                {isZh ? '管理项目团队' : 'Manage project teams'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((item) => (
              <div key={item.label} className="rounded-[16px] border border-claude-border bg-claude-input/80 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-claude-textSecondary/80">{item.label}</div>
                  {item.icon}
                </div>
                <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-claude-text">{item.value}</div>
              </div>
            ))}
          </div>

          {showCreateForm ? (
            <div className="mt-4 rounded-[16px] border border-claude-border bg-claude-input/70 p-3.5">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <input
                  value={newAgentDraft.name}
                  onChange={(e) => setNewAgentDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={isZh ? 'Agent 名称，例如：前端代理' : 'Agent name, e.g. Frontend agent'}
                  className="rounded-xl border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                />
                <input
                  value={newAgentDraft.role}
                  onChange={(e) => setNewAgentDraft((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder={isZh ? '角色，例如：前端开发' : 'Role, e.g. Frontend engineer'}
                  className="rounded-xl border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                />
                <input
                  value={newAgentDraft.focus}
                  onChange={(e) => setNewAgentDraft((prev) => ({ ...prev, focus: e.target.value }))}
                  placeholder={isZh ? '关注点，例如：只做 UI 和交互' : 'Focus, e.g. UI and interaction only'}
                  className="rounded-xl border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                />
                <input
                  value={newAgentDraft.model}
                  onChange={(e) => setNewAgentDraft((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder={isZh ? '模型，可选' : 'Model, optional'}
                  className="rounded-xl border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleCreateAgent}
                  className="rounded-xl bg-claude-text px-3.5 py-2 text-[12px] font-medium text-claude-bg"
                >
                  {isZh ? '添加到当前项目' : 'Add to current project'}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-xl border border-claude-border px-3.5 py-2 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                >
                  {isZh ? '收起' : 'Hide'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[18px] border border-claude-border bg-claude-input p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-claude-text">
                <Bot size={15} className="text-[#C98B6E]" />
                <span>{isZh ? '内置 Agent 模板' : 'Built-in agent templates'}</span>
              </div>
              <div className="mt-1 text-[12px] leading-5 text-claude-textSecondary">
                {isZh
                  ? '像 Claude Code Haha 那样，先给你内置几种常用角色。选中一个项目后，点一下就能装进去。'
                  : 'Prebuilt roles similar to Claude Code Haha. Select a project, then install them in one click.'}
              </div>
            </div>
            <div className="text-[11px] text-claude-textSecondary">
              {selectedProject ? `${isZh ? '当前项目：' : 'Project: '}${selectedProject.name}` : (isZh ? '未选择项目' : 'No project selected')}
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            {BUILT_IN_AGENT_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-[14px] border border-claude-border bg-claude-bg px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-medium text-claude-text">
                    {isZh ? template.nameZh : template.nameEn}
                  </div>
                  <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                    {template.model || 'default'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-claude-textSecondary">
                  {isZh ? template.roleZh : template.roleEn}
                </div>
                <div className="mt-2 min-h-[52px] text-[11px] leading-5 text-claude-textSecondary">
                  {isZh ? template.focusZh : template.focusEn}
                </div>
                <button
                  onClick={() => handleAddTemplateAgent(template)}
                  disabled={!selectedProject}
                  className="mt-3 rounded-xl border border-[#C98B6E]/40 px-3 py-1.5 text-[12px] text-[#C98B6E] hover:bg-[#C98B6E]/10 disabled:opacity-40"
                >
                  {isZh ? '添加到项目' : 'Add to project'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="rounded-[18px] border border-claude-border bg-claude-input px-5 py-10 text-center text-[13px] text-claude-textSecondary">
            {isZh ? '正在加载多 Agent 工作台…' : 'Loading multi-agent workspace...'}
          </div>
        ) : groupedCards.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-claude-border bg-claude-input px-5 py-9 text-center">
            <div className="text-[22px] font-semibold text-claude-text">{isZh ? '还没有可用的 Agent' : 'No agents yet'}</div>
            <div className="mx-auto mt-2 max-w-[720px] text-[13px] leading-6 text-claude-textSecondary">
              {isZh
                ? '先在上面选择一个项目，然后直接添加内置 Agent，或者展开“新建 Agent”自己创建。这样就不用先去项目页里绕一圈。'
                : 'Choose a project above, then add a built-in agent or create your own right here. No need to jump to the project page first.'}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {selectedProject ? BUILT_IN_AGENT_TEMPLATES.slice(0, 2).map((template) => (
                <button
                  key={`empty-${template.id}`}
                  onClick={() => handleAddTemplateAgent(template)}
                  className="rounded-xl border border-[#C98B6E]/40 px-3 py-1.5 text-[12px] text-[#C98B6E] hover:bg-[#C98B6E]/10"
                >
                  {isZh ? `添加${template.nameZh}` : `Add ${template.nameEn}`}
                </button>
              )) : (
                <button
                  onClick={() => navigate('/projects')}
                  className="rounded-xl bg-claude-text px-3.5 py-2 text-[12px] font-medium text-claude-bg"
                >
                  {isZh ? '先去创建或选择项目' : 'Create or choose a project first'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <section className="grid gap-3 xl:grid-cols-[1.28fr_0.72fr]">
            <div className="space-y-3">
              {groupedCards.map(({ project, cards: projectCards }) => (
                <div key={project.id} className="rounded-[18px] border border-claude-border bg-claude-input p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[17px] font-semibold text-claude-text">
                        <UsersRound size={17} className="text-[#C98B6E]" />
                        <span>{project.name}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-claude-textSecondary">
                        {isZh ? `${projectCards.length} 个 Agent` : `${projectCards.length} agents`}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/projects?project=${project.id}`)}
                      className="rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                    >
                      {isZh ? '打开项目' : 'Open project'}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {projectCards.map((card) => {
                      const isAgentRunning = card.assignedTasks.some((task) => task.run_state === 'running');
                      const latestTask = card.runnableTask || card.assignedTasks[0] || null;
                      const chatBusy = runningKey === `${project.id}:${card.member.id}:chat`;
                      const taskBusy = latestTask ? runningKey === `${project.id}:${card.member.id}:${latestTask.id}:run` : false;

                      return (
                        <div key={`${project.id}:${card.member.id}`} className="rounded-[16px] border border-claude-border bg-claude-bg px-3.5 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Bot size={14} className="text-[#C98B6E]" />
                                <div className="truncate text-[14px] font-medium text-claude-text">{card.member.name}</div>
                                <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                  {getTeamStatusLabel(card.member.status, isZh)}
                                </span>
                              </div>
                              <div className="mt-1 line-clamp-1 text-[12px] text-claude-textSecondary">
                                {card.member.role || (isZh ? '还没有角色说明' : 'No role yet')}
                              </div>
                              <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-claude-textSecondary">
                                {card.member.focus || (isZh ? '还没有填写关注点。' : 'No focus description yet.')}
                              </div>
                            </div>
                            <div className="text-[10px] text-claude-textSecondary">
                              {card.member.model || (isZh ? '默认模型' : 'Default model')}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-claude-textSecondary">
                            <span className="rounded-full border border-claude-border px-2 py-0.5">
                              {isZh ? `任务 ${card.assignedTasks.length}` : `Tasks ${card.assignedTasks.length}`}
                            </span>
                            <span className="rounded-full border border-claude-border px-2 py-0.5">
                              {isZh ? `更新 ${card.updatedTaskCount}` : `Updated ${card.updatedTaskCount}`}
                            </span>
                            <span className="rounded-full border border-claude-border px-2 py-0.5">
                              {isZh ? `阻塞 ${card.blockedTaskCount}` : `Blocked ${card.blockedTaskCount}`}
                            </span>
                            {isAgentRunning ? (
                              <span className="rounded-full border border-[#7FD28A]/30 bg-[#7FD28A]/10 px-2 py-0.5 text-[#7FD28A]">
                                {isZh ? '运行中' : 'Running'}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 xl:grid-cols-[1.08fr_0.92fr]">
                            <div className="rounded-[12px] border border-claude-border bg-black/10 px-3 py-2.5 text-[11px] leading-5 text-claude-textSecondary">
                              <div className="font-medium text-claude-text">{isZh ? '最近会话' : 'Latest chat'}</div>
                              {card.latestConversation ? (
                                <>
                                  <div className="mt-1 truncate text-claude-text">
                                    {card.latestConversation.title || (isZh ? '未命名会话' : 'Untitled chat')}
                                  </div>
                                  <div className="mt-1">{getConversationDetail(card.latestConversation, isZh)}</div>
                                  <div className="mt-1.5 text-[10px] text-claude-textSecondary">
                                    {formatDateTime(card.latestConversation.created_at, isZh)}
                                  </div>
                                </>
                              ) : (
                                <div className="mt-1">{isZh ? '还没有会话，先启动一个 Agent 会话。' : 'No chat yet. Start an agent chat first.'}</div>
                              )}
                            </div>

                            <div className="rounded-[12px] border border-claude-border bg-black/10 px-3 py-2.5 text-[11px] leading-5 text-claude-textSecondary">
                              <div className="font-medium text-claude-text">{isZh ? '下一项任务' : 'Next task'}</div>
                              {latestTask ? (
                                <>
                                  <div className="mt-1 truncate text-claude-text">{latestTask.title}</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    <span className="rounded-full border border-claude-border px-2 py-0.5">{latestTask.status}</span>
                                    {latestTask.run_state && latestTask.run_state !== 'idle' ? (
                                      <span className="rounded-full border border-claude-border px-2 py-0.5">
                                        {getTaskRunStateLabel(latestTask.run_state, isZh)}
                                      </span>
                                    ) : null}
                                  </div>
                                </>
                              ) : (
                                <div className="mt-1">{isZh ? '当前没有待处理任务。' : 'No pending task right now.'}</div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleOpenAgentChat(project, card.member)}
                              disabled={chatBusy}
                              className="rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text disabled:opacity-50"
                            >
                              {chatBusy ? (isZh ? '启动中…' : 'Starting...') : (isZh ? '启动会话' : 'Start chat')}
                            </button>
                            {card.latestConversation ? (
                              <button
                                onClick={() => navigate(`/chat/${card.latestConversation.id}`)}
                                className="rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                              >
                                {isZh ? '打开最近会话' : 'Open latest chat'}
                              </button>
                            ) : null}
                            {latestTask ? (
                              <button
                                onClick={() => handleRunTask(project, card.member, latestTask)}
                                disabled={taskBusy}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-[#C98B6E]/40 px-3 py-1.5 text-[12px] text-[#C98B6E] hover:bg-[#C98B6E]/10 disabled:opacity-50"
                              >
                                <Play size={12} />
                                {taskBusy ? (isZh ? '执行中…' : 'Running...') : (isZh ? '执行任务' : 'Run task')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="rounded-[18px] border border-claude-border bg-claude-input p-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-claude-text">
                  <RefreshCw size={15} className="text-[#7FD28A]" />
                  <span>{isZh ? '运行队列' : 'Running queue'}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {activeQueue.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-claude-border px-3 py-5 text-center text-[11px] text-claude-textSecondary">
                      {isZh ? '当前没有正在执行或阻塞中的 Agent 任务。' : 'There are no active or blocked agent tasks right now.'}
                    </div>
                  ) : activeQueue.map((item) => (
                    <div key={`${item.project.id}:${item.member.id}:${item.task.id}`} className="rounded-[12px] border border-claude-border bg-claude-bg px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-[12px] font-medium text-claude-text">{item.task.title}</div>
                        <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                          {getTaskRunStateLabel(item.task.run_state || 'idle', isZh)}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-claude-textSecondary">
                        {item.project.name} · {item.member.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[18px] border border-claude-border bg-claude-input p-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-claude-text">
                  <Sparkles size={15} className="text-[#C98B6E]" />
                  <span>{isZh ? '最近结果' : 'Latest outputs'}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {latestOutputs.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-claude-border px-3 py-5 text-center text-[11px] text-claude-textSecondary">
                      {isZh ? '还没有可展示的 Agent 结果。先启动一次会话或执行一次任务。' : 'No agent results yet. Start a chat or run a task first.'}
                    </div>
                  ) : latestOutputs.map((item) => (
                    <button
                      key={`${item.project.id}:${item.member.id}:${item.title}:${item.updatedAt || 'na'}`}
                      onClick={() => item.conversationId && navigate(`/chat/${item.conversationId}`)}
                      className="block w-full rounded-[12px] border border-claude-border bg-claude-bg px-3 py-2.5 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-[12px] font-medium text-claude-text">{item.title}</div>
                        <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                          {item.kind === 'task' ? (isZh ? '任务' : 'Task') : (isZh ? '会话' : 'Chat')}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-3 text-[11px] leading-5 text-claude-textSecondary">{item.detail}</div>
                      <div className="mt-1.5 text-[10px] text-claude-textSecondary">
                        {item.project.name} · {item.member.name} · {formatDateTime(item.updatedAt, isZh)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[18px] border border-claude-border bg-claude-input p-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-claude-text">
                  <TriangleAlert size={15} className="text-[#C98B6E]" />
                  <span>{isZh ? '风险与阻塞' : 'Risks & blockers'}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {blockedAgents.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-claude-border px-3 py-5 text-center text-[11px] text-claude-textSecondary">
                      {isZh ? '当前没有明显阻塞。' : 'No visible blockers right now.'}
                    </div>
                  ) : blockedAgents.map((card) => (
                    <div key={`${card.project.id}:${card.member.id}:blocked`} className="rounded-[12px] border border-claude-border bg-claude-bg px-3 py-2.5">
                      <div className="text-[12px] font-medium text-claude-text">{card.member.name}</div>
                      <div className="mt-1 text-[10px] text-claude-textSecondary">
                        {card.project.name} · {card.member.role || (isZh ? '未设置角色' : 'No role')}
                      </div>
                      <div className="mt-2 text-[11px] leading-5 text-claude-textSecondary">
                        {card.member.status === 'blocked'
                          ? (isZh ? '这个 Agent 当前被标记为阻塞。建议先打开项目检查依赖、权限或上下文是否缺失。' : 'This agent is marked blocked. Review dependencies, permissions, or missing context first.')
                          : (isZh ? `有 ${card.blockedTaskCount} 个任务处于阻塞状态。` : `${card.blockedTaskCount} tasks are currently blocked.`)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
