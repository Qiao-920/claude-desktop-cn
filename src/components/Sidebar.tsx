import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getStreamingIds } from '../streamingState';
import {
  IconSidebarToggle,
  IconChatBubble,
  IconCode,
  IconPlusCircle,
  IconArtifactsExact,
  IconProjects,
  IconDotsHorizontal,
  IconStarOutline,
  IconPencil,
  IconTrash
} from './Icons';
import claudeImg from '../assets/icons/claude.png';
import searchIconImg from '../assets/icons/search-icon.png';
import customizeIconImg from '../assets/icons/customize-icon.png';
import { NAV_ITEMS } from '../constants';
import { ChevronDown, ChevronRight, ChevronUp, Folder, FolderOpen, MessageSquarePlus, Settings, HelpCircle, LogOut, Shield, CreditCard, Search, Clock3, Bot, Copy } from 'lucide-react';
import { createProjectConversation, getConversations, deleteConversation, updateConversation, updateProject, getUser, getUserUsage, logout, getUserProfile, getCodeSSO, getProjects, Project } from '../api';
import { copyToClipboard } from '../utils/clipboard';

import SearchModal from './SearchModal';

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  refreshTrigger: number;
  onNewChatClick?: () => void;
  onOpenSettings?: () => void;
  onOpenUpgrade?: () => void;
  onCloseOverlays?: () => void;
  tunerConfig?: any;
  setTunerConfig?: (config: any) => void;
}

type SidebarConversation = {
  id: string;
  title?: string;
  created_at?: string;
  project_id?: string;
  project_name?: string | null;
  research_mode?: boolean;
  project_run_kind?: 'general' | 'role_chat' | 'task_execution';
  project_chat_kind?: 'general' | 'code' | 'research' | 'agent';
  project_member_id?: string;
  model?: string;
};

type SidebarProjectGroup = {
  project: Project;
  conversations: SidebarConversation[];
};

function getProjectChatKind(conversation: SidebarConversation): 'general' | 'code' | 'research' | 'agent' {
  if (conversation.project_chat_kind) return conversation.project_chat_kind;
  if (conversation.project_run_kind === 'role_chat' || conversation.project_run_kind === 'task_execution') return 'agent';
  if (conversation.research_mode) return 'research';
  return 'general';
}

function getProjectChatKindLabel(kind: 'general' | 'code' | 'research' | 'agent', isZh: boolean) {
  if (kind === 'code') return isZh ? '代码' : 'Code';
  if (kind === 'research') return isZh ? '研究' : 'Research';
  if (kind === 'agent') return isZh ? 'Agent' : 'Agent';
  return isZh ? '普通' : 'General';
}

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newTitle: string) => void;
  initialTitle: string;
}

const RenameModal = ({ isOpen, onClose, onSave, initialTitle }: RenameModalProps) => {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      // Focus and select all text after a short delay to ensure modal is rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-claude-input rounded-2xl shadow-xl w-[400px] p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold text-claude-text mb-4">重命名聊天</h3>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (title.trim()) onSave(title.trim());
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          className="w-full px-3 py-2 bg-transparent border border-claude-border rounded-lg text-claude-text focus:outline-none focus:border-blue-500 mb-6 text-[15px]"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[14px] font-medium text-claude-text hover:bg-claude-hover rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (title.trim()) onSave(title.trim());
            }}
            disabled={!title.trim()}
            className="px-4 py-2 text-[14px] font-medium text-white bg-[#333333] hover:bg-[#1a1a1a] dark:bg-[#FFFFFF] dark:text-black dark:hover:bg-[#e5e5e5] rounded-lg transition-colors disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Sidebar = ({ isCollapsed, toggleSidebar, refreshTrigger, onNewChatClick, onOpenSettings, onOpenUpgrade, onCloseOverlays, tunerConfig, setTunerConfig }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isZh = localStorage.getItem('ui_language') === 'zh-CN';
  const codeJumpUrl = ((import.meta as any).env?.VITE_CODE_JUMP_URL || '/code/').trim();
  const [chats, setChats] = useState<SidebarConversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameInitialTitle, setRenameInitialTitle] = useState('');
  const [userUser, setUserUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{ bottom: number; left: number } | null>(null);
  const [planLabel, setPlanLabel] = useState('免费计划');
  const [usageData, setUsageData] = useState<{ token_used: number; token_quota: number } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isRecentsCollapsed, setIsRecentsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('sidebar_project_collapsed_v1') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  });
  const [isNewChatAnimating, setIsNewChatAnimating] = useState(false);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const [updateStatus, setUpdateStatus] = useState<{ type: string; version?: string; percent?: number } | null>(null);

  // Listen for streaming state changes. When a stream JUST ended (set size shrunk),
  // also refetch usage so the bottom-left progress bar reflects the new spend.
  // Bridge records usage to Chengdu fire-and-forget at finishTurn — wait ~1.5s for
  // the round trip (SG gateway → Chengdu DB write) to settle before reading.
  useEffect(() => {
    let prevSize = getStreamingIds().size;
    const handler = () => {
      const newIds = new Set(getStreamingIds());
      setStreamingIds(newIds);
      if (newIds.size < prevSize) {
        setTimeout(() => fetchPlan(), 1500);
      }
      prevSize = newIds.size;
    };
    window.addEventListener('streaming-change', handler);
    return () => window.removeEventListener('streaming-change', handler);
  }, []);

  // Listen for auto-update events
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onUpdateStatus) {
      api.onUpdateStatus((status: any) => setUpdateStatus(status));
    }
  }, []);

  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);

  const globalChats = useMemo(() => chats.filter((chat) => !chat.project_id), [chats]);

  const groupedRecents = useMemo(() => {
    const limited = globalChats.slice(0, 30).map((chat, index) => ({ chat, index: chats.findIndex((item) => item.id === chat.id) }));
    const sections: Array<{ label: string; projectName?: string | null; items: Array<{ chat: any; index: number }> }> = [];
    for (const item of limited) {
      const projectName = item.chat.project_name || null;
      const label = projectName || (isZh ? '聊天' : 'Chats');
      const existing = sections.find((section) => section.label === label);
      if (existing) {
        existing.items.push(item);
      } else {
        sections.push({ label, projectName, items: [item] });
      }
    }
    return sections;
  }, [chats, globalChats, isZh]);

  const selectedProjectId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('project');
  }, [location.search]);

  const activeChatId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/([^/?#]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const activeChat = useMemo(
    () => (activeChatId ? chats.find((chat) => chat.id === activeChatId) || null : null),
    [activeChatId, chats],
  );

  const activeProjectId = activeChat?.project_id || selectedProjectId || null;

  const projectGroups = useMemo<SidebarProjectGroup[]>(() => {
    return projects
      .filter((project) => !project.is_archived)
      .map((project) => ({
        project,
        conversations: chats
          .filter((chat) => chat.project_id === project.id)
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
      }))
      .filter((group) => group.conversations.length > 0 || group.project.id === activeProjectId);
  }, [activeProjectId, chats, projects]);

  const getNavLabel = useCallback((label: string) => {
    if (!isZh) return label;
    if (label === 'Chats') return '聊天';
    if (label === 'Agents') return '多 Agent';
    if (label === 'Automation') return '自动化';
    if (label === 'Projects') return '项目';
    if (label === 'Artifacts') return '作品';
    if (label === 'Code') return '代码';
    return label;
  }, [isZh]);

  // Map labels to the correct custom icon
  const getIcon = (label: string, size: number) => {
    const className = "dark:invert transition-[filter] duration-200";
    switch (label) {
      case 'Chats': return <IconChatBubble size={size} className={className} />;
      case 'Agents': return <Bot size={size - 7} className="text-current" />;
      case 'Automation': return <Clock3 size={size - 7} className="text-current" />;
      case 'Projects': return <IconProjects size={size} className={className} />;
      case 'Artifacts': return <IconArtifactsExact size={size} className={className} />;
      case 'Code': return <IconCode size={size} className={className} />;
      default: return <IconChatBubble size={size} className={className} />;
    }
  };

  const handleNewChat = () => {
    setIsNewChatAnimating(true);
    setTimeout(() => setIsNewChatAnimating(false), 300);
    if (onNewChatClick) {
      onNewChatClick();
      return;
    }
    navigate('/');
  };

  const updateTuner = (key: string, value: number) => {
    if (setTunerConfig && tunerConfig) {
      setTunerConfig({ ...tunerConfig, [key]: value });
    }
  };

  const handleNavClick = (label: string) => {
    if (label === 'Chats') {
      navigate('/chats');
      return;
    }
    if (label === 'Projects') {
      navigate('/projects');
      return;
    }
    if (label === 'Agents') {
      navigate('/agents');
      return;
    }
    if (label === 'Automation') {
      navigate('/automations');
      return;
    }
    if (label === 'Artifacts') {
      navigate('/artifacts');
      return;
    }
    if (label === 'Code') {
      navigate('/code');
      return;
    }
  };

  const persistCollapsedProjects = useCallback((nextValue: Record<string, boolean>) => {
    setCollapsedProjects(nextValue);
    localStorage.setItem('sidebar_project_collapsed_v1', JSON.stringify(nextValue));
  }, []);

  const toggleProjectCollapsed = useCallback((projectId: string) => {
    persistCollapsedProjects({
      ...collapsedProjects,
      [projectId]: !collapsedProjects[projectId],
    });
  }, [collapsedProjects, persistCollapsedProjects]);

  const loadSidebarData = useCallback(async () => {
    try {
      const [conversationData, projectData] = await Promise.all([
        getConversations(),
        getProjects(),
      ]);
      if (Array.isArray(conversationData)) {
        setChats(conversationData);
      }
      if (Array.isArray(projectData)) {
        setProjects(projectData);
      }
    } catch (e) {
      console.error('Failed to load sidebar data', e);
    }
  }, []);

  const handleOpenProject = useCallback((projectId: string) => {
    onCloseOverlays?.();
    navigate(`/projects?project=${projectId}`);
  }, [navigate, onCloseOverlays]);

  const handleCreateProjectChat = useCallback(async (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const conv = await createProjectConversation(project.id, `${project.name} chat`);
      await loadSidebarData();
      onCloseOverlays?.();
      navigate(`/chat/${conv.id}`);
    } catch (error) {
      console.error('Failed to create project chat', error);
    }
  }, [loadSidebarData, navigate, onCloseOverlays]);

  const handleChooseProjectFolder = useCallback(async (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const selected = await (window as any).electronAPI?.selectDirectory?.();
      if (!selected || typeof selected !== 'string') return;
      await updateProject(project.id, { workspace_path: selected });
      await loadSidebarData();
      setActiveProjectMenuId(null);
    } catch (error) {
      console.error('Failed to update project workspace', error);
    }
  }, [loadSidebarData]);

  const handleOpenProjectFolder = useCallback(async (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!project.workspace_path) return;
    try {
      await (window as any).electronAPI?.openFolder?.(project.workspace_path);
      setActiveProjectMenuId(null);
    } catch (error) {
      console.error('Failed to open project folder', error);
    }
  }, []);

  const handleCopyProjectWorkspace = useCallback(async (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!project.workspace_path) return;
    try {
      await copyToClipboard(project.workspace_path);
      setActiveProjectMenuId(null);
    } catch (error) {
      console.error('Failed to copy project workspace', error);
    }
  }, []);

  useEffect(() => {
    setUserUser(getUser());
    loadSidebarData();
    fetchPlan();
    getUserProfile().then((data: any) => {
      const p = data?.user || data;
      if (p?.role === 'admin' || p?.role === 'superadmin') setIsAdmin(true);
      if (p?.nickname || p?.full_name) {
        setUserUser((prev: any) => ({ ...prev, ...p }));
      }
    }).catch(() => { });

    // 监听标题更新事件
    const handleConversationMutation = () => {
      loadSidebarData();
    };

    // 监听用户资料更新事件
    const handleProfileUpdate = () => {
      setUserUser(getUser());
      getUserProfile().then((data: any) => {
        const p = data?.user || data;
        if (p?.role === 'admin' || p?.role === 'superadmin') setIsAdmin(true);
        if (p?.nickname || p?.full_name) {
          setUserUser((prev: any) => ({ ...prev, ...p }));
        }
      }).catch(() => { });
    };

    window.addEventListener('conversationTitleUpdated', handleConversationMutation);
    window.addEventListener('conversationDeleted', handleConversationMutation);
    window.addEventListener('userProfileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('conversationTitleUpdated', handleConversationMutation);
      window.removeEventListener('conversationDeleted', handleConversationMutation);
      window.removeEventListener('userProfileUpdated', handleProfileUpdate);
    };
  }, [loadSidebarData]);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData, location.pathname, location.search, refreshTrigger]);

  const fetchPlan = async () => {
    try {
      const data = await getUserUsage();
      setUsageData({
        token_used: Number(data?.token_used) || 0,
        token_quota: Number(data?.token_quota) || 0,
      });
      if (data.plan && data.plan.name) {
        const nameMap: Record<string, string> = {
          '体验包': 'Trail plan',
          '基础月卡': 'Pro plan',
          '专业月卡': 'Max x5 plan',
          '尊享月卡': 'Max x20 plan',
        };
        setPlanLabel(nameMap[data.plan.name] || data.plan.name);
      } else {
        setPlanLabel('免费计划');
      }
    } catch (e) {
      // 获取失败保持默认
    }
  };

  const handleRenameClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (chats[index]) {
      setRenameChatId(chats[index].id);
      setRenameInitialTitle(chats[index].title || 'New Chat');
      setShowRenameModal(true);
    }
    setActiveMenuIndex(null);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!renameChatId) return;

    try {
      // Optimistic update
      setChats(chats.map(c => c.id === renameChatId ? { ...c, title: newTitle } : c));
      await updateConversation(renameChatId, { title: newTitle });

      // Notify other components (like Header) about the title change if it's the active chat
      if (location.pathname === `/chat/${renameChatId}`) {
        window.dispatchEvent(new CustomEvent('conversationTitleUpdated'));
      }
    } catch (err) {
      console.error('Failed to rename chat:', err);
      // Revert on failure
      loadSidebarData();
    }
    setShowRenameModal(false);
    setRenameChatId(null);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setChats(chats.filter(c => c.id !== id));
      setActiveMenuIndex(null);
      if (location.pathname === `/chat/${id}`) {
        navigate('/');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 忽略用户按钮本身的点击（由按钮 onClick 处理）
      if (userBtnRef.current && userBtnRef.current.contains(event.target as Node)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuIndex(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    // Close on scroll
    const handleScroll = () => {
      if (activeMenuIndex !== null) setActiveMenuIndex(null);
      if (showUserMenu) setShowUserMenu(false);
    };

    if (activeMenuIndex !== null || showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      // Attach scroll listener to the sidebar scroll container
      const scrollEl = scrollRef.current;
      scrollEl?.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleScroll);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      const scrollEl = scrollRef.current;
      scrollEl?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeMenuIndex, showUserMenu]);

  const handleMenuClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (activeMenuIndex === index) {
      setActiveMenuIndex(null);
      return;
    }

    const button = e.currentTarget as HTMLElement;
    const buttonRect = button.getBoundingClientRect();
    const parentElement = button.parentElement;

    let leftPos = buttonRect.right - 200; // Fallback to button alignment

    if (parentElement) {
      const parentRect = parentElement.getBoundingClientRect();
      // Align right edge of menu (200px wide) with the right edge of the chat item container
      leftPos = parentRect.right - 200;
    }

    const menuHeight = 120; // Approximate height of the menu
    let topPos = buttonRect.bottom + 4;

    // Check if menu would overflow bottom of viewport
    if (topPos + menuHeight > window.innerHeight) {
      // Position above the button instead
      topPos = buttonRect.top - menuHeight - 4;
    }

    setMenuPosition({
      top: topPos,
      left: leftPos,
    });
    setActiveMenuIndex(index);
  };

  return (
    <>
      <div
        className={`
          h-screen bg-claude-sidebar border-r border-claude-border flex-shrink-0 text-claude-text antialiased flex flex-col transition-all duration-200 ease-in-out overflow-hidden relative
        `}
        style={{
          width: isCollapsed ? '46px' : `${tunerConfig?.sidebarWidth || 280}px`
        }}
      >

        {/* New Chat - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: '58px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '2px'
          }}
        >
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap"
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`}>
              <IconPlusCircle
                size={27}
                className={`transition-all duration-200 group-hover:brightness-90 ${isNewChatAnimating ? "rotate-90 scale-100" : "group-hover:scale-110 group-hover:-rotate-3"}`}
              />
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              {isZh ? '新建聊天' : 'New chat'}
            </span>
          </button>
        </div>

        {/* Search - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: '2px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '2px'
          }}
        >
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap"
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`} style={{ width: '27px', height: '27px' }}>
              <img
                src={searchIconImg}
                alt="Search"
                style={{ width: '16px', height: '16px' }}
                className="object-contain dark:invert transition-[filter] duration-200"
              />
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              {isZh ? '搜索' : 'Search'}
            </span>
          </button>
        </div>

        {/* Customize - Fixed */}
        <div
          className="flex-shrink-0"
          style={{
            marginTop: '2px',
            paddingLeft: '9px',
            paddingRight: '9px',
            marginBottom: '16px'
          }}
        >
          <button
            onClick={() => navigate('/customize')}
            className={`w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap ${location.pathname === '/customize' ? 'bg-claude-hover' : ''}`}
            style={{
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '0px',
              gap: '8px'
            }}
          >
            <div className={`text-claude-text flex-shrink-0 flex items-center justify-center`} style={{ width: '27px', height: '27px' }}>
              <img
                src={customizeIconImg}
                alt="Customize"
                style={{ width: '24px', height: '24px' }}
                className="object-contain dark:invert transition-all duration-200 group-hover:brightness-90 group-hover:scale-110 group-hover:-rotate-3 group-active:rotate-12 group-active:scale-90"
              />
            </div>
            <span
              className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
              style={{ fontSize: '14px', fontWeight: 400 }}
            >
              {isZh ? '自定义' : 'Customize'}
            </span>
          </button>
        </div>

        {/* Scrollable Area containing Nav and Recents */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto sidebar-scroll min-h-0 pb-6"
          style={{
            paddingLeft: '9px',
            paddingRight: '9px',
            paddingTop: '0px'
          }}
        >

          {/* Navigation Links */}
          <nav className="space-y-1 mb-5">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.label)}
                className={`w-full flex items-center justify-start text-claude-text hover:bg-claude-hover rounded-lg transition-colors group overflow-hidden whitespace-nowrap ${(location.pathname === '/chats' && item.label === 'Chats') || (location.pathname === '/projects' && item.label === 'Projects') || (location.pathname === '/agents' && item.label === 'Agents') || (location.pathname === '/automations' && item.label === 'Automation') ? 'bg-claude-hover' : ''}`}
                style={{
                  fontWeight: 400,
                  paddingTop: '2px',
                  paddingBottom: '2px',
                  paddingLeft: '0px',
                  gap: '8px'
                }}
              >
                <div className={`text-claude-text flex-shrink-0 transition-colors flex items-center justify-center`}>
                  {getIcon(item.label, 27)}
                </div>
                <span
                  className={`leading-none transition-opacity duration-200 text-left ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 block'}`}
                  style={{ fontSize: '14px' }}
                >
                  {getNavLabel(item.label)}
                </span>
              </button>
            ))}
          </nav>

          {!isCollapsed && projectGroups.length > 0 && (
            <div className="mb-5">
              <div
                className="px-3 pb-2 text-[13px] font-medium text-claude-textSecondary"
                style={{ paddingLeft: `${tunerConfig?.recentsPl || 12}px` }}
              >
                {isZh ? '项目' : 'Projects'}
              </div>
              <div className="space-y-1">
                {projectGroups.map(({ project, conversations }) => {
                  const isProjectActive = activeProjectId === project.id;
                  const isCollapsedProject = !!collapsedProjects[project.id];
                  return (
                    <div key={`project-tree-${project.id}`} className="space-y-0.5">
                      <div
                        onClick={() => handleOpenProject(project.id)}
                        className={`group relative flex min-h-[34px] items-center gap-2 rounded-xl px-3 py-1.5 cursor-pointer transition-colors ${isProjectActive ? 'bg-claude-hover' : 'hover:bg-claude-hover/80'}`}
                        style={{ paddingLeft: `${tunerConfig?.recentsPl || 12}px` }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProjectCollapsed(project.id);
                          }}
                          className="text-claude-textSecondary hover:text-claude-text transition-colors"
                          title={isCollapsedProject ? (isZh ? '展开项目' : 'Expand project') : (isZh ? '收起项目' : 'Collapse project')}
                        >
                          {isCollapsedProject ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {isProjectActive ? (
                          <FolderOpen size={14} className="text-claude-text" />
                        ) : (
                          <Folder size={14} className="text-claude-textSecondary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-claude-text">{project.name}</div>
                        </div>
                        <div className="text-[11px] text-claude-textSecondary">{conversations.length}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveProjectMenuId((prev) => prev === project.id ? null : project.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-claude-textSecondary hover:text-claude-text transition-all"
                          title={isZh ? '项目菜单' : 'Project menu'}
                        >
                          <IconDotsHorizontal size={14} />
                        </button>
                        <button
                          onClick={(e) => handleCreateProjectChat(project, e)}
                          className="opacity-0 group-hover:opacity-100 text-claude-textSecondary hover:text-claude-text transition-all"
                          title={isZh ? '新建项目聊天' : 'New project chat'}
                        >
                          <MessageSquarePlus size={14} />
                        </button>
                        {activeProjectMenuId === project.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setActiveProjectMenuId(null); }} />
                            <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-[14px] border border-gray-200 bg-white py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.15)] dark:border-[#65645F] dark:bg-[#30302E]">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveProjectMenuId(null); handleOpenProject(project.id); }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <Folder size={15} className="text-claude-textSecondary" />
                                {isZh ? '打开项目' : 'Open project'}
                              </button>
                              <button
                                onClick={(e) => handleCreateProjectChat(project, e)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <MessageSquarePlus size={15} className="text-claude-textSecondary" />
                                {isZh ? '新建项目聊天' : 'New project chat'}
                              </button>
                              <div className="my-1.5 border-t border-claude-border opacity-50" />
                              <button
                                onClick={(e) => handleChooseProjectFolder(project, e)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <FolderOpen size={15} className="text-claude-textSecondary" />
                                {isZh ? '重选项目目录' : 'Choose project folder'}
                              </button>
                              <button
                                onClick={(e) => handleOpenProjectFolder(project, e)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <FolderOpen size={15} className="text-claude-textSecondary" />
                                {isZh ? '在资源管理器中打开' : 'Open in Explorer'}
                              </button>
                              <button
                                onClick={(e) => handleCopyProjectWorkspace(project, e)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-claude-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                <Copy size={15} className="text-claude-textSecondary" />
                                {isZh ? '复制项目路径' : 'Copy workspace path'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      {!isCollapsedProject && conversations.map((chat) => {
                        const chatIndex = chats.findIndex((item) => item.id === chat.id);
                        const isActive = location.pathname === `/chat/${chat.id}`;
                        const chatKind = getProjectChatKind(chat);
                        return (
                          <div
                            key={`project-conversation-${chat.id}`}
                            onClick={() => { onCloseOverlays?.(); navigate(`/chat/${chat.id}`); }}
                            className={`relative group flex min-h-[30px] items-center rounded-lg transition-colors cursor-pointer ${isActive || activeMenuIndex === chatIndex ? 'bg-claude-hover' : 'hover:bg-claude-hover/80'}`}
                            style={{
                              paddingTop: `${Math.max((tunerConfig?.recentsItemPy || 6) - 2, 3)}px`,
                              paddingBottom: `${Math.max((tunerConfig?.recentsItemPy || 6) - 2, 3)}px`,
                              paddingLeft: `${(tunerConfig?.recentsPl || 12) + 34}px`,
                              paddingRight: `${tunerConfig?.recentsPl || 12}px`
                            }}
                          >
                            {streamingIds.has(chat.id) && (
                              <span
                                className="flex-shrink-0 mr-2 w-[7px] h-[7px] rounded-full bg-neutral-700 dark:bg-neutral-300 animate-pulse"
                                style={{ animationDuration: '1.6s' }}
                              />
                            )}
                            <div className="flex min-w-0 flex-1 items-center gap-2 pr-6">
                              <div
                                className="text-claude-text truncate leading-snug"
                                style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }}
                              >
                                {chat.title || (isZh ? '未命名聊天' : 'Untitled chat')}
                              </div>
                              <span className="shrink-0 rounded-full border border-claude-border px-1.5 py-0.5 text-[10px] leading-none text-claude-textSecondary">
                                {chatKind === 'code'
                                  ? (isZh ? '代码' : 'Code')
                                  : chatKind === 'research'
                                    ? (isZh ? '研究' : 'Research')
                                    : chatKind === 'agent'
                                      ? 'Agent'
                                      : (isZh ? '普通' : 'General')}
                              </span>
                            </div>
                            {chatIndex >= 0 && (
                              <button
                                onClick={(e) => handleMenuClick(e, chatIndex)}
                                className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-claude-textSecondary hover:text-claude-text transition-all ${activeMenuIndex === chatIndex ? 'opacity-100 block' : 'opacity-0 group-hover:opacity-100 hidden group-hover:block'}`}
                              >
                                <IconDotsHorizontal size={16} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recents Section Header */}
          <div
            className={`group flex items-center gap-3 px-3 pb-2 transition-opacity duration-200 select-none ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}
            style={{
              marginTop: `${tunerConfig?.recentsMt || 0}px`,
              paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
              paddingRight: '12px'
            }}
          >
            <span className="text-[13px] font-medium text-claude-textSecondary">Recents</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRecentsCollapsed(!isRecentsCollapsed);
              }}
              className="text-[13px] font-medium text-claude-textSecondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity cursor-pointer outline-none"
            >
              {isRecentsCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>

          {/* Recents List */}
          <div className={`space-y-0.5 pb-2 transition-all duration-200 ${isCollapsed || isRecentsCollapsed ? 'opacity-0 hidden h-0 overflow-hidden' : 'opacity-100'}`}>
            {groupedRecents.map((section) => (
              <div key={section.label} className="space-y-0.5">
                <div
                  className="px-3 pt-1 text-[11px] uppercase tracking-[0.08em] text-claude-textSecondary/70"
                  style={{ paddingLeft: `${tunerConfig?.recentsPl || 12}px` }}
                >
                  {section.projectName || (isZh ? '聊天' : 'Chats')}
                </div>
                {section.items.map(({ chat, index }) => {
                  const isActive = location.pathname === `/chat/${chat.id}`;
                  return (
                    <div
                      key={`grouped-${chat.id}`}
                      onClick={() => { onCloseOverlays?.(); navigate(`/chat/${chat.id}`); }}
                      className={`
                        relative group flex items-center w-full rounded-lg transition-colors cursor-pointer min-h-[32px]
                        ${isActive || activeMenuIndex === index ? 'bg-claude-hover' : 'hover:bg-claude-hover'}
                      `}
                      style={{
                        paddingTop: `${tunerConfig?.recentsItemPy || 6}px`,
                        paddingBottom: `${tunerConfig?.recentsItemPy || 6}px`,
                        paddingLeft: `${(tunerConfig?.recentsPl || 12) + 12}px`,
                        paddingRight: `${tunerConfig?.recentsPl || 12}px`
                      }}
                    >
                      {streamingIds.has(chat.id) && (
                        <span
                          className="flex-shrink-0 mr-2 w-[7px] h-[7px] rounded-full bg-neutral-700 dark:bg-neutral-300 animate-pulse"
                          style={{ animationDuration: '1.6s' }}
                        />
                      )}
                      <div className="flex-1 min-w-0 pr-6">
                        <div
                          className="text-claude-text truncate leading-snug"
                          style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }}
                        >
                          {chat.title || 'New Chat'}
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleMenuClick(e, index)}
                        className={`
                          absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-claude-textSecondary hover:text-claude-text transition-all
                          ${activeMenuIndex === index ? 'opacity-100 block' : 'opacity-0 group-hover:opacity-100 hidden group-hover:block'}
                        `}
                      >
                        <IconDotsHorizontal size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {false && chats.slice(0, 30).map((chat, index) => {
              const isActive = location.pathname === `/chat/${chat.id}`;
              return (
                <div
                  key={chat.id}
                  onClick={() => { onCloseOverlays?.(); navigate(`/chat/${chat.id}`); }}
                  className={`
                    relative group flex items-center w-full rounded-lg transition-colors cursor-pointer min-h-[32px]
                    ${isActive || activeMenuIndex === index ? 'bg-claude-hover' : 'hover:bg-claude-hover'}
                  `}
                  style={{
                    paddingTop: `${tunerConfig?.recentsItemPy || 6}px`,
                    paddingBottom: `${tunerConfig?.recentsItemPy || 6}px`,
                    paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
                    paddingRight: `${tunerConfig?.recentsPl || 12}px`
                  }}
                >
                  {/* Streaming indicator — single breathing dot */}
                  {streamingIds.has(chat.id) && (
                    <span
                      className="flex-shrink-0 mr-2 w-[7px] h-[7px] rounded-full bg-neutral-700 dark:bg-neutral-300 animate-pulse"
                      style={{ animationDuration: '1.6s' }}
                    />
                  )}
                  {/* Chat Title */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div
                      className="text-claude-text truncate leading-snug"
                      style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }}
                    >
                      {chat.title || 'New Chat'}
                    </div>
                    {chat.project_name && (
                      <div className="text-[11px] text-claude-textSecondary truncate leading-snug mt-0.5 opacity-60">
                        {chat.project_name}
                      </div>
                    )}
                  </div>

                  {/* Three Dots Button */}
                  <button
                    onClick={(e) => handleMenuClick(e, index)}
                    className={`
                      absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-claude-textSecondary hover:text-claude-text transition-all
                      ${activeMenuIndex === index ? 'opacity-100 block' : 'opacity-0 group-hover:opacity-100 hidden group-hover:block'}
                    `}
                  >
                    <IconDotsHorizontal size={16} />
                  </button>
                </div>
              );
            })}
            {globalChats.length > 30 && (
              <button
                onClick={() => { onCloseOverlays?.(); navigate('/chats'); }}
                className="w-full flex items-center gap-2 rounded-lg hover:bg-claude-hover transition-colors text-claude-textSecondary hover:text-claude-text"
                style={{
                  paddingTop: `${tunerConfig?.recentsItemPy || 6}px`,
                  paddingBottom: `${tunerConfig?.recentsItemPy || 6}px`,
                  paddingLeft: `${tunerConfig?.recentsPl || 12}px`,
                }}
              >
                <IconDotsHorizontal size={18} className="opacity-60" />
                <span style={{ fontSize: `${tunerConfig?.recentsFontSize || 13}px` }} className="leading-tight">All chats</span>
              </button>
            )}
          </div>

        </div>

        {/* Update status banner */}
        {updateStatus && !isCollapsed && (updateStatus.type === 'available' || updateStatus.type === 'progress' || updateStatus.type === 'downloaded') && (
          <div className="mx-3 mb-2 mt-auto">
            {(updateStatus.type === 'available' || updateStatus.type === 'progress') && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-claude-hover">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-claude-textSecondary flex-shrink-0 animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-claude-textSecondary leading-tight">
                    Downloading update...{updateStatus.percent != null ? ` ${updateStatus.percent}%` : ''}
                  </div>
                  {updateStatus.percent != null && (
                    <div className="mt-1.5 h-[3px] rounded-full bg-claude-border overflow-hidden">
                      <div className="h-full rounded-full bg-claude-textSecondary transition-all duration-300" style={{ width: `${updateStatus.percent}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {updateStatus.type === 'downloaded' && (
              <div className="px-3 py-3 rounded-lg bg-claude-hover">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-claude-text flex-shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div className="text-[13px] text-claude-text font-medium leading-tight">Updated to {updateStatus.version}</div>
                </div>
                <div className="text-[11.5px] text-claude-textSecondary mb-2.5 ml-6">Relaunch to apply</div>
                <button
                  onClick={() => { const api = (window as any).electronAPI; api?.installUpdate?.(); }}
                  className="w-full px-3 py-1.5 rounded-md bg-claude-bg border border-claude-border text-[13px] text-claude-text font-medium hover:bg-claude-btnHover transition-colors"
                >
                  Relaunch
                </button>
              </div>
            )}
          </div>
        )}

        {/* User Profile Footer */}
        <div
          className={`${!updateStatus || isCollapsed || (updateStatus.type !== 'available' && updateStatus.type !== 'progress' && updateStatus.type !== 'downloaded') ? 'mt-auto' : ''} border-t border-claude-border flex-shrink-0 relative transition-all duration-200`}
          style={{
            paddingTop: `${tunerConfig?.profilePy || 12}px`,
            paddingBottom: `${tunerConfig?.profilePy || 12}px`,
            paddingLeft: isCollapsed ? '0px' : `${tunerConfig?.profilePx || 12}px`,
            paddingRight: isCollapsed ? '0px' : `${tunerConfig?.profilePx || 12}px`,
          }}
        >
          <button
            ref={userBtnRef}
            onClick={() => {
              if (!showUserMenu && userBtnRef.current) {
                const rect = userBtnRef.current.getBoundingClientRect();
                setUserMenuPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
              }
              setShowUserMenu(!showUserMenu);
            }}
            className={`w-full flex items-center gap-2 hover:bg-claude-hover rounded-lg transition-all duration-200 overflow-hidden whitespace-nowrap`}
            style={{
              padding: isCollapsed ? '8px 0px 8px 5px' : '8px'
            }}
          >
            <div
              className="rounded-full bg-claude-avatar text-claude-avatarText flex items-center justify-center text-[15px] font-medium flex-shrink-0"
              style={{ width: `${tunerConfig?.userAvatarSize || 32}px`, height: `${tunerConfig?.userAvatarSize || 32}px` }}
            >
              {(userUser?.display_name || userUser?.full_name || userUser?.nickname || 'U').charAt(0).toUpperCase()}
            </div>
            <div className={`flex items-center justify-between w-full transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <div className="text-left overflow-hidden flex-1 min-w-0">
                <div
                  className="font-medium text-claude-text leading-tight"
                  style={{ fontSize: `${tunerConfig?.userNameSize || 15}px`, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                >
                  {userUser?.display_name || userUser?.full_name || userUser?.nickname || '用户'}
                </div>
                {localStorage.getItem('user_mode') === 'selfhosted' ? (
                  <div className="text-[13px] text-claude-textSecondary mt-1 leading-tight">自定义兼容 API</div>
                ) : (
                  <div className="text-[13px] text-claude-textSecondary mt-1 leading-tight">官方 Anthropic API</div>
                )}
              </div>
              <ChevronUp size={16} className="text-claude-textSecondary shrink-0 ml-1" />
            </div>
          </button>

          {/* User Menu Popup */}
          {showUserMenu && userMenuPos && (
            <div ref={userMenuRef} className="fixed w-[220px] bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-[60]"
              style={{ bottom: `${userMenuPos.bottom}px`, left: `${userMenuPos.left}px` }}
            >
              {/* User info header */}
              <div className="px-4 py-2.5 border-b border-claude-border">
                <div className="text-[13px] font-medium text-claude-text">{userUser?.display_name || userUser?.full_name || userUser?.nickname || '用户'}</div>
                <div className="text-[12px] text-claude-textSecondary mt-0.5">{userUser?.email || ''}</div>
              </div>
              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={() => { setShowUserMenu(false); onOpenSettings?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                >
                  <Settings size={16} className="text-claude-textSecondary" />
                  设置
                </button>
                <button
                  onClick={() => { setShowUserMenu(false); setShowHelpModal(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                >
                  <HelpCircle size={16} className="text-claude-textSecondary" />
                  帮助与支持
                </button>
              </div>
              <div className="h-[1px] bg-claude-border mx-3" />
              <div className="py-1">
                <button
                  onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
                >
                  <LogOut size={16} className="text-claude-textSecondary" />
                  退出登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div >

      {/* Fixed Context Menu Portal */}
      {
        activeMenuIndex !== null && menuPosition && chats[activeMenuIndex] && (
          <div
            ref={menuRef}
            className="fixed z-50 bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-1.5 flex flex-col w-[200px]"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
          >
            <button className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group">
              <IconStarOutline size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
              <span className="text-[13px] text-claude-text">收藏</span>
            </button>
            <button
              onClick={(e) => handleRenameClick(e, activeMenuIndex as number)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
            >
              <IconPencil size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
              <span className="text-[13px] text-claude-text">重命名</span>
            </button>
            <div className="h-[1px] bg-claude-border my-1 mx-3" />
            <button
              onClick={(e) => handleDeleteChat(chats[activeMenuIndex].id, e)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
            >
              <IconTrash size={16} className="text-[#B9382C]" />
              <span className="text-[13px] text-[#B9382C]">删除</span>
            </button>
          </div>
        )
      }
      {/* Fixed Layout Tuner (Removed) */}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        chats={chats}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setRenameChatId(null);
        }}
        onSave={handleRenameSubmit}
        initialTitle={renameInitialTitle}
      />
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-claude-input rounded-2xl shadow-xl w-[360px] p-6">
            <h3 className="text-[16px] font-semibold text-claude-text mb-2">确认退出登录？</h3>
            <p className="text-[14px] text-claude-textSecondary mb-6">此操作会清除当前设备上的登录状态。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-[13px] text-claude-text bg-claude-btn-hover hover:bg-claude-hover rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                className="px-4 py-2 text-[13px] text-white bg-[#B9382C] hover:bg-[#A02E23] rounded-lg transition-colors"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setShowHelpModal(false)}>
          <div
            className="bg-claude-input rounded-2xl shadow-xl w-[360px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-claude-text mb-2">售后支持</h3>
            <p className="text-[14px] text-claude-textSecondary mb-3">售后 QQ：</p>
            <div className="px-4 py-3 mb-6 rounded-xl bg-claude-btn-hover text-[20px] font-semibold tracking-wide text-claude-text text-center select-all">
              2592056451
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 text-[13px] text-claude-text bg-claude-btn-hover hover:bg-claude-hover rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
