import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Plus, ChevronDown, ArrowLeft, MoreVertical, Star, ArrowUp, FileText, Trash, Pencil, MessageSquare, X, Upload, Check, AudioLines, ChevronRight, Archive, Github, RefreshCw, FolderOpen, Copy, GitBranch, Link2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Paperclip, ListCollapse } from 'lucide-react';
import { getProjects, createProject, getProject, updateProject, deleteProject, uploadProjectFile, deleteProjectFile, createProjectConversation, deleteConversation, updateConversation, getSkills, Project, ProjectFile, ProjectGithubSource, importProjectGithub, syncProjectGithubSource, updateProjectGithubSource, removeProjectGithubSource, deriveProjectWorkspace } from '../api';
import ModelSelector, { SelectableModel } from './ModelSelector';
import { IconPlus } from './Icons';
import startProjectsImg from '../assets/icons/start-projects.png';
import AddFromGithubModal, { GithubAddPayload } from './AddFromGithubModal';
import { copyToClipboard } from '../utils/clipboard';

const getConversationGroupKey = (dateValue?: string) => {
  if (!dateValue) return 'older';
  const target = new Date(dateValue);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'week';
  return 'older';
};

const getConversationGroupLabel = (key: string, isZh: boolean) => {
  if (key === 'today') return isZh ? '今天' : 'Today';
  if (key === 'yesterday') return isZh ? '昨天' : 'Yesterday';
  if (key === 'week') return isZh ? '最近 7 天' : 'Last 7 days';
  return isZh ? '更早' : 'Older';
};

const formatConversationTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const getTimelineDayLabel = (value: string, isZh: boolean) => {
  const target = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return isZh ? '今天' : 'Today';
  if (diffDays === 1) return isZh ? '昨天' : 'Yesterday';
  return target.toLocaleDateString();
};

type ProjectDocDraft = {
  overview: string;
  goals: string;
  stack: string;
  constraints: string;
  commands: string;
  notes: string;
};

const PROJECT_DOC_SECTIONS: Array<{ key: keyof ProjectDocDraft; title: string }> = [
  { key: 'overview', title: 'Overview' },
  { key: 'goals', title: 'Goals' },
  { key: 'stack', title: 'Tech Stack' },
  { key: 'constraints', title: 'Constraints' },
  { key: 'commands', title: 'Commands' },
  { key: 'notes', title: 'Notes' },
];

const createEmptyProjectDocDraft = (): ProjectDocDraft => ({
  overview: '',
  goals: '',
  stack: '',
  constraints: '',
  commands: '',
  notes: '',
});

const normalizeProjectDocText = (value?: string) => (value || '').replace(/\r\n/g, '\n').trim();

const parseProjectDocument = (value?: string): ProjectDocDraft => {
  const source = normalizeProjectDocText(value);
  const draft = createEmptyProjectDocDraft();

  if (!source) return draft;

  let matchedSection = false;
  PROJECT_DOC_SECTIONS.forEach((section) => {
    const pattern = new RegExp(`##\\s+${section.title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
    const match = source.match(pattern);
    if (match) {
      draft[section.key] = normalizeProjectDocText(match[1]);
      matchedSection = true;
    }
  });

  if (!matchedSection) {
    draft.overview = source;
  }

  return draft;
};

const buildProjectDocument = (draft: ProjectDocDraft) => (
  PROJECT_DOC_SECTIONS
    .map((section) => {
      const content = normalizeProjectDocText(draft[section.key]);
      if (!content) return null;
      return `## ${section.title}\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
);

const ProjectsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isZh = localStorage.getItem('ui_language') === 'zh-CN';
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [projectDocDraft, setProjectDocDraft] = useState<ProjectDocDraft>(createEmptyProjectDocDraft);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'activity' | 'edited' | 'created'>('activity');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editDetailsName, setEditDetailsName] = useState('');
  const [editDetailsDesc, setEditDetailsDesc] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedSkill, setSelectedSkill] = useState<{ name: string; slug: string; description?: string } | null>(null);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [editingGithubSource, setEditingGithubSource] = useState<ProjectGithubSource | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [projectActionMessage, setProjectActionMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [derivingProjectId, setDerivingProjectId] = useState<string | null>(null);
  const [conversationActionMenuId, setConversationActionMenuId] = useState<string | null>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const hydrateProjectDocEditor = useCallback((projectData: any) => {
    const parsed = parseProjectDocument(projectData?.instructions || projectData?.description || '');
    setProjectDocDraft(parsed);
    setInstructionsText(buildProjectDocument(parsed));
  }, []);

  // Model selector state — load from self-hosted config or use defaults
  const isSelfHostedMode = localStorage.getItem('user_mode') === 'selfhosted';
  const selectorModels = useMemo<SelectableModel[]>(() => {
    if (isSelfHostedMode) {
      try {
        const chatModels = JSON.parse(localStorage.getItem('chat_models') || '[]');
        if (chatModels.length > 0) {
          const tierDescMap: Record<string, string> = {
            'opus': 'Most capable for ambitious work',
            'sonnet': 'Most efficient for everyday tasks',
            'haiku': 'Fastest for quick answers',
          };
          return chatModels.map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            enabled: 1,
            tier: m.tier || 'extra',
            description: m.tier && tierDescMap[m.tier] ? tierDescMap[m.tier] : undefined,
          }));
        }
      } catch (_) { }
    }
    return [
      { id: 'claude-opus-4-6', name: 'Opus 4.6', enabled: 1, description: 'Most capable for ambitious work' },
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', enabled: 1, description: 'Most efficient for everyday tasks' },
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', enabled: 1, description: 'Fastest for quick answers' },
    ];
  }, [isSelfHostedMode]);
  const [currentModelString, setCurrentModelString] = useState(() => {
    const saved = localStorage.getItem('default_model');
    if (!saved) return 'claude-sonnet-4-6';
    if (!isSelfHostedMode && !/^claude-/i.test(saved.replace(/-thinking$/, ''))) {
      return 'claude-sonnet-4-6';
    }
    return saved;
  });
  const handleModelChange = (newModelString: string) => {
    setCurrentModelString(newModelString);
  };

  const handleChatSubmit = async () => {
    if (!message.trim() || !currentProject) return;
    try {
      const conv = await createProjectConversation(currentProject.id, message.slice(0, 50), currentModelString);
      navigate(`/chat/${conv.id}`, { state: { initialMessage: message, model: currentModelString } });
      setMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (_) { }
    setLoading(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Load skills when plus menu opens
  useEffect(() => {
    if (!showPlusMenu) { setShowSkillsSubmenu(false); return; }
    getSkills().then((data: any) => {
      const all = [...(data.examples || []), ...(data.my_skills || [])];
      setEnabledSkills(all.filter((s: any) => s.enabled).map((s: any) => ({ id: s.id, name: s.name, description: s.description })));
    }).catch(() => {});
  }, [showPlusMenu]);

  // Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPlusMenu]);

  const loadProject = useCallback(async (id: string) => {
    try {
      const data = await getProject(id);
      setCurrentProject(data);
      hydrateProjectDocEditor(data);
      setGithubError(null);
    } catch (_) { }
  }, [hydrateProjectDocEditor]);

  useEffect(() => {
    const projectId = new URLSearchParams(location.search).get('project');
    if (projectId) {
      loadProject(projectId);
    }
  }, [location.search, loadProject]);

  useEffect(() => {
    if (!projectActionMessage) return;
    const timer = window.setTimeout(() => setProjectActionMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [projectActionMessage]);

  useEffect(() => {
    const nextInstructions = buildProjectDocument(projectDocDraft);
    setInstructionsText((prev) => (prev === nextInstructions ? prev : nextInstructions));
  }, [projectDocDraft]);

  const getCodeWorkspacePath = () => localStorage.getItem('code_workspace_path') || '';

  const setCodeWorkspacePath = (nextWorkspacePath: string) => {
    localStorage.setItem('code_workspace_path', nextWorkspacePath);
    window.dispatchEvent(new CustomEvent('projectWorkspaceSelected', { detail: { path: nextWorkspacePath } }));
  };

  const getProjectDeepLink = (projectId: string) => {
    const base = window.location.href.split('#')[0];
    return `${base}#/projects?project=${projectId}`;
  };

  const showProjectActionResult = (tone: 'success' | 'error', text: string) => {
    setProjectActionMessage({ tone, text });
  };

  const handleCreate = async () => {
    const name = projectName.trim() || 'Untitled Project';
    try {
      const project = await createProject(name, projectDescription.trim());
      setIsCreating(false);
      setProjectName('');
      setProjectDescription('');
      navigate(`/projects?project=${project.id}`);
      loadProject(project.id);
      loadProjects();
    } catch (_) { }
  };

  const handleDelete = async () => {
    if (!currentProject) return;
    if (!window.confirm(`确定要删除项目「${currentProject.name}」吗？所有关联的文件和对话也会被删除。`)) return;
    try {
      await deleteProject(currentProject.id);
      setCurrentProject(null);
      setShowMenu(false);
      loadProjects();
    } catch (_) { }
  };

  const handleDeleteProject = async (p: Project) => {
    try {
      await deleteProject(p.id);
      if (currentProject && currentProject.id === p.id) {
        setCurrentProject(null);
      }
      setProjectToDelete(null);
      loadProjects();
    } catch (_) { }
  };

  const handleSaveEditDetails = async () => {
    if (!projectToEdit) return;
    try {
      await updateProject(projectToEdit.id, {
        name: editDetailsName,
        description: editDetailsDesc
      });
      setProjectToEdit(null);
      loadProjects();
      if (currentProject && currentProject.id === projectToEdit.id) {
        loadProject(currentProject.id);
      }
    } catch (_) { }
  };

  const handleSaveInstructions = async () => {
    if (!currentProject) return;
    const nextInstructions = buildProjectDocument(projectDocDraft);
    await updateProject(currentProject.id, { instructions: nextInstructions });
    setEditingInstructions(false);
    loadProject(currentProject.id);
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (!currentProject) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await uploadProjectFile(currentProject.id, file);
      } catch (_) { }
    }
    setUploading(false);
    loadProject(currentProject.id);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!currentProject) return;
    await deleteProjectFile(currentProject.id, fileId);
    loadProject(currentProject.id);
  };

  const handleNewChat = async () => {
    if (!currentProject) return;
    try {
      const conv = await createProjectConversation(currentProject.id);
      navigate(`/chat/${conv.id}`);
    } catch (_) { }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentProject) return;
    try {
      await deleteConversation(convId);
      loadProject(currentProject.id);
      loadProjects(); // refresh chat_count
    } catch (_) { }
  };

  const handleRenameSave = async () => {
    if (!currentProject || !editName.trim()) return;
    await updateProject(currentProject.id, { name: editName.trim() });
    setEditingName(false);
    loadProject(currentProject.id);
    loadProjects();
  };

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // 'activity' and 'edited' both sort by updated_at
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [projects, searchQuery, sortBy]);

  const groupedProjectConversations = useMemo(() => {
    if (!currentProject?.conversations) return [];
    const buckets: Array<{ key: string; label: string; items: any[] }> = [
      { key: 'today', label: getConversationGroupLabel('today', isZh), items: [] },
      { key: 'yesterday', label: getConversationGroupLabel('yesterday', isZh), items: [] },
      { key: 'week', label: getConversationGroupLabel('week', isZh), items: [] },
      { key: 'older', label: getConversationGroupLabel('older', isZh), items: [] },
    ];
    currentProject.conversations.forEach((conv: any) => {
      const key = getConversationGroupKey(conv.created_at);
      const bucket = buckets.find((item) => item.key === key);
      if (bucket) bucket.items.push(conv);
    });
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [currentProject, isZh]);

  const projectActivityItems = useMemo(() => {
    if (!currentProject) return [];
    const parsedDoc = parseProjectDocument(currentProject.instructions || currentProject.description || '');
    const projectDoc = currentProject.instructions || currentProject.description;
    const projectSummary = projectDoc ? [{
      id: `project-${currentProject.id}`,
      type: 'project',
      title: isZh ? '项目文档已更新' : 'Project doc updated',
      detail: parsedDoc.goals || parsedDoc.overview || (isZh ? '继续补目标、约束和常用命令。' : 'Keep enriching goals, constraints, and commands.'),
      at: currentProject.updated_at,
    }] : [];
    const conversations = (currentProject.conversations || []).map((conv: any) => ({
      id: `conv-${conv.id}`,
      type: 'chat',
      title: conv.title || (isZh ? '未命名聊天' : 'Untitled chat'),
      detail: isZh ? '项目聊天' : 'Project chat',
      at: conv.created_at,
    }));
    const files = (currentProject.files || []).map((file: ProjectFile) => ({
      id: `file-${file.id}`,
      type: 'file',
      title: file.file_name,
      detail: file.source_type === 'github' ? 'GitHub file' : (isZh ? '项目文件' : 'Project file'),
      at: file.created_at,
    }));
    const sources = (currentProject.github_sources || []).map((source: ProjectGithubSource) => ({
      id: `source-${source.id}`,
      type: 'github',
      title: source.repo_full_name,
      detail: isZh ? `同步到 ${source.ref}` : `Synced to ${source.ref}`,
      at: source.last_synced_at || source.added_at,
    }));

    return [...projectSummary, ...conversations, ...files, ...sources]
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);
  }, [currentProject, isZh]);

  const currentProjectDoc = useMemo(
    () => parseProjectDocument(currentProject?.instructions || currentProject?.description || ''),
    [currentProject?.instructions, currentProject?.description],
  );

  const projectDocSections = useMemo(() => {
    const sectionLabels: Record<keyof ProjectDocDraft, string> = {
      overview: isZh ? '项目概览' : 'Overview',
      goals: isZh ? '目标' : 'Goals',
      stack: isZh ? '技术栈' : 'Tech stack',
      constraints: isZh ? '约束' : 'Constraints',
      commands: isZh ? '常用命令' : 'Commands',
      notes: isZh ? '补充备注' : 'Notes',
    };

    return PROJECT_DOC_SECTIONS.map((section) => ({
      key: section.key,
      label: sectionLabels[section.key],
      value: currentProjectDoc[section.key],
    })).filter((section) => section.value);
  }, [currentProjectDoc, isZh]);

  const updateProjectDocField = (key: keyof ProjectDocDraft, value: string) => {
    setProjectDocDraft((prev) => ({ ...prev, [key]: value }));
  };

  const groupedProjectTimeline = useMemo(() => {
    const groups: Array<{ label: string; items: typeof projectActivityItems }> = [];
    projectActivityItems.forEach((item) => {
      const label = getTimelineDayLabel(item.at, isZh);
      const existing = groups.find((group) => group.label === label);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
    });
    return groups;
  }, [projectActivityItems, isZh]);

  const handleProjectGithubImport = async (payload: GithubAddPayload) => {
    if (!currentProject) return;
    setGithubError(null);
    try {
      await importProjectGithub(currentProject.id, payload);
      await loadProject(currentProject.id);
      await loadProjects();
    } catch (err: any) {
      setGithubError(err?.message || 'Failed to import GitHub files');
      throw err;
    }
  };

  const handleProjectGithubUpdate = async (payload: GithubAddPayload) => {
    if (!currentProject || !editingGithubSource) return;
    setGithubError(null);
    setSyncingSourceId(editingGithubSource.id);
    try {
      await updateProjectGithubSource(currentProject.id, editingGithubSource.id, {
        ref: payload.ref,
        selections: payload.selections,
      });
      await loadProject(currentProject.id);
      await loadProjects();
    } catch (err: any) {
      setGithubError(err?.message || 'Failed to update GitHub source');
      throw err;
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleSyncGithubSource = async (source: ProjectGithubSource) => {
    if (!currentProject) return;
    setGithubError(null);
    setSyncingSourceId(source.id);
    try {
      await syncProjectGithubSource(currentProject.id, source.id);
      await loadProject(currentProject.id);
      await loadProjects();
    } catch (err: any) {
      setGithubError(err?.message || 'Failed to sync GitHub source');
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleRemoveGithubSource = async (source: ProjectGithubSource) => {
    if (!currentProject) return;
    if (!window.confirm(`Remove ${source.repo_full_name} from this project? Imported GitHub files will also be removed.`)) return;
    setGithubError(null);
    setSyncingSourceId(source.id);
    try {
      await removeProjectGithubSource(currentProject.id, source.id);
      await loadProject(currentProject.id);
      await loadProjects();
    } catch (err: any) {
      setGithubError(err?.message || 'Failed to remove GitHub source');
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleGithubModalClose = () => {
    setShowGithubModal(false);
    setEditingGithubSource(null);
  };

  const handleCopyProjectWorkspace = async (project: Project) => {
    const ok = await copyToClipboard(project.workspace_path || '');
    showProjectActionResult(ok ? 'success' : 'error', ok ? (isZh ? '已复制工作目录' : 'Workspace path copied') : (isZh ? '复制工作目录失败' : 'Failed to copy workspace path'));
  };

  const handleCopyProjectDeeplink = async (project: Project) => {
    const ok = await copyToClipboard(getProjectDeepLink(project.id));
    showProjectActionResult(ok ? 'success' : 'error', ok ? (isZh ? '已复制项目 Deeplink' : 'Project deeplink copied') : (isZh ? '复制项目 Deeplink 失败' : 'Failed to copy project deeplink'));
  };

  const handleOpenProjectFolder = async (project: Project) => {
    const workspacePath = project.workspace_path;
    if (!workspacePath) {
      showProjectActionResult('error', isZh ? '这个项目还没有绑定工作目录' : 'This project does not have a workspace path yet');
      return;
    }
    try {
      if ((window as any).electronAPI?.openFolder) {
        await (window as any).electronAPI.openFolder(workspacePath);
        showProjectActionResult('success', isZh ? '已打开项目目录' : 'Project folder opened');
      }
    } catch (error) {
      console.error(error);
      showProjectActionResult('error', isZh ? '打开项目目录失败' : 'Failed to open project folder');
    }
  };

  const handleBindCurrentWorkspace = async (project: Project) => {
    const codeWorkspacePath = getCodeWorkspacePath();
    if (!codeWorkspacePath) {
      showProjectActionResult('error', isZh ? '请先在代码页选择一个工作区' : 'Choose a code workspace first');
      return;
    }
    try {
      await updateProject(project.id, { workspace_path: codeWorkspacePath });
      if (currentProject?.id === project.id) {
        await loadProject(project.id);
      }
      await loadProjects();
      showProjectActionResult('success', isZh ? '已绑定当前 Code 工作区' : 'Current Code workspace linked');
    } catch (error: any) {
      console.error(error);
      showProjectActionResult('error', error?.message || (isZh ? '绑定当前工作区失败' : 'Failed to link current workspace'));
    }
  };

  const handleChooseWorkspaceFolder = async (project: Project) => {
    try {
      const selected = await (window as any).electronAPI?.selectDirectory?.();
      if (!selected || typeof selected !== 'string') return;
      await updateProject(project.id, { workspace_path: selected });
      if (currentProject?.id === project.id) {
        await loadProject(project.id);
      }
      await loadProjects();
      showProjectActionResult('success', isZh ? '已更新项目工作目录' : 'Project workspace updated');
    } catch (error: any) {
      console.error(error);
      showProjectActionResult('error', error?.message || (isZh ? '选择项目目录失败' : 'Failed to update workspace'));
    }
  };

  const handleDeriveToLocalCode = (project: Project) => {
    if (!project.workspace_path) {
      showProjectActionResult('error', isZh ? '这个项目还没有工作目录' : 'This project does not have a workspace path yet');
      return;
    }
    setCodeWorkspacePath(project.workspace_path);
    navigate('/code');
  };

  const handleDeriveProjectWorktree = async (project: Project) => {
    try {
      setDerivingProjectId(project.id);
      const result = await deriveProjectWorkspace(project.id);
      setCodeWorkspacePath(result.path);
      showProjectActionResult(
        'success',
        result.actual_mode === 'git_worktree'
          ? (isZh ? `已创建新工作树：${result.branch_name}` : `New worktree created: ${result.branch_name}`)
          : (isZh ? '当前目录不是 Git 仓库，已派生为新的本地工作区副本' : 'This folder is not a Git repo, so a copied workspace was created instead'),
      );
      navigate('/code');
    } catch (error: any) {
      console.error(error);
      showProjectActionResult('error', error?.message || (isZh ? '派生新工作树失败' : 'Failed to derive a new worktree'));
    } finally {
      setDerivingProjectId(null);
    }
  };

  const handleOpenProjectChat = async (project: Project) => {
    try {
      const conv = await createProjectConversation(project.id, `${project.name} chat`, currentModelString);
      navigate(`/chat/${conv.id}`);
      setActiveMenu(null);
      setShowMenu(false);
    } catch (error) {
      console.error(error);
      showProjectActionResult('error', isZh ? '创建项目聊天失败' : 'Failed to create project chat');
    }
  };

  const handleCopyConversationId = async (conversationId: string) => {
    const ok = await copyToClipboard(conversationId);
    showProjectActionResult(ok ? 'success' : 'error', ok ? (isZh ? '已复制会话 ID' : 'Conversation ID copied') : (isZh ? '复制会话 ID 失败' : 'Failed to copy conversation ID'));
  };

  const handleCopyConversationDeeplink = async (conversationId: string) => {
    const base = window.location.href.split('#')[0];
    const ok = await copyToClipboard(`${base}#/chat/${conversationId}`);
    showProjectActionResult(ok ? 'success' : 'error', ok ? (isZh ? '已复制聊天 Deeplink' : 'Chat deeplink copied') : (isZh ? '复制聊天 Deeplink 失败' : 'Failed to copy chat deeplink'));
  };

  const handleOpenConversationWorkspace = (conversation: any) => {
    if (!conversation?.workspace_path) {
      showProjectActionResult('error', isZh ? '这个聊天还没有工作区目录' : 'This chat does not have a workspace path');
      return;
    }
    setCodeWorkspacePath(conversation.workspace_path);
    navigate('/code');
  };

  const handleDetachConversationFromProject = async (conversationId: string) => {
    if (!currentProject) return;
    try {
      await updateConversation(conversationId, { project_id: null });
      await loadProject(currentProject.id);
      await loadProjects();
      setConversationActionMenuId(null);
      showProjectActionResult('success', isZh ? '已移出项目聊天分组' : 'Conversation removed from project');
    } catch (error: any) {
      console.error(error);
      showProjectActionResult('error', error?.message || (isZh ? '移出项目失败' : 'Failed to remove conversation from project'));
    }
  };

  // ═══ Project Detail View ═══
  if (currentProject) {
    return (
      <div className="flex-1 h-full bg-claude-bg overflow-y-auto">
        <div className="max-w-[800px] mx-auto px-8 py-12">
          <div className="mb-4">
            <button
              onClick={() => { setCurrentProject(null); loadProjects(); navigate('/projects'); }}
              className="flex items-center gap-1.5 text-[14px] text-claude-textSecondary hover:text-claude-text transition-colors font-medium -ml-1"
            >
              <ArrowLeft size={16} />
              All projects
            </button>
          </div>

          {projectActionMessage && (
            <div className={`mb-5 rounded-xl border px-4 py-3 text-[13px] ${
              projectActionMessage.tone === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                : 'border-[#C6613F]/35 bg-[#C6613F]/10 text-[#E8B09B]'
            }`}>
              {projectActionMessage.text}
            </div>
          )}

          <div className="flex items-start justify-between mb-8 gap-4">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameSave(); if (e.key === 'Escape') setEditingName(false); }}
                    className="font-[Spectral] text-[32px] text-claude-text bg-transparent border-b-2 border-claude-accent outline-none w-full"
                    style={{ fontWeight: 500 }}
                  />
                </div>
              ) : (
                <h1
                  className="font-[Spectral] text-[32px] text-claude-text leading-tight mb-2"
                  style={{ fontWeight: 500 }}
                >
                  {currentProject.name}
                </h1>
              )}
              {currentProject.description && (
                <p className="text-[15.5px] text-claude-textSecondary">{currentProject.description}</p>
              )}
            </div>
            <div className="relative flex items-center gap-1 text-claude-textSecondary mt-2 flex-shrink-0">
              <button
                onClick={() => setShowMenu((prev) => !prev)}
                className="p-1 hover:text-claude-text hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
              >
                <MoreVertical size={18} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 z-50 w-[240px] rounded-[16px] border border-gray-200 bg-white py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.15)] dark:border-[#65645F] dark:bg-[#30302E]">
                    <button
                      onClick={() => { setShowMenu(false); handleOpenProjectChat(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <MessageSquare size={16} className="text-claude-textSecondary" />
                      {isZh ? '新建项目聊天' : 'New project chat'}
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); handleOpenProjectFolder(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <FolderOpen size={16} className="text-claude-textSecondary" />
                      {isZh ? '在资源管理器中打开' : 'Open in Explorer'}
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); handleCopyProjectWorkspace(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Copy size={16} className="text-claude-textSecondary" />
                      {isZh ? '复制工作目录' : 'Copy workspace path'}
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); handleCopyProjectDeeplink(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Link2 size={16} className="text-claude-textSecondary" />
                      {isZh ? '复制 Deeplink' : 'Copy deeplink'}
                    </button>
                    <div className="my-1.5 border-t border-claude-border opacity-50" />
                    <button
                      onClick={() => { setShowMenu(false); handleDeriveToLocalCode(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <ChevronRight size={16} className="text-claude-textSecondary" />
                      {isZh ? '派生到本地 Code' : 'Derive to local Code'}
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); handleDeriveProjectWorktree(currentProject); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <GitBranch size={16} className="text-claude-textSecondary" />
                      {isZh ? '派生到新工作树' : 'Derive to new worktree'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] border border-claude-border bg-transparent px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary">{isZh ? '项目文档' : 'Project doc'}</div>
                <button
                  onClick={() => {
                    hydrateProjectDocEditor(currentProject);
                    setEditingInstructions(true);
                  }}
                  className="rounded-lg border border-claude-border px-2.5 py-1 text-[11px] text-claude-text transition-colors hover:bg-claude-hover"
                >
                  {isZh ? '编辑文档' : 'Edit doc'}
                </button>
              </div>
                  {projectDocSections.length > 0 ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-[14px] border border-claude-border px-3 py-3 text-[14px] leading-7 text-claude-textSecondary">
                    {currentProjectDoc.overview || currentProject.description || projectDocSections[0]?.value}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {projectDocSections.filter((section) => section.key !== 'overview').slice(0, 4).map((section) => (
                      <div key={section.key} className="rounded-[12px] border border-claude-border px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-claude-textSecondary">{section.label}</div>
                        <div className="mt-1 line-clamp-3 text-[13px] leading-6 text-claude-text">{section.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[14px] leading-7 text-claude-textSecondary">
                  {isZh ? '这里还没有项目文档。补充项目目标、约束和常用命令后，这个项目会更像一个长期上下文容器。' : 'This project does not have a document yet. Add goals, constraints, and common commands to turn it into a durable context hub.'}
                </div>
              )}
            </div>
            {false && <div className="rounded-[16px] border border-claude-border bg-transparent px-4 py-4">
              <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary">{isZh ? '项目文档' : 'Project doc'}</div>
              <div className="mt-2 text-[14px] leading-7 text-claude-textSecondary">
                {currentProject.instructions || currentProject.description || (isZh ? '这里还没有项目文档。补充项目目标、约束和常用命令后，这个项目会更像一个长期上下文容器。' : 'This project does not have a document yet. Add goals, constraints, and common commands to turn it into a durable context hub.')}
              </div>
            </div>}
            <div className="rounded-[16px] border border-claude-border bg-transparent px-4 py-4">
              <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary">{isZh ? '项目工作区' : 'Project workspace'}</div>
              <div className="mt-2 break-all text-[13px] leading-6 text-claude-text">
                {currentProject.workspace_path || (isZh ? '还没有绑定工作目录' : 'No workspace linked yet')}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <button onClick={() => handleBindCurrentWorkspace(currentProject)} className="rounded-lg border border-claude-border px-3 py-1.5 text-claude-text transition-colors hover:bg-claude-hover">
                  {isZh ? '绑定当前 Code 工作区' : 'Bind current Code workspace'}
                </button>
                <button onClick={() => handleChooseWorkspaceFolder(currentProject)} className="rounded-lg border border-claude-border px-3 py-1.5 text-claude-text transition-colors hover:bg-claude-hover">
                  {isZh ? '选择目录' : 'Choose folder'}
                </button>
                <button onClick={() => handleDeriveToLocalCode(currentProject)} className="rounded-lg border border-claude-border px-3 py-1.5 text-claude-text transition-colors hover:bg-claude-hover">
                  {isZh ? '派生到本地 Code' : 'Derive to Code'}
                </button>
                <button
                  onClick={() => handleDeriveProjectWorktree(currentProject)}
                  disabled={derivingProjectId === currentProject.id}
                  className="rounded-lg border border-claude-border px-3 py-1.5 text-claude-text transition-colors hover:bg-claude-hover disabled:opacity-50"
                >
                  {derivingProjectId === currentProject.id ? (isZh ? '派生中...' : 'Deriving...') : (isZh ? '派生到新工作树' : 'New worktree')}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Chat Input Container — matches MainContent new chat input */}
            <div
              className="bg-claude-input border border-claude-border dark:border-[#3a3a38] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-[#CCC] dark:hover:border-[#5a5a58] focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.08)] focus-within:border-[#CCC] dark:focus-within:border-[#5a5a58] transition-all duration-200 flex flex-col max-h-[60vh] font-sans rounded-2xl"
            >
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    className="w-full pl-5 pr-4 pt-5 pb-1 placeholder:text-claude-textSecondary text-[16px] outline-none resize-none overflow-hidden bg-transparent font-sans font-[350] text-claude-text"
                    style={{ minHeight: '48px', borderRadius: '16px 16px 0 0' }}
                    placeholder={selectedSkill ? `Describe what you want ${selectedSkill.name} to do...` : "How can I help you today?"}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                      e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden';
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && selectedSkill) {
                        const pos = (e.target as HTMLTextAreaElement).selectionStart;
                        const prefix = `/${selectedSkill.slug} `;
                        if (pos > 0 && pos <= prefix.length && message.startsWith(prefix.slice(0, pos))) {
                          e.preventDefault();
                          setMessage(message.slice(prefix.length));
                          setSelectedSkill(null);
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                  />
                </div>
              </div>
              <div className="px-4 pb-3 pt-1 flex items-center justify-between flex-shrink-0">
                <div className="relative flex items-center">
                  <button
                    ref={plusBtnRef}
                    onClick={() => setShowPlusMenu(prev => !prev)}
                    className="p-2 text-claude-textSecondary hover:text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
                  >
                    <IconPlus size={20} />
                  </button>
                  {showPlusMenu && (
                    <div ref={plusMenuRef} className="absolute bottom-full left-0 mb-2 w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50">
                      <button onClick={() => { setShowPlusMenu(false); fileInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors">
                        <Paperclip size={16} className="text-claude-textSecondary" />
                        {isZh ? '添加文件或图片' : 'Add files or photos'}
                      </button>
                      <div className="relative">
                        <button onMouseEnter={() => setShowSkillsSubmenu(true)} onClick={() => setShowSkillsSubmenu(p => !p)} className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-claude-text hover:bg-claude-hover transition-colors">
                          <div className="flex items-center gap-3"><FileText size={16} className="text-claude-textSecondary" />{isZh ? '技能' : 'Skills'}</div>
                          <ChevronDown size={14} className="text-claude-textSecondary -rotate-90" />
                        </button>
                        {showSkillsSubmenu && (
                          <div className="absolute left-full bottom-0 ml-1 w-[200px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50 max-h-[300px] overflow-y-auto" onMouseLeave={() => setShowSkillsSubmenu(false)}>
                            {enabledSkills.length > 0 ? enabledSkills.map(skill => (
                              <button key={skill.id} onClick={() => {
                                setShowPlusMenu(false); setShowSkillsSubmenu(false);
                                const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
                                setSelectedSkill({ name: skill.name, slug, description: skill.description });
                                setMessage(prev => prev ? `/${slug} ${prev}` : `/${slug} `);
                                textareaRef.current?.focus();
                              }} className="w-full text-left px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors truncate">{skill.name}</button>
                            )) : <div className="px-4 py-2 text-[12px] text-claude-textSecondary italic">{isZh ? '暂无启用技能' : 'No skills enabled'}</div>}
                            <div className="border-t border-claude-border mt-1 pt-1">
                              <button onClick={() => { setShowPlusMenu(false); window.location.hash = '#/customize'; }} className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover transition-colors"><FileText size={14} />{isZh ? '管理技能' : 'Manage skills'}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <ModelSelector
                    currentModelString={currentModelString}
                    models={selectorModels}
                    onModelChange={handleModelChange}
                    isNewChat={true}
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={!message.trim()}
                    className="p-2 bg-[#C6613F] text-white rounded-lg hover:bg-[#D97757] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={22} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {currentProject.conversations && currentProject.conversations.length > 0 && (
              <div className="mt-2 grid grid-cols-[1.2fr_0.8fr] gap-4">
                <div className="border border-claude-border rounded-[16px] overflow-hidden bg-transparent">
                  <div className="px-5 py-3 text-[13px] font-medium text-claude-textSecondary border-b border-claude-border">
                    {isZh ? `项目聊天 ${currentProject.conversations.length}` : `${currentProject.conversations.length} project conversations`}
                  </div>
                  <div className="divide-y divide-claude-border">
                    {groupedProjectConversations.map((group) => (
                      <div key={group.key} className="px-4 py-3">
                        <div className="px-1 pb-2 text-[11px] uppercase tracking-[0.08em] text-claude-textSecondary">
                          {group.label}
                        </div>
                        <div className="space-y-2">
                          {group.items.map((conv: any) => (
                            <div key={conv.id} className="group rounded-[12px] border border-transparent px-3 py-3 transition-colors hover:border-claude-border hover:bg-claude-hover">
                              <div className="flex items-start gap-3">
                                <button onClick={() => navigate(`/chat/${conv.id}`)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                  <MessageSquare size={16} className="mt-0.5 flex-shrink-0 text-claude-textSecondary" />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[14px] text-claude-text">{conv.title}</div>
                                    <div className="mt-1 text-[12px] text-claude-textSecondary">{formatConversationTime(conv.created_at)}</div>
                                  </div>
                                </button>
                                <div className="relative flex items-center gap-1">
                                  <button onClick={() => setConversationActionMenuId((prev) => prev === conv.id ? null : conv.id)} className="rounded-md p-1 text-claude-textSecondary transition-colors hover:bg-black/5 hover:text-claude-text dark:hover:bg-white/5">
                                    <MoreVertical size={14} />
                                  </button>
                                  <button onClick={(e) => handleDeleteConversation(conv.id, e)} className="rounded-md p-1 text-claude-textSecondary opacity-0 transition-all hover:text-red-500 group-hover:opacity-100" title={isZh ? '删除对话' : 'Delete conversation'}>
                                    <Trash size={14} />
                                  </button>
                                  {conversationActionMenuId === conv.id && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setConversationActionMenuId(null)} />
                                      <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-[14px] border border-gray-200 bg-white py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.15)] dark:border-[#65645F] dark:bg-[#30302E]">
                                        <button onClick={() => { setConversationActionMenuId(null); navigate(`/chat/${conv.id}`); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                          <MessageSquare size={15} className="text-claude-textSecondary" />
                                          {isZh ? '打开聊天' : 'Open chat'}
                                        </button>
                                        <button onClick={() => { setConversationActionMenuId(null); handleOpenConversationWorkspace(conv); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                          <ChevronRight size={15} className="text-claude-textSecondary" />
                                          {isZh ? '派生到本地 Code' : 'Derive to local Code'}
                                        </button>
                                        <button onClick={() => { setConversationActionMenuId(null); handleCopyConversationId(conv.id); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                          <Copy size={15} className="text-claude-textSecondary" />
                                          {isZh ? '复制会话 ID' : 'Copy conversation ID'}
                                        </button>
                                        <button onClick={() => { setConversationActionMenuId(null); handleCopyConversationDeeplink(conv.id); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                          <Link2 size={15} className="text-claude-textSecondary" />
                                          {isZh ? '复制 Deeplink' : 'Copy deeplink'}
                                        </button>
                                        <div className="my-1.5 border-t border-claude-border opacity-50" />
                                        <button onClick={() => handleDetachConversationFromProject(conv.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[#C6613F] transition-colors hover:bg-[#C6613F]/10">
                                          <Archive size={15} className="text-[#C6613F]" />
                                          {isZh ? '移出项目' : 'Remove from project'}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[16px] border border-claude-border bg-transparent px-4 py-4">
                  <div className="text-[13px] font-medium text-claude-textSecondary">{isZh ? '项目时间线' : 'Project timeline'}</div>
                  <div className="mt-3 space-y-3">
                    {groupedProjectTimeline.map((group) => (
                      <div key={group.label} className="rounded-[12px] border border-claude-border px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-claude-textSecondary">{group.label}</div>
                        <div className="mt-3 space-y-0">
                          {group.items.map((item, index) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (item.type === 'chat' && item.id.startsWith('conv-')) {
                                  navigate(`/chat/${item.id.replace('conv-', '')}`);
                                }
                              }}
                              className="flex w-full items-start gap-3 text-left"
                            >
                              <div className="flex w-6 flex-col items-center pt-0.5">
                                <span className={`h-2.5 w-2.5 rounded-full ${
                                  item.type === 'chat'
                                    ? 'bg-[#C98B6E]'
                                    : item.type === 'github'
                                      ? 'bg-[#6E8BC9]'
                                      : item.type === 'file'
                                        ? 'bg-emerald-400'
                                        : 'bg-claude-textSecondary'
                                }`} />
                                {index < group.items.length - 1 && (
                                  <span className="mt-1 min-h-[24px] w-px flex-1 bg-claude-border" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 pb-4">
                                <div className="text-[13px] font-medium text-claude-text">{item.title}</div>
                                <div className="mt-1 text-[12px] leading-6 text-claude-textSecondary">{item.detail}</div>
                                <div className="mt-2 text-[11px] text-claude-textSecondary">{formatConversationTime(item.at)}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {false && <div className="rounded-[16px] border border-claude-border bg-transparent px-4 py-4">
                  <div className="text-[13px] font-medium text-claude-textSecondary">{isZh ? '最近活动' : 'Recent activity'}</div>
                  <div className="mt-3 space-y-3">
                    {projectActivityItems.map((item) => (
                      <div key={item.id} className="rounded-[12px] border border-claude-border px-3 py-3">
                        <div className="text-[13px] font-medium text-claude-text">{item.title}</div>
                        <div className="mt-1 text-[12px] text-claude-textSecondary">{item.detail}</div>
                        <div className="mt-2 text-[11px] text-claude-textSecondary">{formatConversationTime(item.at)}</div>
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
            )}

            {/* Conversation List / Banner */}
            {false && currentProject.conversations && currentProject.conversations.length > 0 ? (
              <div className="border border-claude-border rounded-[16px] overflow-hidden bg-transparent mt-2">
                <div className="px-5 py-3 text-[13px] font-medium text-claude-textSecondary border-b border-claude-border">
                  {currentProject.conversations.length} conversation{currentProject.conversations.length > 1 ? 's' : ''}
                </div>
                {currentProject.conversations.map((conv: any) => (
                  <div
                    key={conv.id}
                    onClick={() => navigate(`/chat/${conv.id}`)}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-claude-hover cursor-pointer border-b border-claude-border last:border-b-0 transition-colors group"
                  >
                    <MessageSquare size={16} className="text-claude-textSecondary flex-shrink-0" />
                    <span className="text-[14px] text-claude-text truncate">{conv.title}</span>
                    <span className="text-[12px] text-claude-textSecondary ml-auto flex-shrink-0">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="p-1 text-claude-textSecondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title={isZh ? '删除对话' : 'Delete conversation'}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full border border-claude-border rounded-[16px] px-6 py-10 flex items-center justify-center bg-transparent mt-2">
                <span className="text-[14.5px] text-[#A1A1AA]">
                  {isZh ? '先开始一段对话，后续就能在这个项目里复用上下文和资料。' : 'Start a chat to keep conversations organized and re-use project knowledge.'}
                </span>
              </div>
            )}

            {/* Instructions and Files */}
            <div className="w-full border border-claude-border rounded-[16px] overflow-hidden bg-transparent mt-2">
              {/* Instructions Header */}
              <div
                className="p-5 border-b border-claude-border hover:bg-black/[0.015] dark:hover:bg-white/[0.015] transition-colors cursor-pointer group"
                onClick={() => {
                  if (!editingInstructions) {
                    hydrateProjectDocEditor(currentProject);
                    setEditingInstructions(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-claude-text mb-0.5" style={{ fontSize: '15.5px' }}>{isZh ? '项目说明' : 'Instructions'}</h3>
                    {!editingInstructions && (
                      <p className="text-[13px] text-[#A1A1AA]">
                        {currentProject.instructions
                          ? currentProject.instructions.slice(0, 200) + (currentProject.instructions.length > 200 ? '...' : '')
                          : (isZh ? '添加项目说明，让回复更贴合这个项目。' : "Add instructions to tailor Claude's responses")}
                      </p>
                    )}
                  </div>
                  {!editingInstructions && (
                    <button className="text-[#A1A1AA] hover:text-claude-text transition-colors">
                      {currentProject.instructions ? <Pencil size={18} strokeWidth={1.5} /> : <Plus size={22} strokeWidth={1.5} />}
                    </button>
                  )}
                </div>
                {editingInstructions && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => {
                      setEditingInstructions(false);
                      hydrateProjectDocEditor(currentProject);
                    }}
                  >
                    <div
                      className="w-full max-w-[920px] bg-white dark:bg-[#2A2928] border border-claude-border rounded-[20px] shadow-2xl p-7"
                      onClick={e => e.stopPropagation()}
                    >
                      <h2 className="text-[20px] font-bold text-claude-text mb-2">{isZh ? '设置项目文档' : 'Set project document'}</h2>
                      <p className="text-[14px] text-[#A1A1AA] mb-5">
                        {isZh
                          ? <>给 {currentProject.name} 这个项目补充概览、目标、技术栈、约束和常用命令。它会成为项目聊天、项目卡片和后续协作入口共用的长期上下文。</>
                          : <>Add a durable project brief for {currentProject.name}, including goals, stack, constraints, and common commands.</>}
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '项目概览' : 'Overview'}</label>
                          <textarea
                            autoFocus
                            value={projectDocDraft.overview}
                            onChange={e => updateProjectDocField('overview', e.target.value)}
                            placeholder={isZh ? '这个项目是做什么的，当前阶段在推进什么。' : 'What this project is for and what is being worked on right now.'}
                            className="h-[96px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '项目目标' : 'Goals'}</label>
                          <textarea
                            value={projectDocDraft.goals}
                            onChange={e => updateProjectDocField('goals', e.target.value)}
                            placeholder={isZh ? '例如：补齐 P1、修复预览稳定性、准备下一版发版。' : 'Example: finish P1, harden preview stability, prepare the next release.'}
                            className="h-[112px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '技术栈 / 运行方式' : 'Tech stack / runtime'}</label>
                          <textarea
                            value={projectDocDraft.stack}
                            onChange={e => updateProjectDocField('stack', e.target.value)}
                            placeholder={isZh ? '例如：Electron + React + Vite，主仓库路径、打包命令、发布方式。' : 'Example: Electron + React + Vite, repo path, build command, release flow.'}
                            className="h-[112px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '约束 / 原则' : 'Constraints / principles'}</label>
                          <textarea
                            value={projectDocDraft.constraints}
                            onChange={e => updateProjectDocField('constraints', e.target.value)}
                            placeholder={isZh ? '例如：P0 + P1 一起推进，按整块迁移做，优先中文桌面体验。' : 'Example: ship P0 + P1 together, migrate in full slices, prioritize the Chinese desktop UX.'}
                            className="h-[112px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '常用命令' : 'Common commands'}</label>
                          <textarea
                            value={projectDocDraft.commands}
                            onChange={e => updateProjectDocField('commands', e.target.value)}
                            placeholder={isZh ? '一行一个，例如：npm run build' : 'One per line, for example: npm run build'}
                            className="h-[132px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 font-mono text-[13px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[13px] font-medium text-claude-textSecondary">{isZh ? '补充备注' : 'Notes'}</label>
                          <textarea
                            value={projectDocDraft.notes}
                            onChange={e => updateProjectDocField('notes', e.target.value)}
                            placeholder={isZh ? '补充风险、版本目标、引用仓库等额外信息。' : 'Extra context such as risks, release targets, or linked repositories.'}
                            className="h-[132px] w-full rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-[14px] text-claude-text outline-none transition-colors focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA]"
                          />
                        </div>
                      </div>

                      <div className="mt-5 rounded-[14px] border border-claude-border bg-claude-bg px-4 py-4">
                        <div className="text-[12px] uppercase tracking-[0.08em] text-claude-textSecondary">{isZh ? '生成的项目指令预览' : 'Generated instruction preview'}</div>
                        <pre className="mt-3 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-claude-textSecondary">
                          {instructionsText || (isZh ? '补充上面的字段后，这里会生成可复用的项目文档。' : 'Fill the fields above to generate the reusable project brief.')}
                        </pre>
                      </div>

                      <div className="flex justify-end gap-3 mt-5">
                        <button
                          onClick={() => {
                            setEditingInstructions(false);
                            hydrateProjectDocEditor(currentProject);
                          }}
                          className="px-4 py-2 text-[14px] font-medium text-claude-text hover:bg-white/5 border border-transparent hover:border-claude-border rounded-xl transition-all"
                        >
                          {isZh ? '取消' : 'Cancel'}
                        </button>
                        <button
                          onClick={handleSaveInstructions}
                          className="px-4 py-2 text-[14px] font-medium bg-[#E6E6E6] text-[#222] rounded-xl hover:opacity-90 transition-opacity"
                        >
                          {isZh ? '保存项目文档' : 'Save project doc'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {false && editingInstructions && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => { setEditingInstructions(false); setInstructionsText(currentProject.instructions || ''); }}
                  >
                    <div
                      className="w-full max-w-[800px] bg-white dark:bg-[#2A2928] border border-claude-border rounded-[20px] shadow-2xl p-7"
                      onClick={e => e.stopPropagation()}
                    >
                      <h2 className="text-[20px] font-bold text-claude-text mb-2">{isZh ? '设置项目说明' : 'Set project instructions'}</h2>
                      <p className="text-[14px] text-[#A1A1AA] mb-5">
                        {isZh
                          ? <>给 {currentProject.name} 这个项目补充背景、要求和约束。它会和<span className="underline decoration-[#555] underline-offset-2 cursor-pointer hover:text-claude-text">用户偏好</span>、对话风格一起生效。</>
                          : <>Provide Claude with relevant instructions and information for chats within {currentProject.name}. This will work alongside <span className="underline decoration-[#555] underline-offset-2 cursor-pointer hover:text-claude-text">user preferences</span> and the selected style in a chat.</>}
                      </p>

                      <textarea
                        autoFocus
                        value={instructionsText}
                        onChange={e => setInstructionsText(e.target.value)}
                        placeholder={isZh ? '例如：先拆解复杂任务；遇到不清楚的需求先追问；回复尽量简洁。' : 'Break down large tasks and ask clarifying questions when needed.'}
                        className="w-full h-[400px] px-4 py-3 bg-claude-bg dark:bg-[#202020] border border-claude-border rounded-[12px] text-[15px] text-claude-text resize-none outline-none focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA] transition-colors"
                      />

                      <div className="flex justify-end gap-3 mt-5">
                        <button
                          onClick={() => { setEditingInstructions(false); setInstructionsText(currentProject.instructions || ''); }}
                          className="px-4 py-2 text-[14px] font-medium text-claude-text hover:bg-white/5 border border-transparent hover:border-claude-border rounded-xl transition-all"
                        >
                          {isZh ? '取消' : 'Cancel'}
                        </button>
                        <button
                          onClick={handleSaveInstructions}
                          className="px-4 py-2 text-[14px] font-medium bg-[#E6E6E6] text-[#222] rounded-xl hover:opacity-90 transition-opacity"
                        >
                          {isZh ? '保存说明' : 'Save instructions'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Files */}
              <div className="p-5 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-claude-text" style={{ fontSize: '15.5px' }}>
                    Files {currentProject.files?.length > 0 && <span className="text-claude-textSecondary text-[13px] ml-1">({currentProject.files.length})</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingGithubSource(null); setShowGithubModal(true); }}
                      className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] font-medium text-claude-text border border-claude-border rounded-lg hover:bg-claude-hover transition-colors"
                    >
                      <Github size={14} />
                      从 GitHub 添加
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[#A1A1AA] hover:text-claude-text transition-colors"
                    >
                      <Plus size={22} strokeWidth={1.5} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }}
                    />
                  </div>
                </div>

                {uploading && (
                  <div className="text-[13px] text-claude-textSecondary animate-pulse mb-3">Uploading...</div>
                )}

                {githubError && (
                  <div className="text-[13px] text-red-500 mb-3">{githubError}</div>
                )}

                {currentProject.github_sources?.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {currentProject.github_sources.map((source: ProjectGithubSource) => (
                      <div
                        key={source.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-[12px] bg-[#F7F7F5] dark:bg-white/[0.03] border border-claude-border"
                      >
                        <div className="w-9 h-9 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center flex-shrink-0">
                          <Github size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] text-claude-text font-medium truncate">{source.repo_full_name}</div>
                          <div className="text-[11.5px] text-[#A1A1AA]">
                            {source.file_count} 个文件 · 引用 {source.ref} · 同步于 {new Date(source.last_synced_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => { setEditingGithubSource(source); setShowGithubModal(true); }}
                          disabled={syncingSourceId === source.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-claude-text border border-claude-border rounded-lg hover:bg-claude-hover transition-colors disabled:opacity-50"
                          title="配置 GitHub 来源"
                        >
                          <Pencil size={13} />
                          配置
                        </button>
                        <button
                          onClick={() => handleSyncGithubSource(source)}
                          disabled={syncingSourceId === source.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-claude-text border border-claude-border rounded-lg hover:bg-claude-hover transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={13} className={syncingSourceId === source.id ? 'animate-spin' : ''} />
                          同步
                        </button>
                        <button
                          onClick={() => handleRemoveGithubSource(source)}
                          disabled={syncingSourceId === source.id}
                          className="p-1 text-[#A1A1AA] hover:text-red-500 transition-colors disabled:opacity-50"
                          title="移除 GitHub 来源"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {currentProject.files && currentProject.files.length > 0 ? (
                  <div className="space-y-2">
                    {currentProject.files.map((f: ProjectFile) => (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[12px] bg-black/[0.02] dark:bg-white/[0.03] group border border-transparent hover:border-claude-border transition-all">
                        <FileText size={16} className="text-[#A1A1AA] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] text-claude-text truncate font-medium">{f.file_name}</div>
                          <div className="text-[11.5px] text-[#A1A1AA] flex items-center gap-2 flex-wrap">
                            {f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${(f.file_size / 1024).toFixed(1)} KB`}
                            {f.source_type === 'github' && (
                              <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[11px] text-claude-textSecondary">
                                GitHub
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(f.id)}
                          className="p-1 text-[#A1A1AA] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="w-full bg-[#FAFAFA] dark:bg-[#191919] rounded-[16px] flex flex-col items-center justify-center py-8 border border-transparent dark:border-white/[0.04] cursor-pointer hover:bg-[#F3F3F3] dark:hover:bg-[#222222] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files); }}
                  >
                    <div className="flex items-center justify-center mb-3">
                      <div className="w-[84px] h-[48px] relative opacity-60 mix-blend-luminosity grayscale">
                        <div className="absolute right-[4px] bottom-0 w-[28px] h-[36px] bg-[#3B3B3B] border border-[#555] rounded-[4px] flex flex-col items-center py-1.5 px-1 gap-[3px] shadow-sm transform translate-x-2 translate-y-2 -rotate-12 z-0">
                          <div className="w-full h-[1.5px] bg-[#666] rounded-full mx-1"></div>
                          <div className="w-3/4 h-[1.5px] bg-[#666] rounded-full mx-1 self-start"></div>
                        </div>
                        <div className="absolute left-[4px] bottom-0 w-[28px] h-[36px] bg-[#3B3B3B] border border-[#555] rounded-[4px] flex flex-col items-center py-1.5 px-1 gap-[3px] shadow-sm transform -translate-x-2 translate-y-1 rotate-12 z-0">
                          <div className="w-full h-[1.5px] bg-[#666] rounded-full mx-1"></div>
                          <div className="w-full h-[1.5px] bg-[#666] rounded-full mx-1"></div>
                          <div className="w-1/2 h-[1.5px] bg-[#666] rounded-full mx-1 self-start"></div>
                        </div>
                        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[34px] h-[42px] bg-[#444] border border-[#666] rounded-[6px] shadow-md flex flex-col items-center py-2 px-1.5 gap-[4px] z-10">
                          <div className="w-[12px] h-[12px] bg-[#555] rounded-sm flex items-center justify-center self-end mb-0.5"><Plus size={8} className="text-white" /></div>
                          <div className="w-full h-[2px] bg-[#888] rounded-full mx-1"></div>
                          <div className="w-full h-[2px] bg-[#888] rounded-full mx-1"></div>
                          <div className="w-2/3 h-[2px] bg-[#888] rounded-full mx-1 self-start"></div>
                        </div>
                      </div>
                    </div>
                    <span className="text-[13px] text-[#A1A1AA] text-center max-w-[200px] leading-relaxed">
                      添加 PDF、文档或其他文本文件，让这个项目在后续对话里持续引用。
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingGithubSource(null); setShowGithubModal(true); }}
                      className="mt-4 flex items-center gap-2 px-3 py-1.5 text-[12.5px] font-medium text-claude-text border border-claude-border rounded-lg hover:bg-claude-hover transition-colors"
                    >
                      <Github size={14} />
                      或从 GitHub 导入
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <AddFromGithubModal
            isOpen={showGithubModal}
            onClose={handleGithubModalClose}
            onConfirm={editingGithubSource ? handleProjectGithubUpdate : handleProjectGithubImport}
            initialPayload={editingGithubSource ? {
              repoFullName: editingGithubSource.repo_full_name,
              ref: editingGithubSource.ref,
              selections: editingGithubSource.selections || [],
            } : null}
            title={editingGithubSource ? '配置 GitHub 来源' : '从 GitHub 导入项目文件'}
            description={editingGithubSource ? '调整这个 GitHub 来源的分支和文件范围，然后重新同步到项目。' : '选择一个 GitHub 仓库，把需要的文件或文件夹导入到当前项目。'}
            confirmLabel={editingGithubSource ? '保存配置' : '导入到项目'}
          />
        </div>
      </div>
    );
  }

  // ═══ Create View ═══
  if (isCreating) {
    return (
      <div className="flex-1 h-full bg-claude-bg overflow-y-auto">
        <div className="max-w-[560px] mx-auto px-8 pt-12 pb-8">
          <h1 className="font-[Spectral] text-[32px] text-claude-text mb-6" style={{ fontWeight: 600 }}>
            Create a personal project
          </h1>

          <div className="bg-[#EFEEE7] dark:bg-[#2A2928] rounded-2xl p-6 mb-6 border border-transparent dark:border-white/5">
            <h3 className="font-semibold text-claude-text text-[15.5px] mb-2 text-[#403A35] dark:text-[#E3E0D8]">How to use projects</h3>
            <p className="text-[14.5px] leading-relaxed text-[#564E48] dark:text-[#A8A096] mb-3">
              Projects help organize your work and leverage knowledge across multiple conversations. Upload docs, code, and files to create themed collections that Claude can reference again and again.
            </p>
            <p className="text-[14.5px] leading-relaxed text-[#564E48] dark:text-[#A8A096]">
              Start by creating a memorable title and description to organize your project. You can always edit it later.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-[15px] font-medium text-claude-textSecondary mb-2">What are you working on?</label>
              <input
                type="text"
                placeholder="Name your project"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && projectName.trim()) handleCreate(); }}
                className="w-full px-4 py-3 bg-white dark:bg-claude-input border border-gray-200 dark:border-claude-border rounded-xl text-claude-text placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#387ee0] focus:ring-0 transition-all text-[15px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-medium text-claude-textSecondary mb-2">What are you trying to achieve?</label>
              <textarea
                placeholder="Describe your project, goals, subject, etc..."
                rows={3}
                value={projectDescription}
                onChange={e => setProjectDescription(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-claude-input border border-gray-200 dark:border-claude-border rounded-xl text-claude-text placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#387ee0] focus:ring-0 transition-all text-[15px] resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              onClick={() => { setIsCreating(false); setProjectName(''); setProjectDescription(''); }}
              className="px-5 py-2.5 text-[15px] font-medium text-claude-text bg-white dark:bg-claude-bg border border-gray-300 dark:border-claude-border hover:bg-gray-50 dark:hover:bg-claude-hover rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!projectName.trim()}
              className="px-5 py-2.5 text-[15px] font-medium text-claude-bg bg-black dark:bg-white dark:text-black hover:opacity-90 rounded-xl transition-opacity disabled:opacity-40"
            >
              Create project
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ Projects List View ═══
  return (
    <div className="flex-1 h-full bg-claude-bg overflow-y-auto">
      <div className="max-w-[800px] mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-[Spectral] text-[32px] text-claude-text" style={{ fontWeight: 500 }}>Projects</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-claude-text text-claude-bg hover:opacity-90 rounded-lg transition-opacity font-medium"
            style={{ fontSize: '14px' }}
          >
            <Plus size={16} strokeWidth={2.5} />
            New project
          </button>
        </div>

        {projects.length > 0 && (
          <>
            <div className="relative mb-6">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-claude-textSecondary opacity-80" />
              </div>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-claude-input border border-gray-200 dark:border-claude-border rounded-xl text-claude-text placeholder-claude-textSecondary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[15px]"
              />
            </div>

            <div className="flex justify-end mb-6">
              <div className="flex items-center gap-3 text-[14.5px] text-[#A1A1AA] relative">
                <span>Sort by</span>
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className={`flex items-center gap-2 text-claude-text border border-[#3A3A3A] hover:border-[#4A4A4A] dark:border-claude-border dark:hover:bg-claude-hover rounded-[10px] px-3.5 py-1.5 transition-colors ${sortMenuOpen ? 'bg-claude-hover' : ''}`}
                >
                  {sortBy === 'activity' ? 'Activity' : sortBy === 'edited' ? 'Last edited' : 'Date created'}
                  <ChevronDown size={14} className="text-claude-textSecondary" />
                </button>
                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1.5 w-[200px] bg-white dark:bg-[#2A2928] border border-gray-200 dark:border-claude-border rounded-[14px] shadow-lg py-1.5 z-50">
                      {[
                        { id: 'activity', label: 'Recent activity' },
                        { id: 'edited', label: 'Last edited' },
                        { id: 'created', label: 'Date created' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setSortBy(opt.id as any);
                            setSortMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-[15px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          {opt.label}
                          {sortBy === opt.id && <Check size={16} className="text-claude-text opacity-80" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {loading ? (
          <div className="text-center text-claude-textSecondary text-[14px] mt-12">Loading...</div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/projects?project=${p.id}`)}
                className="flex flex-col p-5 border border-claude-border rounded-[12px] bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors group min-h-[170px]"
              >
                <div className="flex items-center justify-between mb-2.5 relative">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[15.5px] font-medium text-claude-text truncate">{p.name}</h3>
                  </div>
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === p.id ? null : p.id); }}
                      className={`p-1 text-[#A1A1AA] hover:text-claude-text hover:bg-black/5 dark:hover:bg-white/5 rounded-[6px] transition-all ${activeMenu === p.id ? 'opacity-100 bg-black/5 dark:bg-white/5' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {activeMenu === p.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }} />
                        <div className="absolute top-full right-0 mt-1 w-[240px] bg-white dark:bg-[#30302E] rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-gray-200 dark:border-[#65645F] py-1.5 z-50">
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); navigate(`/projects?project=${p.id}`); }}>
                            <FileText size={16} className="text-claude-textSecondary" />
                            {isZh ? '打开项目' : 'Open project'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); handleOpenProjectChat(p); }}>
                            <MessageSquare size={16} className="text-claude-textSecondary" />
                            {isZh ? '新建项目聊天' : 'New project chat'}
                          </button>
                          <div className="my-1.5 border-t border-claude-border opacity-50" />
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleBindCurrentWorkspace(p); }}>
                            <ChevronRight size={16} className="text-claude-textSecondary" />
                            {isZh ? '绑定当前 Code 工作区' : 'Bind current Code workspace'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleChooseWorkspaceFolder(p); }}>
                            <FolderOpen size={16} className="text-claude-textSecondary" />
                            {isZh ? '选择项目目录' : 'Choose project folder'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeriveToLocalCode(p); }}>
                            <ArrowRight size={16} className="text-claude-textSecondary" />
                            {isZh ? '派生到本地 Code' : 'Derive to local Code'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeriveProjectWorktree(p); }}>
                            <GitBranch size={16} className="text-claude-textSecondary" />
                            {isZh ? '派生到新工作树' : 'Derive to new worktree'}
                          </button>
                          <div className="my-1.5 border-t border-claude-border opacity-50" />
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleOpenProjectFolder(p); }}>
                            <FolderOpen size={16} className="text-claude-textSecondary" />
                            {isZh ? '在资源管理器中打开' : 'Open in Explorer'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleCopyProjectWorkspace(p); }}>
                            <Copy size={16} className="text-claude-textSecondary" />
                            {isZh ? '复制工作目录' : 'Copy workspace path'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleCopyProjectDeeplink(p); }}>
                            <Link2 size={16} className="text-claude-textSecondary" />
                            {isZh ? '复制 Deeplink' : 'Copy deeplink'}
                          </button>
                          <div className="my-1.5 border-t border-claude-border opacity-50" />
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-claude-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); setProjectToEdit(p); setEditDetailsName(p.name); setEditDetailsDesc(p.description || ''); }}>
                            <Pencil size={16} className="text-claude-textSecondary" />
                            {isZh ? '编辑详情' : 'Edit details'}
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#E05A5A] hover:bg-red-500/10 transition-colors text-left" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); setProjectToDelete(p); }}>
                            <Trash size={16} className="text-[#E05A5A]" />
                            {isZh ? '删除' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-[14px] text-claude-textSecondary line-clamp-3 leading-relaxed flex-1">
                  {p.description || "No description provided."}
                </p>

                <div className="mt-4 pt-1 flex items-center gap-4 text-[12px] text-claude-textSecondary/80">
                  <span>Updated {new Date(p.updated_at).toLocaleDateString()}</span>
                  {(p.file_count ?? 0) > 0 && <span>• {p.file_count} files</span>}
                  {(p.chat_count ?? 0) > 0 && <span>• {p.chat_count} chats</span>}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-claude-textSecondary">
                  <span className="rounded-full border border-claude-border px-2 py-1">
                    {p.workspace_path ? (isZh ? '已绑定工作区' : 'Workspace linked') : (isZh ? '未绑定工作区' : 'No workspace')}
                  </span>
                  {(p.github_sources?.length || 0) > 0 && (
                    <span className="rounded-full border border-claude-border px-2 py-1">
                      GitHub {p.github_sources?.length || 0}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center mt-12">
            <img src={startProjectsImg} alt="Start a project" className="w-[100px] h-auto mb-6 dark:invert opacity-90" />
            <h2 className="text-[17px] font-medium text-claude-text mb-3">Looking to start a project?</h2>
            <p className="text-[15px] text-claude-textSecondary text-center max-w-[400px] leading-relaxed mb-6">
              Upload materials, set custom instructions, and organize conversations in one space.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-transparent border border-claude-border hover:bg-claude-hover rounded-xl text-claude-text transition-colors text-[14.5px] font-medium"
            >
              <Plus size={18} strokeWidth={2.5} />
              New project
            </button>
          </div>
        )}
      </div>

      {projectToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-claude-input w-[460px] rounded-[16px] flex flex-col shadow-2xl relative border border-claude-border overflow-hidden">
            <div className="px-6 pt-6 pb-4 text-left">
              <h3 className="text-[19px] font-semibold text-claude-text mb-3">Delete project</h3>
              <p className="text-[15px] text-claude-textSecondary leading-relaxed pr-4">
                确定要删除项目「{projectToDelete.name}」吗？所有关联的文件和对话也会被删除。
              </p>
            </div>
            <div className="px-5 pb-5 pt-2 flex justify-end gap-3 mt-4">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2 text-[14.5px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-[8px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(projectToDelete)}
                className="px-5 py-2 text-[14.5px] font-medium text-white bg-[#E05A5A] hover:bg-[#E86B6B] rounded-[8px] transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {projectToEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-claude-input w-[460px] rounded-[16px] flex flex-col shadow-2xl relative border border-claude-border overflow-hidden">
            <div className="px-6 pt-6 pb-4 text-left">
              <h3 className="text-[19px] font-semibold text-claude-text mb-5">Edit details</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-[14px] text-claude-textSecondary mb-2 font-medium">Name</label>
                  <input
                    type="text"
                    value={editDetailsName}
                    onChange={(e) => setEditDetailsName(e.target.value)}
                    className="w-full px-3 py-2 bg-transparent border border-claude-border rounded-[8px] text-claude-text outline-none focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA] transition-all text-[15px]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[14px] text-claude-textSecondary mb-2 font-medium">Description</label>
                  <textarea
                    value={editDetailsDesc}
                    onChange={(e) => setEditDetailsDesc(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-claude-bg border border-claude-border rounded-[8px] text-claude-text outline-none focus:border-[#3A7ADA] focus:ring-1 focus:ring-[#3A7ADA] transition-all resize-none text-[14.5px] leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 flex justify-end gap-3 mt-4">
              <button
                onClick={() => setProjectToEdit(null)}
                className="px-5 py-2.5 text-[14.5px] font-medium text-claude-text border border-claude-border hover:bg-claude-hover rounded-[8px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditDetails}
                className="px-5 py-2.5 text-[14.5px] font-medium bg-claude-text text-claude-bg hover:opacity-90 rounded-[8px] transition-opacity"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
