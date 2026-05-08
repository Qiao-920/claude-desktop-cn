import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  getProjects,
  Project,
  ProjectAutomationRecipe,
  ProjectAutomationRunEntry,
  ProjectAutomationRunMode,
  ProjectAutomationRunStatus,
  ProjectAutomationTrigger,
  ProjectChatKind,
  getProjectAutomationRuntimeSnapshot,
  triggerProjectAutomationRecipe,
  updateProject,
} from '../api';

type AutomationFilter = 'all' | 'manual' | 'daily' | 'weekly' | 'agent' | 'error' | 'disabled';

type ProjectAutomationEntry = {
  project: Project;
  recipe: ProjectAutomationRecipe;
};

type AutomationEditDraft = {
  name: string;
  prompt: string;
  targetKind: ProjectChatKind;
  agentId: string;
  model: string;
  trigger: ProjectAutomationTrigger;
  scheduleTime: string;
  scheduleWeekday: number;
  enabled: boolean;
};

type AutomationTemplate = {
  id: string;
  section: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  draft: AutomationEditDraft;
};

type AutomationHistorySelection = {
  project: Project;
  recipe: ProjectAutomationRecipe;
  entry: ProjectAutomationRunEntry;
};

const PROJECT_AUTOMATION_PREFILL_KEY = 'project_automation_prefill_v1';

const FILTERS: Array<{ id: AutomationFilter; zh: string; en: string }> = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'daily', zh: '每天', en: 'Daily' },
  { id: 'weekly', zh: '每周', en: 'Weekly' },
  { id: 'manual', zh: '手动', en: 'Manual' },
  { id: 'agent', zh: 'Agent', en: 'Agent' },
  { id: 'error', zh: '失败', en: 'Errors' },
  { id: 'disabled', zh: '已关闭', en: 'Disabled' },
];

const WEEKDAYS: Array<{ id: number; zh: string; en: string }> = [
  { id: 1, zh: '周一', en: 'Mon' },
  { id: 2, zh: '周二', en: 'Tue' },
  { id: 3, zh: '周三', en: 'Wed' },
  { id: 4, zh: '周四', en: 'Thu' },
  { id: 5, zh: '周五', en: 'Fri' },
  { id: 6, zh: '周六', en: 'Sat' },
  { id: 7, zh: '周日', en: 'Sun' },
];

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'daily-status-report',
    section: 'Status reports',
    titleZh: '每日状态播报',
    titleEn: 'Daily status report',
    descriptionZh: '汇总近期 PR、任务和风险，快速生成项目进度播报。',
    descriptionEn: 'Summarize recent PRs, tasks, and risks into a progress digest.',
    draft: {
      name: '每日状态播报',
      prompt: '根据最近的项目任务、会话、GitHub 来源和风险变化，生成一份清晰的每日状态播报。突出进展、阻塞项和下一步动作，不要编造不存在的信息。',
      targetKind: 'research',
      agentId: '',
      model: '',
      trigger: 'daily',
      scheduleTime: '09:00',
      scheduleWeekday: 1,
      enabled: true,
    },
  },
  {
    id: 'weekly-release-prep',
    section: 'Release prep',
    titleZh: '每周发布准备',
    titleEn: 'Weekly release prep',
    descriptionZh: '整理变更、测试风险和发布说明，形成发布前清单。',
    descriptionEn: 'Prepare release notes, test risk review, and a preflight checklist.',
    draft: {
      name: '每周发布准备',
      prompt: '根据最近一周的项目对话、任务状态、GitHub 变更和风险项，整理发布说明草稿、测试关注点和发布前检查清单。只基于仓库与项目上下文中能确认的信息输出。',
      targetKind: 'code',
      agentId: '',
      model: '',
      trigger: 'weekly',
      scheduleTime: '16:00',
      scheduleWeekday: 5,
      enabled: true,
    },
  },
  {
    id: 'agent-triage',
    section: 'Incidents & triage',
    titleZh: 'Agent 故障分诊',
    titleEn: 'Agent triage run',
    descriptionZh: '让指定 Agent 检查失败项、日志和阻塞问题，形成处理建议。',
    descriptionEn: 'Ask an agent to review failures, logs, and blockers, then propose next actions.',
    draft: {
      name: 'Agent 故障分诊',
      prompt: '检查最近失败的任务、自动化运行和项目阻塞项，归纳可能原因，给出最小修复建议，并标记哪些部分需要人工确认。',
      targetKind: 'agent',
      agentId: '',
      model: '',
      trigger: 'manual',
      scheduleTime: '09:00',
      scheduleWeekday: 1,
      enabled: true,
    },
  },
];

const formatDateTime = (value?: string, isZh = false) => {
  if (!value) return isZh ? '暂无' : 'Not yet';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const getChatKindLabel = (kind: ProjectChatKind, isZh: boolean) => {
  if (kind === 'code') return isZh ? '代码' : 'Code';
  if (kind === 'research') return isZh ? '研究' : 'Research';
  if (kind === 'agent') return 'Agent';
  return isZh ? '普通' : 'General';
};

const getTriggerLabel = (trigger: ProjectAutomationTrigger | undefined, isZh: boolean) => {
  if (trigger === 'daily') return isZh ? '每天' : 'Daily';
  if (trigger === 'weekly') return isZh ? '每周' : 'Weekly';
  return isZh ? '手动' : 'Manual';
};

const getStatusLabel = (status: ProjectAutomationRunStatus | undefined, isZh: boolean) => {
  if (status === 'running') return isZh ? '运行中' : 'Running';
  if (status === 'success') return isZh ? '成功' : 'Success';
  if (status === 'error') return isZh ? '失败' : 'Error';
  return isZh ? '空闲' : 'Idle';
};

const getRunSourceLabel = (source: string, isZh: boolean) => {
  if (source === 'scheduled') return isZh ? '计划触发' : 'Scheduled';
  return isZh ? '手动触发' : 'Manual';
};

const getRunModeLabel = (mode: ProjectAutomationRunMode | undefined, isZh: boolean) => {
  if (mode === 'selfhosted') return isZh ? '自托管' : 'Self-hosted';
  return isZh ? '默认运行时' : 'Default runtime';
};

const formatSchedule = (recipe: ProjectAutomationRecipe, isZh: boolean) => {
  if (recipe.trigger === 'manual') return isZh ? '手动触发' : 'Manual trigger';
  const time = recipe.schedule_time || '09:00';
  if (recipe.trigger === 'daily') return isZh ? `每天 ${time}` : `Daily ${time}`;
  const weekday = WEEKDAYS.find((item) => item.id === recipe.schedule_weekday) || WEEKDAYS[0];
  return isZh ? `每周 ${weekday.zh} ${time}` : `Weekly ${weekday.en} ${time}`;
};

const buildDraftFromRecipe = (recipe: ProjectAutomationRecipe): AutomationEditDraft => ({
  name: recipe.name || '',
  prompt: recipe.prompt || '',
  targetKind: recipe.target_kind || 'general',
  agentId: recipe.agent_id || '',
  model: recipe.model || '',
  trigger: recipe.trigger || 'manual',
  scheduleTime: recipe.schedule_time || '09:00',
  scheduleWeekday: Number(recipe.schedule_weekday) || 1,
  enabled: recipe.enabled !== false,
});

const createEmptyAgentRecipeDraft = (agentId = ''): AutomationEditDraft => ({
  name: '',
  prompt: '',
  targetKind: 'agent',
  agentId,
  model: '',
  trigger: 'manual',
  scheduleTime: '09:00',
  scheduleWeekday: 1,
  enabled: true,
});

const sortEntries = (entries: ProjectAutomationEntry[]) => {
  const statusWeight: Record<string, number> = { running: 0, error: 1, success: 2, idle: 3 };
  return [...entries].sort((a, b) => {
    const statusDiff = (statusWeight[a.recipe.last_run_status || 'idle'] ?? 9) - (statusWeight[b.recipe.last_run_status || 'idle'] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    const nextA = a.recipe.next_run_at ? new Date(a.recipe.next_run_at).getTime() : Number.MAX_SAFE_INTEGER;
    const nextB = b.recipe.next_run_at ? new Date(b.recipe.next_run_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (nextA !== nextB) return nextA - nextB;
    return new Date(b.recipe.updated_at || 0).getTime() - new Date(a.recipe.updated_at || 0).getTime();
  });
};

export default function AutomationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isZh = localStorage.getItem('ui_language') === 'zh-CN';
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AutomationFilter>('all');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editRecipeId, setEditRecipeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AutomationEditDraft | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<AutomationHistorySelection | null>(null);
  const [showCreateAgentPanel, setShowCreateAgentPanel] = useState(false);
  const [createProjectId, setCreateProjectId] = useState('');
  const [createAgentDraft, setCreateAgentDraft] = useState<AutomationEditDraft>(createEmptyAgentRecipeDraft());

  const selectedProjectId = useMemo(() => new URLSearchParams(location.search).get('project'), [location.search]);

  const selectedProject = useMemo(
    () => (selectedProjectId ? projects.find((project) => project.id === selectedProjectId) || null : null),
    [projects, selectedProjectId],
  );

  const createTargetProject = useMemo(
    () => (createProjectId ? projects.find((project) => project.id === createProjectId) || null : null),
    [createProjectId, projects],
  );

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
    if (!showCreateAgentPanel) return;
    if (selectedProjectId) {
      setCreateProjectId(selectedProjectId);
      return;
    }
    if (!createProjectId && projects[0]) {
      setCreateProjectId(projects[0].id);
    }
  }, [createProjectId, projects, selectedProjectId, showCreateAgentPanel]);

  useEffect(() => {
    if (!showCreateAgentPanel) return;
    const agents = Array.isArray(createTargetProject?.team_members)
      ? createTargetProject.team_members.filter((member) => member.kind === 'agent')
      : [];
    if (agents.length === 0) {
      if (createAgentDraft.agentId) {
        setCreateAgentDraft((prev) => ({ ...prev, agentId: '' }));
      }
      return;
    }
    if (!createAgentDraft.agentId || !agents.some((agent) => agent.id === createAgentDraft.agentId)) {
      setCreateAgentDraft((prev) => ({ ...prev, agentId: agents[0].id }));
    }
  }, [createAgentDraft.agentId, createTargetProject?.team_members, showCreateAgentPanel]);

  const allEntries = useMemo<ProjectAutomationEntry[]>(
    () => sortEntries(projects.flatMap((project) => (project.automation_recipes || []).map((recipe) => ({ project, recipe })))),
    [projects],
  );

  const filteredEntries = useMemo(() => {
    return allEntries.filter(({ project, recipe }) => {
      if (selectedProjectId && project.id !== selectedProjectId) return false;
      if (filter === 'all') return true;
      if (filter === 'manual' || filter === 'daily' || filter === 'weekly') return recipe.trigger === filter;
      if (filter === 'agent') return recipe.target_kind === 'agent';
      if (filter === 'error') return recipe.last_run_status === 'error';
      if (filter === 'disabled') return recipe.enabled === false;
      return true;
    });
  }, [allEntries, filter, selectedProjectId]);

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, { project: Project; entries: ProjectAutomationEntry[] }>();
    for (const entry of filteredEntries) {
      const bucket = grouped.get(entry.project.id);
      if (bucket) bucket.entries.push(entry);
      else grouped.set(entry.project.id, { project: entry.project, entries: [entry] });
    }
    return Array.from(grouped.values());
  }, [filteredEntries]);

  const stats = useMemo(() => {
    const total = allEntries.length;
    const scheduled = allEntries.filter(({ recipe }) => recipe.enabled !== false && recipe.trigger !== 'manual').length;
    const running = allEntries.filter(({ recipe }) => recipe.last_run_status === 'running').length;
    const agents = allEntries.filter(({ recipe }) => recipe.target_kind === 'agent').length;
    return { total, scheduled, running, agents };
  }, [allEntries]);

  const recentActivity = useMemo(() => {
    return [...allEntries]
      .filter(({ recipe }) => recipe.last_run_at || recipe.last_run_error || recipe.last_run_status === 'running')
      .sort((a, b) => new Date(b.recipe.last_run_at || b.recipe.updated_at || 0).getTime() - new Date(a.recipe.last_run_at || a.recipe.updated_at || 0).getTime())
      .slice(0, 8);
  }, [allEntries]);

  const templatesBySection = useMemo(() => {
    const map = new Map<string, AutomationTemplate[]>();
    for (const template of TEMPLATES) {
      const list = map.get(template.section) || [];
      list.push(template);
      map.set(template.section, list);
    }
    return Array.from(map.entries());
  }, []);

  const getAgentLabel = useCallback((project: Project, recipe: ProjectAutomationRecipe) => {
    if (recipe.target_kind !== 'agent') return isZh ? '无' : 'None';
    const member = (project.team_members || []).find((item) => item.id === recipe.agent_id);
    if (!member) return isZh ? '未指定' : 'Not set';
    return member.role ? `${member.name} · ${member.role}` : member.name;
  }, [isZh]);

  const updateRecipeInProject = useCallback(async (
    project: Project,
    recipeId: string,
    updater: (recipe: ProjectAutomationRecipe) => ProjectAutomationRecipe,
  ) => {
    const nextRecipes = (project.automation_recipes || []).map((recipe) => (recipe.id === recipeId ? updater(recipe) : recipe));
    await updateProject(project.id, { automation_recipes: nextRecipes });
  }, []);

  const handleRun = useCallback(async (project: Project, recipe: ProjectAutomationRecipe) => {
    setRunningId(recipe.id);
    try {
      const result = await triggerProjectAutomationRecipe(project.id, recipe.id);
      await loadData();
      if (result?.conversation?.id) {
        navigate(`/chat/${result.conversation.id}`);
      }
    } catch (error: any) {
      window.alert(error?.message || (isZh ? '触发自动化失败。' : 'Failed to run automation.'));
    } finally {
      setRunningId(null);
    }
  }, [isZh, loadData, navigate]);

  const handleToggleEnabled = useCallback(async (project: Project, recipe: ProjectAutomationRecipe) => {
    setSavingId(recipe.id);
    try {
      await updateRecipeInProject(project, recipe.id, (current) => ({
        ...current,
        enabled: current.enabled === false ? true : false,
        updated_at: new Date().toISOString(),
      }));
      await loadData();
    } finally {
      setSavingId(null);
    }
  }, [loadData, updateRecipeInProject]);

  const handleDelete = useCallback(async (project: Project, recipe: ProjectAutomationRecipe) => {
    const confirmed = window.confirm(isZh ? `确定删除“${recipe.name}”吗？` : `Delete "${recipe.name}"?`);
    if (!confirmed) return;
    setSavingId(recipe.id);
    try {
      await updateProject(project.id, {
        automation_recipes: (project.automation_recipes || []).filter((item) => item.id !== recipe.id),
      });
      await loadData();
    } finally {
      setSavingId(null);
    }
  }, [isZh, loadData]);

  const handleStartEdit = useCallback((recipe: ProjectAutomationRecipe) => {
    setEditRecipeId(recipe.id);
    setEditDraft(buildDraftFromRecipe(recipe));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditRecipeId(null);
    setEditDraft(null);
  }, []);

  const handleSaveEdit = useCallback(async (project: Project, recipe: ProjectAutomationRecipe) => {
    if (!editDraft) return;
    if (!editDraft.name.trim() || !editDraft.prompt.trim()) {
      window.alert(isZh ? '请先填写名称和提示词。' : 'Name and prompt are required.');
      return;
    }
    if (editDraft.targetKind === 'agent' && !editDraft.agentId) {
      window.alert(isZh ? 'Agent 配方必须绑定一个 Agent。' : 'Agent recipes must bind to an agent.');
      return;
    }
    setSavingId(recipe.id);
    try {
      await updateRecipeInProject(project, recipe.id, (current) => ({
        ...current,
        name: editDraft.name.trim(),
        prompt: editDraft.prompt.trim(),
        model: editDraft.model.trim(),
        target_kind: editDraft.targetKind,
        agent_id: editDraft.targetKind === 'agent' ? editDraft.agentId : '',
        enabled: editDraft.enabled,
        trigger: editDraft.trigger,
        schedule_time: editDraft.scheduleTime,
        schedule_weekday: editDraft.trigger === 'weekly' ? editDraft.scheduleWeekday : undefined,
        updated_at: new Date().toISOString(),
      }));
      await loadData();
      setEditRecipeId(null);
      setEditDraft(null);
    } finally {
      setSavingId(null);
    }
  }, [editDraft, isZh, loadData, updateRecipeInProject]);

  const handleUseTemplate = useCallback((template: AutomationTemplate) => {
    const targetProjectId = selectedProjectId || (projects.length === 1 ? projects[0].id : '');
    if (!targetProjectId) {
      window.alert(isZh ? '先选一个项目，再从模板创建自动化。' : 'Choose a project first, then create an automation from a template.');
      navigate('/projects');
      return;
    }
    sessionStorage.setItem(PROJECT_AUTOMATION_PREFILL_KEY, JSON.stringify({
      projectId: targetProjectId,
      draft: template.draft,
    }));
    navigate(`/projects?project=${targetProjectId}`);
  }, [isZh, navigate, projects, selectedProjectId]);

  const handleOpenCreateAgentRecipe = useCallback(() => {
    setShowCreateAgentPanel(true);
    setCreateProjectId(selectedProjectId || (projects[0]?.id || ''));
    setCreateAgentDraft(createEmptyAgentRecipeDraft());
  }, [projects, selectedProjectId]);

  const handleCreateAgentRecipe = useCallback(async () => {
    if (!createTargetProject) {
      window.alert(isZh ? '请先选择一个项目。' : 'Choose a project first.');
      return;
    }
    if (!createAgentDraft.name.trim() || !createAgentDraft.prompt.trim()) {
      window.alert(isZh ? '请先填写名称和提示词。' : 'Name and prompt are required.');
      return;
    }
    if (!createAgentDraft.agentId) {
      window.alert(isZh ? '请先选择一个 Agent。' : 'Choose an agent first.');
      return;
    }
    const runtime = getProjectAutomationRuntimeSnapshot();
    const now = new Date().toISOString();
    const nextRecipe: ProjectAutomationRecipe = {
      id: `project-automation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: createAgentDraft.name.trim(),
      prompt: createAgentDraft.prompt.trim(),
      target_kind: 'agent',
      agent_id: createAgentDraft.agentId,
      model: createAgentDraft.model.trim(),
      enabled: createAgentDraft.enabled,
      trigger: createAgentDraft.trigger,
      schedule_time: createAgentDraft.scheduleTime,
      schedule_weekday: createAgentDraft.trigger === 'weekly' ? createAgentDraft.scheduleWeekday : undefined,
      run_mode: runtime.run_mode,
      env_token: runtime.env_token,
      env_base_url: runtime.env_base_url,
      last_run_at: '',
      last_run_status: 'idle',
      last_run_error: '',
      next_run_at: '',
      run_history: [],
      updated_at: now,
    };
    try {
      setSavingId(nextRecipe.id);
      await updateProject(createTargetProject.id, {
        automation_recipes: [nextRecipe, ...(createTargetProject.automation_recipes || [])],
      });
      await loadData();
      setShowCreateAgentPanel(false);
      setCreateAgentDraft(createEmptyAgentRecipeDraft());
    } finally {
      setSavingId(null);
    }
  }, [createAgentDraft, createTargetProject, isZh, loadData]);

  return (
    <div className="h-full overflow-y-auto bg-claude-bg px-5 pb-6 pt-5 text-claude-text">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <section className="rounded-[22px] border border-claude-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[760px]">
              <div className="text-[30px] font-semibold tracking-[-0.04em] text-claude-text">
                {isZh ? '自动化' : 'Automations'}
              </div>
              <div className="mt-1.5 text-[12px] leading-5 text-claude-textSecondary">
                {isZh
                  ? '把所有项目的自动化配方集中到一个工作台里。这里统一查看计划、模板、运行状态，再跳回项目继续细化。'
                  : 'Manage project recipes from one compact workspace. Review schedules, templates, and run status here, then jump back into a project to refine the details.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleOpenCreateAgentRecipe}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-claude-text px-4 text-[13px] font-medium text-claude-bg"
              >
                <Plus size={14} />
                {isZh ? '新建 Agent 配方' : 'New agent recipe'}
              </button>
              <button
                onClick={() => navigate(selectedProjectId ? `/projects?project=${selectedProjectId}` : '/projects')}
                className="inline-flex h-10 items-center rounded-xl border border-claude-border px-4 text-[13px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                {isZh ? '打开项目' : 'Open project'}
              </button>
              <button
                onClick={loadData}
                className="inline-flex h-10 items-center rounded-xl border border-claude-border px-4 text-[13px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                {isZh ? '刷新' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: isZh ? '全部配方' : 'Total recipes', value: stats.total, icon: <Sparkles size={15} className="text-[#C98B6E]" /> },
              { label: isZh ? '计划运行' : 'Scheduled', value: stats.scheduled, icon: <CalendarDays size={15} className="text-[#7AB0FF]" /> },
              { label: isZh ? '运行中' : 'Running', value: stats.running, icon: <RefreshCw size={15} className="text-[#7FD28A]" /> },
              { label: isZh ? 'Agent 绑定' : 'Agent-bound', value: stats.agents, icon: <Bot size={15} className="text-[#B699FF]" /> },
            ].map((card) => (
              <div key={card.label} className="rounded-[16px] border border-claude-border bg-claude-input/80 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-claude-textSecondary/80">{card.label}</div>
                  {card.icon}
                </div>
                <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-claude-text">{card.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.82fr)]">
          <div className="rounded-[20px] border border-claude-border bg-claude-input p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-[720px]">
                <div className="text-[18px] font-semibold text-claude-text">{isZh ? '模板库' : 'Template gallery'}</div>
                <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">
                  {isZh
                    ? '像 Codex 一样先选任务模板，再进项目落地。选中某个项目后，这些模板会直接把配方预填到项目页。'
                    : 'Pick a task template first, then land it in a project. Once a project is selected, these templates prefill the project recipe form.'}
                </div>
              </div>
              <div className="rounded-full border border-claude-border px-3 py-1 text-[11px] text-claude-textSecondary">
                {selectedProject
                  ? (isZh ? `当前项目：${selectedProject.name}` : `Project: ${selectedProject.name}`)
                  : (isZh ? '未选项目' : 'No project selected')}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {templatesBySection.map(([section, templates]) => (
                <div key={section} className="rounded-[16px] border border-claude-border/80 bg-claude-bg/65 p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-claude-textSecondary/75">{section}</div>
                  <div className="grid gap-3">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleUseTemplate(template)}
                        className="group rounded-[14px] border border-claude-border bg-claude-bg px-4 py-3 text-left transition-colors hover:bg-claude-hover"
                      >
                        <div className="flex items-center justify-between">
                          <div className="rounded-2xl bg-black/15 p-2 text-[#C98B6E] transition-transform group-hover:scale-105">
                            <Plus size={14} />
                          </div>
                          <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                            {getTriggerLabel(template.draft.trigger, isZh)}
                          </span>
                        </div>
                        <div className="mt-4 text-[15px] font-medium leading-6 text-claude-text">
                          {isZh ? template.titleZh : template.titleEn}
                        </div>
                        <div className="mt-2 text-[12px] leading-6 text-claude-textSecondary">
                          {isZh ? template.descriptionZh : template.descriptionEn}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-claude-border bg-claude-input p-4">
            <div className="text-[18px] font-semibold text-claude-text">{isZh ? '最近活动' : 'Recent activity'}</div>
            <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">
              {isZh ? '最近触发、失败或仍在运行的配方会优先出现在这里。' : 'Recently triggered, failed, or still-running recipes appear here first.'}
            </div>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {recentActivity.length > 0 ? recentActivity.map(({ project, recipe }) => (
                <div key={`recent-${project.id}-${recipe.id}`} className="rounded-[14px] border border-claude-border bg-claude-bg px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[13px] font-medium text-claude-text">{recipe.name}</div>
                    <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                      {getStatusLabel(recipe.last_run_status, isZh)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-claude-textSecondary">{project.name}</div>
                  <div className="mt-2 text-[11px] text-claude-textSecondary">
                    {recipe.last_run_status === 'running'
                      ? (isZh ? '当前正在执行。' : 'Currently running.')
                      : `${isZh ? '最近一次：' : 'Last run:'} ${formatDateTime(recipe.last_run_at, isZh)}`}
                  </div>
                  {Array.isArray(recipe.run_history) && recipe.run_history[0] ? (
                    <button
                      onClick={() => setSelectedHistory({ project, recipe, entry: recipe.run_history![0] })}
                      className="mt-2 rounded-lg border border-claude-border px-2.5 py-1 text-[11px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                    >
                      {isZh ? '查看详情' : 'View details'}
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-[14px] border border-dashed border-claude-border px-3 py-8 text-center text-[12px] leading-6 text-claude-textSecondary">
                  {isZh ? '还没有运行记录。先触发一个配方，这里就会开始显示最近活动。' : 'No activity yet. Run a recipe once and the latest activity will appear here.'}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${active ? 'bg-claude-text text-claude-bg' : 'border border-claude-border text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text'}`}
              >
                {isZh ? item.zh : item.en}
              </button>
            );
          })}
          {selectedProjectId ? (
            <button
              onClick={() => navigate('/automations')}
              className="ml-auto rounded-full border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
            >
              {isZh ? '查看全部项目' : 'Show all projects'}
            </button>
          ) : null}
        </section>

        {loading ? (
          <div className="rounded-[22px] border border-claude-border bg-claude-input px-6 py-12 text-center text-[14px] text-claude-textSecondary">
            {isZh ? '正在加载自动化工作台…' : 'Loading automations…'}
          </div>
        ) : groupedEntries.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-claude-border bg-claude-input px-6 py-12 text-center">
            <div className="text-[18px] font-medium text-claude-text">
              {isZh ? '还没有自动化配方' : 'No automation recipes yet'}
            </div>
            <div className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
              {isZh
                ? '先去项目页保存一个“研究播报”或“Agent 执行任务”配方，这里就会自动变成你的跨项目自动化工作台。'
                : 'Save a research summary or agent-execution recipe in a project first. This page will then become your cross-project automation workspace.'}
            </div>
            <button
              onClick={() => navigate('/projects')}
              className="mt-4 rounded-xl bg-claude-text px-4 py-2 text-[13px] font-medium text-claude-bg"
            >
              {isZh ? '去项目页创建' : 'Create from projects'}
            </button>
          </div>
        ) : (
          <section className="space-y-4">
            {groupedEntries.map(({ project, entries }) => {
              const projectAgents = Array.isArray(project.team_members)
                ? project.team_members.filter((member) => member.kind === 'agent')
                : [];
              return (
                <div key={project.id} className="rounded-[22px] border border-claude-border bg-claude-input p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[18px] font-semibold text-claude-text">
                        <FolderOpen size={18} className="text-[#C98B6E]" />
                        <span>{project.name}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-claude-textSecondary">
                        {isZh ? `${entries.length} 条配方` : `${entries.length} recipes`}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/projects?project=${project.id}`)}
                      className="rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                    >
                      {isZh ? '打开项目' : 'Open project'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {entries.map(({ recipe }) => {
                      const disabled = recipe.enabled === false;
                      const isRunning = runningId === recipe.id || recipe.last_run_status === 'running';
                      const isSaving = savingId === recipe.id;
                      const isEditing = editRecipeId === recipe.id && !!editDraft;
                      const history = Array.isArray(recipe.run_history) ? recipe.run_history : [];
                      const isHistoryExpanded = expandedHistoryId === recipe.id;
                      const toneClass = recipe.last_run_status === 'error'
                        ? 'border-red-500/20'
                        : recipe.last_run_status === 'running'
                          ? 'border-[#7FD28A]/30'
                          : 'border-claude-border';

                      return (
                        <div key={recipe.id} className={`rounded-[18px] border ${toneClass} bg-claude-bg px-4 py-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-[15px] font-medium text-claude-text">{recipe.name}</div>
                                <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                  {getChatKindLabel(recipe.target_kind, isZh)}
                                </span>
                                <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                  {getTriggerLabel(recipe.trigger, isZh)}
                                </span>
                                <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                  {getStatusLabel(recipe.last_run_status, isZh)}
                                </span>
                                {disabled ? (
                                  <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                    {isZh ? '已关闭' : 'Disabled'}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 line-clamp-3 text-[12px] leading-6 text-claude-textSecondary">
                                {recipe.prompt}
                              </div>
                            </div>
                            {recipe.last_run_status === 'error' ? (
                              <TriangleAlert size={16} className="mt-1 flex-shrink-0 text-[#E05A5A]" />
                            ) : recipe.last_run_status === 'running' ? (
                              <RefreshCw size={16} className="mt-1 flex-shrink-0 animate-spin text-[#7FD28A]" />
                            ) : (
                              <Clock3 size={16} className="mt-1 flex-shrink-0 text-claude-textSecondary" />
                            )}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[11px] text-claude-textSecondary">
                            <div className="rounded-xl border border-claude-border bg-black/10 px-3 py-2">
                              <div>{isZh ? '计划' : 'Schedule'}</div>
                              <div className="mt-1 text-claude-text">{formatSchedule(recipe, isZh)}</div>
                            </div>
                            <div className="rounded-xl border border-claude-border bg-black/10 px-3 py-2">
                              <div>{isZh ? '下次运行' : 'Next run'}</div>
                              <div className="mt-1 text-claude-text">{formatDateTime(recipe.next_run_at, isZh)}</div>
                            </div>
                            <div className="rounded-xl border border-claude-border bg-black/10 px-3 py-2">
                              <div>{isZh ? '最近运行' : 'Last run'}</div>
                              <div className="mt-1 text-claude-text">{formatDateTime(recipe.last_run_at, isZh)}</div>
                            </div>
                            <div className="rounded-xl border border-claude-border bg-black/10 px-3 py-2">
                              <div>{isZh ? '绑定 Agent' : 'Bound agent'}</div>
                              <div className="mt-1 truncate text-claude-text">{getAgentLabel(project, recipe)}</div>
                            </div>
                          </div>

                          {recipe.last_run_error ? (
                            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] leading-5 text-[#E28A8A]">
                              {recipe.last_run_error}
                            </div>
                          ) : null}

                          {history.length > 0 ? (
                            <div className="mt-3 rounded-[16px] border border-claude-border bg-claude-input px-3 py-3">
                              <button
                                onClick={() => setExpandedHistoryId((current) => (current === recipe.id ? null : recipe.id))}
                                className="flex w-full items-center justify-between text-left"
                              >
                                <div>
                                  <div className="text-[12px] font-medium text-claude-text">
                                    {isZh ? '执行历史' : 'Run history'}
                                  </div>
                                  <div className="mt-1 text-[11px] text-claude-textSecondary">
                                    {isZh ? `最近 ${history.length} 次运行` : `${history.length} recent runs`}
                                  </div>
                                </div>
                                {isHistoryExpanded ? (
                                  <ChevronUp size={14} className="text-claude-textSecondary" />
                                ) : (
                                  <ChevronDown size={14} className="text-claude-textSecondary" />
                                )}
                              </button>
                              {isHistoryExpanded ? (
                                <div className="mt-3 space-y-2">
                                  {history.slice(0, 6).map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-claude-border bg-black/10 px-3 py-2 text-[11px]">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-claude-text">{getStatusLabel(entry.status, isZh)}</span>
                                        <span className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary">
                                          {getRunSourceLabel(entry.source, isZh)}
                                        </span>
                                        <button
                                          onClick={() => setSelectedHistory({ project, recipe, entry })}
                                          className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                                        >
                                          {isZh ? '详情' : 'Details'}
                                        </button>
                                        {entry.conversation_id ? (
                                          <button
                                            onClick={() => navigate(`/chat/${entry.conversation_id}`)}
                                            className="rounded-full border border-claude-border px-2 py-0.5 text-[10px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                                          >
                                            {isZh ? '打开会话' : 'Open chat'}
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 text-claude-textSecondary">
                                        {isZh ? '开始' : 'Started'} {formatDateTime(entry.started_at, isZh)}
                                        {entry.finished_at ? ` · ${isZh ? '结束' : 'Finished'} ${formatDateTime(entry.finished_at, isZh)}` : ''}
                                      </div>
                                      {entry.error ? <div className="mt-1 text-[#E28A8A]">{entry.error}</div> : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {isEditing && editDraft ? (
                            <div className="mt-4 rounded-[16px] border border-claude-border bg-claude-input p-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                  value={editDraft.name}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                                  placeholder={isZh ? '配方名称' : 'Recipe name'}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                                />
                                <input
                                  value={editDraft.model}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, model: event.target.value } : prev))}
                                  placeholder={isZh ? '固定模型，可选' : 'Pinned model, optional'}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                                />
                                <select
                                  value={editDraft.trigger}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, trigger: event.target.value as ProjectAutomationTrigger } : prev))}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                                >
                                  <option value="manual">{isZh ? '手动触发' : 'Manual trigger'}</option>
                                  <option value="daily">{isZh ? '每天' : 'Daily'}</option>
                                  <option value="weekly">{isZh ? '每周' : 'Weekly'}</option>
                                </select>
                                <select
                                  value={editDraft.targetKind}
                                  onChange={(event) => setEditDraft((prev) => (
                                    prev
                                      ? {
                                        ...prev,
                                        targetKind: event.target.value as ProjectChatKind,
                                        agentId: event.target.value === 'agent' ? prev.agentId : '',
                                      }
                                      : prev
                                  ))}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                                >
                                  <option value="general">{isZh ? '普通会话' : 'General chat'}</option>
                                  <option value="code">{isZh ? '代码会话' : 'Code chat'}</option>
                                  <option value="research">{isZh ? '研究会话' : 'Research chat'}</option>
                                  <option value="agent">Agent</option>
                                </select>
                                <input
                                  type="time"
                                  value={editDraft.scheduleTime}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, scheduleTime: event.target.value || '09:00' } : prev))}
                                  disabled={editDraft.trigger === 'manual'}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none disabled:opacity-40"
                                />
                                <select
                                  value={String(editDraft.scheduleWeekday)}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, scheduleWeekday: Number(event.target.value) } : prev))}
                                  disabled={editDraft.trigger !== 'weekly'}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none disabled:opacity-40"
                                >
                                  {WEEKDAYS.map((weekday) => (
                                    <option key={weekday.id} value={weekday.id}>
                                      {isZh ? weekday.zh : weekday.en}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editDraft.agentId}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, agentId: event.target.value } : prev))}
                                  disabled={editDraft.targetKind !== 'agent' || projectAgents.length === 0}
                                  className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none disabled:opacity-40"
                                >
                                  <option value="">{isZh ? '选择 Agent' : 'Choose agent'}</option>
                                  {projectAgents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                      {agent.name}{agent.role ? ` · ${agent.role}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <textarea
                                value={editDraft.prompt}
                                onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, prompt: event.target.value } : prev))}
                                placeholder={isZh ? '描述这个自动化要完成什么' : 'Describe what this automation should do'}
                                className="mt-3 h-[88px] w-full resize-none rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[12px] text-claude-text outline-none"
                              />
                              <label className="mt-3 flex items-center gap-2 text-[12px] text-claude-textSecondary">
                                <input
                                  type="checkbox"
                                  checked={editDraft.enabled}
                                  onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))}
                                />
                                <span>{isZh ? '保存后保持启用' : 'Keep this recipe enabled'}</span>
                              </label>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleSaveEdit(project, recipe)}
                                  disabled={isSaving}
                                  className="rounded-lg bg-claude-text px-3 py-1.5 text-[12px] font-medium text-claude-bg disabled:opacity-50"
                                >
                                  {isZh ? '保存修改' : 'Save changes'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="rounded-lg border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                                >
                                  {isZh ? '取消' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleRun(project, recipe)}
                              disabled={isRunning || isSaving}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#C98B6E]/40 px-3 py-1.5 text-[12px] text-[#C98B6E] hover:bg-[#C98B6E]/10 disabled:opacity-50"
                            >
                              <Play size={12} />
                              {isRunning ? (isZh ? '运行中' : 'Running') : (isZh ? '立即运行' : 'Run now')}
                            </button>
                            <button
                              onClick={() => handleToggleEnabled(project, recipe)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text disabled:opacity-50"
                            >
                              {disabled ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                              {disabled ? (isZh ? '启用' : 'Enable') : (isZh ? '停用' : 'Disable')}
                            </button>
                            <button
                              onClick={() => handleStartEdit(recipe)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                            >
                              <Pencil size={12} />
                              {isZh ? '编辑' : 'Edit'}
                            </button>
                            <button
                              onClick={() => navigate(`/projects?project=${project.id}`)}
                              className="rounded-xl border border-claude-border px-3 py-1.5 text-[12px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
                            >
                              {isZh ? '去项目页' : 'Open project'}
                            </button>
                            <button
                              onClick={() => handleDelete(project, recipe)}
                              disabled={isSaving}
                              className="rounded-xl border border-red-500/25 px-3 py-1.5 text-[12px] text-[#E05A5A] hover:bg-red-500/10 disabled:opacity-50"
                            >
                              {isZh ? '删除' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {showCreateAgentPanel ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-6" onClick={() => setShowCreateAgentPanel(false)}>
          <div
            className="w-full max-w-[760px] rounded-[24px] border border-claude-border bg-claude-input p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[20px] font-semibold text-claude-text">
                  {isZh ? '新建 Agent 自动化' : 'New agent automation'}
                </div>
                <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">
                  {isZh
                    ? '直接在工作台里绑定项目、Agent、触发频率和提示词，保存后就能运行。'
                    : 'Bind a project, agent, schedule, and prompt right here in the workspace, then save and run it immediately.'}
                </div>
              </div>
              <button
                onClick={() => setShowCreateAgentPanel(false)}
                className="rounded-xl border border-claude-border p-2 text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                value={createProjectId}
                onChange={(event) => setCreateProjectId(event.target.value)}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none"
              >
                <option value="">{isZh ? '选择项目' : 'Choose project'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select
                value={createAgentDraft.agentId}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, agentId: event.target.value }))}
                disabled={!createTargetProject || !Array.isArray(createTargetProject.team_members) || createTargetProject.team_members.filter((member) => member.kind === 'agent').length === 0}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none disabled:opacity-40"
              >
                <option value="">{isZh ? '选择 Agent' : 'Choose agent'}</option>
                {(createTargetProject?.team_members || []).filter((member) => member.kind === 'agent').map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}{member.role ? ` · ${member.role}` : ''}
                  </option>
                ))}
              </select>
              <input
                value={createAgentDraft.name}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={isZh ? '配方名称，例如：Agent 故障分诊' : 'Recipe name, e.g. Agent triage'}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none"
              />
              <input
                value={createAgentDraft.model}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, model: event.target.value }))}
                placeholder={isZh ? '固定模型，可选' : 'Pinned model, optional'}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none"
              />
              <select
                value={createAgentDraft.trigger}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, trigger: event.target.value as ProjectAutomationTrigger }))}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none"
              >
                <option value="manual">{isZh ? '手动触发' : 'Manual trigger'}</option>
                <option value="daily">{isZh ? '每天' : 'Daily'}</option>
                <option value="weekly">{isZh ? '每周' : 'Weekly'}</option>
              </select>
              <input
                type="time"
                value={createAgentDraft.scheduleTime}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, scheduleTime: event.target.value || '09:00' }))}
                disabled={createAgentDraft.trigger === 'manual'}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none disabled:opacity-40"
              />
              <select
                value={String(createAgentDraft.scheduleWeekday)}
                onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, scheduleWeekday: Number(event.target.value) }))}
                disabled={createAgentDraft.trigger !== 'weekly'}
                className="rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none disabled:opacity-40"
              >
                {WEEKDAYS.map((weekday) => (
                  <option key={weekday.id} value={weekday.id}>{isZh ? weekday.zh : weekday.en}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-lg border border-claude-border px-3 py-2 text-[13px] text-claude-textSecondary">
                <input
                  type="checkbox"
                  checked={createAgentDraft.enabled}
                  onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                <span>{isZh ? '保存后保持启用' : 'Enable after saving'}</span>
              </label>
            </div>

            <textarea
              value={createAgentDraft.prompt}
              onChange={(event) => setCreateAgentDraft((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder={isZh ? '描述这个 Agent 自动化要完成什么，例如：检查失败任务并给出修复建议。' : 'Describe what this agent automation should do, e.g. inspect failed tasks and propose fixes.'}
              className="mt-4 h-[110px] w-full resize-none rounded-lg border border-claude-border bg-transparent px-3 py-2 text-[13px] text-claude-text outline-none"
            />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setShowCreateAgentPanel(false)}
                className="rounded-xl border border-claude-border px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleCreateAgentRecipe}
                className="rounded-xl bg-claude-text px-4 py-2 text-[13px] font-medium text-claude-bg"
              >
                {isZh ? '保存 Agent 配方' : 'Save agent recipe'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedHistory ? (
        <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setSelectedHistory(null)}>
          <div
            className="absolute right-0 top-0 h-full w-[420px] border-l border-claude-border bg-claude-input p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[20px] font-semibold text-claude-text">
                  {isZh ? '运行详情' : 'Run details'}
                </div>
                <div className="mt-1 text-[12px] text-claude-textSecondary">{selectedHistory.recipe.name}</div>
              </div>
              <button
                onClick={() => setSelectedHistory(null)}
                className="rounded-xl border border-claude-border p-2 text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[12px] text-claude-textSecondary">
              <div className="rounded-[16px] border border-claude-border bg-claude-bg px-4 py-3">
                <div>{isZh ? '项目' : 'Project'}</div>
                <div className="mt-1 text-[13px] font-medium text-claude-text">{selectedHistory.project.name}</div>
              </div>
              <div className="rounded-[16px] border border-claude-border bg-claude-bg px-4 py-3">
                <div>{isZh ? '状态 / 来源' : 'Status / source'}</div>
                <div className="mt-1 text-[13px] font-medium text-claude-text">
                  {getStatusLabel(selectedHistory.entry.status, isZh)} · {getRunSourceLabel(selectedHistory.entry.source, isZh)}
                </div>
              </div>
              <div className="rounded-[16px] border border-claude-border bg-claude-bg px-4 py-3">
                <div>{isZh ? '开始 / 结束' : 'Started / finished'}</div>
                <div className="mt-1 text-[13px] font-medium text-claude-text">{formatDateTime(selectedHistory.entry.started_at, isZh)}</div>
                <div className="mt-1 text-[12px] text-claude-textSecondary">
                  {selectedHistory.entry.finished_at ? formatDateTime(selectedHistory.entry.finished_at, isZh) : (isZh ? '仍在运行' : 'Still running')}
                </div>
              </div>
              <div className="rounded-[16px] border border-claude-border bg-claude-bg px-4 py-3">
                <div>{isZh ? '绑定 Agent / 运行模式' : 'Bound agent / run mode'}</div>
                <div className="mt-1 text-[13px] font-medium text-claude-text">{getAgentLabel(selectedHistory.project, selectedHistory.recipe)}</div>
                <div className="mt-1 text-[12px] text-claude-textSecondary">{getRunModeLabel(selectedHistory.recipe.run_mode, isZh)}</div>
              </div>
              <div className="rounded-[16px] border border-claude-border bg-claude-bg px-4 py-3">
                <div>{isZh ? '配方提示词' : 'Recipe prompt'}</div>
                <div className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-claude-text">{selectedHistory.recipe.prompt}</div>
              </div>
              {selectedHistory.entry.error ? (
                <div className="rounded-[16px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[#E28A8A]">
                  {selectedHistory.entry.error}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedHistory.entry.conversation_id ? (
                <button
                  onClick={() => navigate(`/chat/${selectedHistory.entry.conversation_id}`)}
                  className="rounded-xl border border-[#C98B6E]/40 px-4 py-2 text-[13px] text-[#C98B6E] hover:bg-[#C98B6E]/10"
                >
                  {isZh ? '打开会话' : 'Open chat'}
                </button>
              ) : null}
              <button
                onClick={() => navigate(`/projects?project=${selectedHistory.project.id}`)}
                className="rounded-xl border border-claude-border px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover hover:text-claude-text"
              >
                {isZh ? '打开项目' : 'Open project'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
