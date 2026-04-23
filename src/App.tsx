import React, { startTransition, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { FileText, ChevronDown, Trash, Pencil, Star, BellRing, Menu, Folder, ArrowLeft, ArrowRight, HelpCircle, MessageSquarePlus, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, Settings, UsersRound, Code2, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { IconSidebarToggle } from './components/Icons';
import { updateConversation, deleteConversation, exportConversation, getUnreadAnnouncements, markAnnouncementRead, getSystemStatus } from './api';
import GitBashRequiredModal from './components/GitBashRequiredModal';
import Auth from './components/Auth';
import Onboarding from './components/Onboarding';
import SettingsPage from './components/SettingsPage';
import UpgradePlan from './components/UpgradePlan';
import DocumentPanel from './components/DocumentPanel';
import ArtifactsPanel from './components/ArtifactsPanel';
import ArtifactsPage from './components/ArtifactsPage';
import DraggableDivider from './components/DraggableDivider';
import { DocumentInfo } from './components/DocumentCard';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminKeyPool from './components/admin/AdminKeyPool';
import AdminUsers from './components/admin/AdminUsers';
import AdminPlans from './components/admin/AdminPlans';
import AdminRedemption from './components/admin/AdminRedemption';
import AdminModels from './components/admin/AdminModels';
import AdminAnnouncements from './components/admin/AdminAnnouncements';
import ChatsPage from './components/ChatsPage';
import CustomizePage from './components/CustomizePage';
import ProjectsPage from './components/ProjectsPage';
import CoworkPage from './components/CoworkPage';
import CodePage from './components/CodePage';
import { useClientLanguageText } from './utils/chineseClientText';

const Tooltip = ({ children, text, shortcut }: { children: React.ReactNode; text: string; shortcut?: string }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-[200] pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap bg-[#2a2a2a] text-white dark:bg-[#e8e8e8] dark:text-[#1a1a1a] shadow-lg">
            <span>{text}</span>
            {shortcut && <span className="opacity-60 text-[11px]">{shortcut}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

class PageErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[PageErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

type DesktopTabMode = 'chat' | 'cowork' | 'code';

type DesktopWorkspaceTab = {
  id: string;
  mode: DesktopTabMode;
  title: string;
  customTitle?: string;
  pinned?: boolean;
  path: string;
  createdAt: number;
  updatedAt: number;
};

const DESKTOP_TABS_STORAGE_KEY = 'desktop_workspace_tabs_v1';
const DESKTOP_ACTIVE_TAB_STORAGE_KEY = 'desktop_workspace_active_tab_v1';

const makeDesktopTabId = () => `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const isDesktopWorkspacePath = (pathname: string) => pathname === '/' || pathname.startsWith('/chat/') || pathname === '/cowork' || pathname === '/code';

const getDesktopTabModeFromPath = (pathname: string): DesktopTabMode => {
  if (pathname === '/cowork') return 'cowork';
  if (pathname === '/code') return 'code';
  return 'chat';
};

const getDesktopDefaultPath = (mode: DesktopTabMode) => {
  if (mode === 'cowork') return '/cowork';
  if (mode === 'code') return '/code';
  return '/';
};

const withDesktopTabQuery = (pathname: string, search: string, tabId: string) => {
  const params = new URLSearchParams(search);
  params.set('tab', tabId);
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}`;
};

const getDesktopTabTitle = (mode: DesktopTabMode, pathname: string, chatTitle?: string) => {
  if (mode === 'cowork') return '协作';
  if (mode === 'code') return '代码';
  if (pathname.startsWith('/chat/')) return chatTitle?.trim() || '聊天会话';
  return '新聊天';
};

const buildDesktopWorkspaceTab = (mode: DesktopTabMode, path: string, title?: string, tabId?: string): DesktopWorkspaceTab => {
  const now = Date.now();
  return {
    id: tabId || makeDesktopTabId(),
    mode,
    title: title || getDesktopTabTitle(mode, getDesktopDefaultPath(mode)),
    path,
    createdAt: now,
    updatedAt: now,
  };
};

const readStoredDesktopTabs = (): DesktopWorkspaceTab[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(DESKTOP_TABS_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is DesktopWorkspaceTab => {
      return !!item && typeof item.id === 'string' && typeof item.mode === 'string' && typeof item.title === 'string' && typeof item.path === 'string';
    });
  } catch {
    return [];
  }
};

const getDesktopTabLabel = (tab: DesktopWorkspaceTab) => tab.customTitle?.trim() || tab.title;

const sortDesktopTabsForDisplay = (tabs: DesktopWorkspaceTab[]) => {
  const pinned = tabs.filter((tab) => !!tab.pinned);
  const normal = tabs.filter((tab) => !tab.pinned);
  return [...pinned, ...normal];
};

const reorderDesktopWorkspaceTabGroup = (
  tabs: DesktopWorkspaceTab[],
  sourceId: string,
  targetId: string,
) => {
  const sourceTab = tabs.find((tab) => tab.id === sourceId);
  const targetTab = tabs.find((tab) => tab.id === targetId);
  if (!sourceTab || !targetTab || !!sourceTab.pinned !== !!targetTab.pinned) {
    return tabs;
  }
  return reorderDesktopWorkspaceTabs(tabs, sourceId, targetId);
};

const reorderDesktopWorkspaceTabs = (
  tabs: DesktopWorkspaceTab[],
  sourceId: string,
  targetId: string,
) => {
  if (sourceId === targetId) return tabs;
  const sourceIndex = tabs.findIndex((tab) => tab.id === sourceId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return tabs;

  const nextTabs = [...tabs];
  const [moved] = nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(targetIndex, 0, moved);
  return nextTabs;
};

const ChatHeader = ({
  title,
  showArtifacts,
  documentPanelDoc,
  onOpenArtifacts,
  hasArtifacts,
  onTitleRename
}: {
  title: string;
  showArtifacts: boolean;
  documentPanelDoc: any;
  onOpenArtifacts: () => void;
  hasArtifacts: boolean;
  onTitleRename?: (newTitle: string) => void;
}) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const startEditing = () => {
    setEditTitle(title || '新建聊天');
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteConversation(id);
      navigate('/');
      // Trigger sidebar refresh
      window.dispatchEvent(new CustomEvent('conversationTitleUpdated'));
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
    setShowMenu(false);
  };

  const handleRenameSubmit = async () => {
    if (!id || !editTitle.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      await updateConversation(id, { title: editTitle });
      onTitleRename?.(editTitle);
      window.dispatchEvent(new CustomEvent('conversationTitleUpdated'));
    } catch (err) {
      console.error('Failed to rename chat:', err);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div
      className="relative flex items-center justify-between px-3 py-2 bg-claude-bg flex-shrink-0 h-[44px] border-b border-claude-border z-40"
    >
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="max-w-[60%] px-2 py-1 text-[14px] font-medium text-claude-text bg-claude-input border border-blue-500 rounded-md outline-none shadow-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
      ) : (
        <div className="relative flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={startEditing}
            className="flex items-center px-2 py-1.5 hover:bg-claude-btn-hover rounded-md transition-colors text-[14px] font-medium text-claude-text max-w-[200px] truncate group"
          >
            {title || '新建聊天'}
          </button>

          <button
            ref={buttonRef}
            onClick={() => setShowMenu(!showMenu)}
            className={`p-1 hover:bg-claude-btn-hover rounded-md transition-colors text-claude-textSecondary hover:text-claude-text ${showMenu ? 'bg-claude-btn-hover text-claude-text' : ''}`}
          >
            <ChevronDown size={14} />
          </button>

          {showMenu && (
            <div
              ref={menuRef}
              className="absolute top-full left-0 mt-1 z-50 bg-claude-input border border-claude-border rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-1.5 flex flex-col w-[200px]"
            >
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group">
                <Star size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
                <span className="text-[13px] text-claude-text">收藏</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
              >
                <Pencil size={16} className="text-claude-textSecondary group-hover:text-claude-text" />
                <span className="text-[13px] text-claude-text">重命名</span>
              </button>
              <div className="h-[1px] bg-claude-border my-1 mx-3" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-claude-hover text-left w-full transition-colors group"
              >
                <Trash size={16} className="text-[#B9382C]" />
                <span className="text-[13px] text-[#B9382C]">删除</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        {hasArtifacts && (
          <button
            onClick={onOpenArtifacts}
            className={`w-8 h-8 flex items-center justify-center text-claude-textSecondary hover:bg-claude-btn-hover rounded-md transition-colors ${showArtifacts ? 'bg-claude-btn-hover text-claude-text' : ''}`}
            title="查看作品"
          >
            <FileText size={18} strokeWidth={1.5} />
          </button>
        )}
        <button
          className="px-2 h-8 flex items-center justify-center text-claude-textSecondary hover:text-claude-text transition-colors"
          title="打开工作区文件夹"
          onClick={async () => {
            if (!id) return;
            try {
              const res = await fetch(`http://127.0.0.1:30080/api/conversations/${id}`);
              if (!res.ok) return;
              const data = await res.json();
              if (data.workspace_path && (window as any).electronAPI?.openPathWithTarget) {
                const target = localStorage.getItem('default_open_target') || 'vscode';
                const result = await (window as any).electronAPI.openPathWithTarget(data.workspace_path, target);
                if (!result?.ok && (window as any).electronAPI?.openFolder) {
                  await (window as any).electronAPI.openFolder(data.workspace_path);
                }
              }
            } catch (e) { console.error('Open folder failed:', e); }
          }}
        >
          <Folder size={17} strokeWidth={1.5} />
        </button>
        <button
          onClick={async () => {
            if (!id || isExporting) return;
            setIsExporting(true);
            try {
              await exportConversation(id);
            } catch (err) {
              console.error('导出失败', err);
              window.alert(err instanceof Error ? err.message : '导出失败');
            } finally {
              setIsExporting(false);
            }
          }}
          disabled={isExporting}
          className="px-3 py-1.5 text-[13px] font-medium text-claude-textSecondary hover:bg-claude-btn-hover rounded-md transition-colors border border-transparent hover:border-claude-border disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? '导出中…' : 'Export'}
        </button>
      </div>
      <div className="absolute top-full left-0 right-0 h-6 bg-gradient-to-b from-claude-bg to-transparent pointer-events-none z-30" />
    </div>
  );
};

const Layout = () => {
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<Array<{
    id: number;
    title: string;
    content: string;
    created_at: string;
    updated_at?: string;
  }>>([]);
  const [activeAnnouncementId, setActiveAnnouncementId] = useState<number | null>(null);
  const [isMarkingAnnouncementRead, setIsMarkingAnnouncementRead] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newChatKey, setNewChatKey] = useState(0);
  const [authChecked, setAuthChecked] = useState(true);
  const [authValid, setAuthValid] = useState(() => {
    // Electron + clawparrot mode without gateway key → need login. Other cases pass.
    if (!(window as any).electronAPI?.isElectron) return true;
    const mode = localStorage.getItem('user_mode');
    const hasGatewayKey = !!(localStorage.getItem('ANTHROPIC_API_KEY') && localStorage.getItem('gateway_user'));
    return !(mode === 'clawparrot' && !hasGatewayKey);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('onboarding_done'));
  const [needsGitBash, setNeedsGitBash] = useState(false);

  // Check for git-bash on Windows (required by Claude Code SDK)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await getSystemStatus();
        if (cancelled) return;
        if (status.gitBash.required && !status.gitBash.found) {
          setNeedsGitBash(true);
        }
      } catch {
        // Bridge server not ready yet — retry shortly
        if (!cancelled) setTimeout(check, 1500);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // Document panel state
  const [documentPanelDoc, setDocumentPanelDoc] = useState<DocumentInfo | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<DocumentInfo[]>([]);
  const [documentPanelWidth, setDocumentPanelWidth] = useState(62); // wider by default so HTML previews are closer to desktop width
  const [isChatMode, setIsChatMode] = useState(false);
  const [currentChatTitle, setCurrentChatTitle] = useState('');
  const sidebarWasCollapsedRef = useRef(false);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const appMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Detect macOS for traffic light padding
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getPlatform) {
      api.getPlatform().then((p: string) => setIsMac(p === 'darwin'));
    }
  }, []);

  // Title bar height adjusts inversely to zoom so it stays visually constant
  const [titleBarHeight, setTitleBarHeight] = useState(44);
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onZoomChanged) {
      api.onZoomChanged((factor: number) => {
        setTitleBarHeight(Math.round(44 / factor));
      });
    }
  }, []);

  useEffect(() => {
    if (!showAppMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        appMenuRef.current &&
        !appMenuRef.current.contains(event.target as Node) &&
        appMenuButtonRef.current &&
        !appMenuButtonRef.current.contains(event.target as Node)
      ) {
        setShowAppMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAppMenu]);

  const location = useLocation();
  const navigate = useNavigate();
  const [desktopTabs, setDesktopTabs] = useState<DesktopWorkspaceTab[]>(() => {
    const saved = readStoredDesktopTabs();
    if (saved.length > 0) return saved;
    const tabId = makeDesktopTabId();
    return [buildDesktopWorkspaceTab('chat', withDesktopTabQuery('/', '', tabId), '新聊天', tabId)];
  });
  const [activeDesktopTabId, setActiveDesktopTabId] = useState(() => localStorage.getItem(DESKTOP_ACTIVE_TAB_STORAGE_KEY) || '');
  const [desktopTabMenu, setDesktopTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [renamingDesktopTabId, setRenamingDesktopTabId] = useState<string | null>(null);
  const [desktopTabRenameValue, setDesktopTabRenameValue] = useState('');
  const [draggedDesktopTabId, setDraggedDesktopTabId] = useState<string | null>(null);
  const [dragOverDesktopTabId, setDragOverDesktopTabId] = useState<string | null>(null);
  const isCodeRoute = location.pathname === '/code';
  const isCoworkRoute = location.pathname === '/cowork';
  const isChatRoute = !isCodeRoute && !isCoworkRoute;
  const currentDesktopTabId = useMemo(() => new URLSearchParams(location.search).get('tab') || '', [location.search]);
  const visibleDesktopTabs = useMemo(() => sortDesktopTabsForDisplay(desktopTabs), [desktopTabs]);
  const desktopTabStripRef = useRef<HTMLDivElement>(null);
  const desktopTabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const closeTransientPanels = useCallback(() => {
    setShowSettings(false);
    setShowUpgrade(false);
    setDocumentPanelDoc(null);
    setShowArtifacts(false);
  }, []);

  useEffect(() => {
    setShowAppMenu(false);
  }, [location.pathname, showSettings, showUpgrade]);

  useEffect(() => {
    if (!desktopTabMenu) return;
    const closeMenu = () => setDesktopTabMenu(null);
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [desktopTabMenu]);

  useEffect(() => {
    const activeTabId = currentDesktopTabId || activeDesktopTabId;
    if (!activeTabId) return;
    const strip = desktopTabStripRef.current;
    const node = desktopTabRefs.current[activeTabId];
    if (!strip || !node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [currentDesktopTabId, activeDesktopTabId, visibleDesktopTabs.map((tab) => `${tab.id}:${tab.pinned ? 1 : 0}`).join('|')]);

  // Navigation history for back/forward buttons
  const [navHistory, setNavHistory] = useState<string[]>([location.pathname + location.search + location.hash]);
  const [navIndex, setNavIndex] = useState(0);
  const isNavAction = useRef(false);

  useEffect(() => {
    const fullPath = location.pathname + location.search;
    if (isNavAction.current) {
      isNavAction.current = false;
      return;
    }
    setNavHistory(prev => {
      const trimmed = prev.slice(0, navIndex + 1);
      if (trimmed[trimmed.length - 1] === fullPath) return trimmed;
      return [...trimmed, fullPath];
    });
    setNavIndex(prev => {
      const trimmed = navHistory.slice(0, prev + 1);
      if (trimmed[trimmed.length - 1] === fullPath) return prev;
      return trimmed.length;
    });
  }, [location.pathname, location.search]);

  const canGoBack = navIndex > 0;
  const canGoForward = navIndex < navHistory.length - 1;

  const handleNavBack = () => {
    if (!canGoBack) return;
    isNavAction.current = true;
    const newIndex = navIndex - 1;
    setNavIndex(newIndex);
    navigate(navHistory[newIndex]);
  };

  const handleNavForward = () => {
    if (!canGoForward) return;
    isNavAction.current = true;
    const newIndex = navIndex + 1;
    setNavIndex(newIndex);
    navigate(navHistory[newIndex]);
  };

  useEffect(() => {
    localStorage.setItem(DESKTOP_TABS_STORAGE_KEY, JSON.stringify(desktopTabs.slice(0, 12)));
  }, [desktopTabs]);

  useEffect(() => {
    if (activeDesktopTabId) {
      localStorage.setItem(DESKTOP_ACTIVE_TAB_STORAGE_KEY, activeDesktopTabId);
    }
  }, [activeDesktopTabId]);

  useEffect(() => {
    if (!isDesktopWorkspacePath(location.pathname)) return;

    const syncedTabId = currentDesktopTabId || activeDesktopTabId || makeDesktopTabId();
    const ensuredPath = withDesktopTabQuery(location.pathname, location.search, syncedTabId);
    const fullPath = `${location.pathname}${location.search}`;
    if (fullPath !== ensuredPath) {
      startTransition(() => {
        navigate(ensuredPath, { replace: true });
      });
      return;
    }

    const mode = getDesktopTabModeFromPath(location.pathname);
    const title = getDesktopTabTitle(mode, location.pathname, mode === 'chat' ? currentChatTitle : undefined);
    setActiveDesktopTabId(syncedTabId);
    setDesktopTabs((current) => {
      const existing = current.find((tab) => tab.id === syncedTabId);
      if (!existing) {
        return [...current, buildDesktopWorkspaceTab(mode, ensuredPath, title, syncedTabId)];
      }
      return current.map((tab) =>
        tab.id === syncedTabId
          ? {
              ...tab,
              mode,
              path: ensuredPath,
              title: mode === 'chat' && currentChatTitle.trim() ? currentChatTitle : title,
              updatedAt: Date.now(),
            }
          : tab,
      );
    });
  }, [location.pathname, location.search, currentDesktopTabId, activeDesktopTabId, currentChatTitle, navigate]);

  useEffect(() => {
    if (!currentDesktopTabId) return;
    const mode = getDesktopTabModeFromPath(location.pathname);
    const nextTitle = getDesktopTabTitle(mode, location.pathname, mode === 'chat' ? currentChatTitle : undefined);
    setDesktopTabs((current) =>
      current.map((tab) =>
        tab.id === currentDesktopTabId
          ? {
              ...tab,
              title: nextTitle,
              updatedAt: Date.now(),
            }
          : tab,
      ),
    );
  }, [currentDesktopTabId, currentChatTitle, location.pathname]);

  useEffect(() => {
    if (!isDesktopWorkspacePath(location.pathname) || getDesktopTabModeFromPath(location.pathname) !== 'chat') return;
    setCurrentChatTitle('');
  }, [location.pathname, currentDesktopTabId]);

  const openDesktopTab = useCallback((tab: DesktopWorkspaceTab) => {
    closeTransientPanels();
    setDesktopTabMenu(null);
    setActiveDesktopTabId(tab.id);
    startTransition(() => {
      navigate(tab.path);
    });
  }, [closeTransientPanels, navigate]);

  const createDesktopTab = useCallback((mode: DesktopTabMode) => {
    closeTransientPanels();
    setDesktopTabMenu(null);
    const tabId = makeDesktopTabId();
    const targetPath = withDesktopTabQuery(getDesktopDefaultPath(mode), '', tabId);
    const nextTab = buildDesktopWorkspaceTab(mode, targetPath, getDesktopTabTitle(mode, getDesktopDefaultPath(mode)), tabId);
    setDesktopTabs((current) => [...current, nextTab]);
    setActiveDesktopTabId(tabId);
    if (mode === 'chat') {
      setNewChatKey((prev) => prev + 1);
      setRefreshTrigger((prev) => prev + 1);
    }
    startTransition(() => {
      navigate(targetPath);
    });
  }, [closeTransientPanels, navigate]);

  const switchDesktopMode = useCallback((mode: DesktopTabMode) => {
    closeTransientPanels();
    setDesktopTabMenu(null);
    const targetTabId = currentDesktopTabId || activeDesktopTabId;
    if (!targetTabId) {
      createDesktopTab(mode);
      return;
    }
    const targetPath = withDesktopTabQuery(getDesktopDefaultPath(mode), '', targetTabId);
    setDesktopTabs((current) => {
      const existing = current.find((tab) => tab.id === targetTabId);
      const nextTitle = getDesktopTabTitle(mode, getDesktopDefaultPath(mode));
      if (!existing) return [...current, buildDesktopWorkspaceTab(mode, targetPath, nextTitle, targetTabId)];
      return current.map((tab) =>
        tab.id === targetTabId
          ? {
              ...tab,
              mode,
              path: targetPath,
              title: nextTitle,
              updatedAt: Date.now(),
            }
          : tab,
      );
    });
    setActiveDesktopTabId(targetTabId);
    if (mode === 'chat') {
      setNewChatKey((prev) => prev + 1);
    }
    startTransition(() => {
      navigate(targetPath);
    });
  }, [closeTransientPanels, createDesktopTab, currentDesktopTabId, activeDesktopTabId, navigate]);

  const closeDesktopTab = useCallback((tabId: string) => {
    const currentTabs = desktopTabs;
    const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) return;

    const remaining = currentTabs.filter((tab) => tab.id !== tabId);
    const nextTabs = remaining.length > 0
      ? remaining
      : (() => {
          const nextId = makeDesktopTabId();
          return [buildDesktopWorkspaceTab('chat', withDesktopTabQuery('/', '', nextId), '新聊天', nextId)];
        })();
    const fallbackTab = nextTabs[Math.min(closingIndex, nextTabs.length - 1)];
    setDesktopTabs(nextTabs);

    const closingActive = (currentDesktopTabId || activeDesktopTabId) === tabId;
    if (closingActive) {
      setActiveDesktopTabId(fallbackTab.id);
      closeTransientPanels();
      startTransition(() => {
        navigate(fallbackTab.path);
      });
    }
  }, [desktopTabs, currentDesktopTabId, activeDesktopTabId, closeTransientPanels, navigate]);

  const startDesktopTabRename = useCallback((tabId: string) => {
    const targetTab = desktopTabs.find((tab) => tab.id === tabId);
    if (!targetTab) return;
    setDesktopTabMenu(null);
    setRenamingDesktopTabId(tabId);
    setDesktopTabRenameValue(getDesktopTabLabel(targetTab));
  }, [desktopTabs]);

  const submitDesktopTabRename = useCallback((tabId: string) => {
    const nextValue = desktopTabRenameValue.trim();
    setDesktopTabs((current) =>
      current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              customTitle: nextValue || undefined,
              updatedAt: Date.now(),
            }
          : tab,
      ),
    );
    setRenamingDesktopTabId(null);
    setDesktopTabRenameValue('');
  }, [desktopTabRenameValue]);

  const closeOtherDesktopTabs = useCallback((tabId: string) => {
    const targetTab = desktopTabs.find((tab) => tab.id === tabId);
    if (!targetTab) return;
    setDesktopTabMenu(null);
    setDesktopTabs([targetTab]);
    setActiveDesktopTabId(targetTab.id);
    if ((currentDesktopTabId || activeDesktopTabId) !== targetTab.id) {
      startTransition(() => {
        navigate(targetTab.path);
      });
    }
  }, [desktopTabs, currentDesktopTabId, activeDesktopTabId, navigate]);

  const closeDesktopTabsToRight = useCallback((tabId: string) => {
    const currentTabs = desktopTabs;
    const targetIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (targetIndex < 0 || targetIndex === currentTabs.length - 1) {
      setDesktopTabMenu(null);
      return;
    }
    const nextTabs = currentTabs.slice(0, targetIndex + 1);
    const activeStillExists = nextTabs.some((tab) => tab.id === (currentDesktopTabId || activeDesktopTabId));
    setDesktopTabMenu(null);
    setDesktopTabs(nextTabs);
    if (!activeStillExists) {
      const fallbackTab = nextTabs[targetIndex];
      setActiveDesktopTabId(fallbackTab.id);
      startTransition(() => {
        navigate(fallbackTab.path);
      });
    }
  }, [desktopTabs, currentDesktopTabId, activeDesktopTabId, navigate]);

  const handleDesktopTabDrop = useCallback((targetTabId: string) => {
    if (!draggedDesktopTabId || draggedDesktopTabId === targetTabId) {
      setDraggedDesktopTabId(null);
      setDragOverDesktopTabId(null);
      return;
    }
    setDesktopTabs((current) => reorderDesktopWorkspaceTabGroup(current, draggedDesktopTabId, targetTabId));
    setDraggedDesktopTabId(null);
    setDragOverDesktopTabId(null);
  }, [draggedDesktopTabId]);

  const toggleDesktopTabPinned = useCallback((tabId: string) => {
    setDesktopTabMenu(null);
    setDesktopTabs((current) => {
      const target = current.find((tab) => tab.id === tabId);
      if (!target) return current;

      const updated = current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              pinned: !tab.pinned,
              updatedAt: Date.now(),
            }
          : tab,
      );

      const nextTarget = updated.find((tab) => tab.id === tabId);
      if (!nextTarget) return updated;

      const rest = updated.filter((tab) => tab.id !== tabId);
      if (nextTarget.pinned) {
        const insertIndex = rest.findIndex((tab) => !tab.pinned);
        if (insertIndex < 0) return [...rest, nextTarget];
        return [...rest.slice(0, insertIndex), nextTarget, ...rest.slice(insertIndex)];
      }

      const lastPinnedIndex = rest.reduce((acc, tab, index) => (tab.pinned ? index : acc), -1);
      return [...rest.slice(0, lastPinnedIndex + 1), nextTarget, ...rest.slice(lastPinnedIndex + 1)];
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key === 'Tab') {
        event.preventDefault();
        const currentId = currentDesktopTabId || activeDesktopTabId;
        const tabs = visibleDesktopTabs;
        if (tabs.length <= 1) return;
        const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = currentIndex < 0
          ? 0
          : (currentIndex + delta + tabs.length) % tabs.length;
        openDesktopTab(tabs[nextIndex]);
        return;
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        createDesktopTab('chat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDesktopTabId, activeDesktopTabId, visibleDesktopTabs, openDesktopTab, createDesktopTab]);

  useEffect(() => {
    closeTransientPanels();
  }, [location.pathname, location.search, closeTransientPanels]);

  // Listen for open-upgrade event from MainContent paywall
  useEffect(() => {
    const handler = () => { setShowUpgrade(true); setShowSettings(false); };
    window.addEventListener('open-upgrade', handler);
    return () => window.removeEventListener('open-upgrade', handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: string }>).detail;
      if (detail?.section) {
        localStorage.setItem('settings_section', detail.section);
      }
      setShowSettings(true);
      setShowUpgrade(false);
    };
    window.addEventListener('open-settings', handler as EventListener);
    return () => window.removeEventListener('open-settings', handler as EventListener);
  }, []);

  // Collapse sidebar on Customize page (Removed per user request)
  useEffect(() => {
    // Intentionally empty: do not collapse left sidebar automatically
  }, [location.pathname]);

  const isElectron = !!(window as any).electronAPI?.isElectron;
  // Electron auth rule: clawparrot users must login before entering the main UI
  // (登录页会提示去 clawparrot.com 注册, 也提供"跳过登录"按钮切到 selfhosted).
  // selfhosted users skip the login page entirely.
  useEffect(() => {
    if (!isElectron) return;
    const mode = localStorage.getItem('user_mode');
    const hasGatewayKey = !!(localStorage.getItem('ANTHROPIC_API_KEY') && localStorage.getItem('gateway_user'));
    setAuthValid(!(mode === 'clawparrot' && !hasGatewayKey));
  }, [isElectron]);

  const loadUnreadAnnouncements = useCallback(async () => {
    try {
      const data = await getUnreadAnnouncements();
      setUnreadAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404')) {
        setUnreadAnnouncements([]);
        return;
      }
      console.error('Failed to fetch announcements:', err);
    }
  }, []);

  useEffect(() => {
    if (!authValid) return;

    loadUnreadAnnouncements();

    const intervalId = window.setInterval(() => {
      loadUnreadAnnouncements();
    }, 15000);

    const handleFocus = () => {
      loadUnreadAnnouncements();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnreadAnnouncements();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authValid, loadUnreadAnnouncements]);

  useEffect(() => {
    if (unreadAnnouncements.length === 0) {
      if (activeAnnouncementId !== null) setActiveAnnouncementId(null);
      return;
    }

    if (activeAnnouncementId === null || !unreadAnnouncements.some(item => item.id === activeAnnouncementId)) {
      setActiveAnnouncementId(unreadAnnouncements[0].id);
    }
  }, [unreadAnnouncements, activeAnnouncementId]);

  const activeAnnouncement = unreadAnnouncements.find(item => item.id === activeAnnouncementId) || null;

  const handleAnnouncementRead = useCallback(async () => {
    if (!activeAnnouncement || isMarkingAnnouncementRead) return;

    setIsMarkingAnnouncementRead(true);
    try {
      await markAnnouncementRead(activeAnnouncement.id);
      setUnreadAnnouncements(prev => prev.filter(item => item.id !== activeAnnouncement.id));
    } catch (err: any) {
      alert(err?.message || '公告已读失败，请稍后重试');
    } finally {
      setIsMarkingAnnouncementRead(false);
    }
  }, [activeAnnouncement, isMarkingAnnouncementRead]);

  const refreshSidebar = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewChat = () => {
    createDesktopTab('chat');
  };

  const handleOpenDocument = useCallback((doc: DocumentInfo) => {
    if (!documentPanelDoc && !showArtifacts) {
      sidebarWasCollapsedRef.current = isSidebarCollapsed;
    }
    setShowArtifacts(false);
    setIsSidebarCollapsed(true);
    setDocumentPanelDoc(doc);
  }, [isSidebarCollapsed, documentPanelDoc, showArtifacts]);

  const handleCloseDocument = useCallback(() => {
    setDocumentPanelDoc(null);
    if (!showArtifacts) {
      setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
    }
  }, [showArtifacts]);

  const handleArtifactsUpdate = useCallback((docs: DocumentInfo[]) => {
    setArtifacts(docs);
  }, []);

  const handleOpenArtifacts = useCallback(() => {
    if (showArtifacts) {
      setShowArtifacts(false);
      // Restore sidebar state if it was collapsed by us?
      // For now, simple toggle close.
      if (!documentPanelDoc) {
        setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
      }
      return;
    }

    if (!documentPanelDoc) {
      sidebarWasCollapsedRef.current = isSidebarCollapsed;
    }
    setIsSidebarCollapsed(true);
    setShowArtifacts(true);
    setDocumentPanelDoc(null);
  }, [isSidebarCollapsed, documentPanelDoc, showArtifacts]);

  const handleCloseArtifacts = useCallback(() => {
    setShowArtifacts(false);
    setIsSidebarCollapsed(sidebarWasCollapsedRef.current);
  }, []);

  const handleChatModeChange = useCallback((isChat: boolean) => {
    setIsChatMode(isChat);
  }, []);

  const handleTitleChange = useCallback((title: string) => {
    setCurrentChatTitle(title);
  }, []);

  // Layout Tuner State
  const [tunerConfig, setTunerConfig] = useState({
    sidebarWidth: 288, // tuned value
    recentsMt: 24,
    profilePy: 10,
    profilePx: 12,
    mainContentWidth: 773, // tuned value
    mainContentMt: -100,
    inputRadius: 24,
    welcomeSize: 46,
    welcomeMb: 34,

    recentsFontSize: 14,
    recentsItemPy: 7,
    recentsPl: 6,
    userAvatarSize: 36,
    userNameSize: 15,
    headerPy: 0,

    // Toggle Button (Independent Position)
    toggleSize: 28,
    toggleAbsRight: 10,
    toggleAbsTop: 11,
    toggleAbsLeft: 8, // Collapsed State Left Position
  });

  // Git-bash required (Windows): block app until installed
  if (needsGitBash) {
    return <GitBashRequiredModal onResolved={() => setNeedsGitBash(false)} />;
  }

  // Onboarding: show on first launch
  if (showOnboarding) {
    return <Onboarding onComplete={() => {
      setShowOnboarding(false);
      if (!isElectron) { setAuthValid(true); return; }
      // clawparrot users go straight to /login (Onboarding also opens clawparrot.com
      // in the browser so they can register). selfhosted users enter the main UI.
      const mode = localStorage.getItem('user_mode');
      const hasGatewayKey = !!(localStorage.getItem('ANTHROPIC_API_KEY') && localStorage.getItem('gateway_user'));
      setAuthValid(!(mode === 'clawparrot' && !hasGatewayKey));
    }} />;
  }

  // Guard: check if logged in
  if (!authChecked) {
    return null; // 验证中，不渲染
  }
  if (!authValid) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <div className="relative flex w-full h-screen overflow-hidden bg-claude-bg font-sans antialiased">
        {/* Custom Solid Title Bar (Unified Full Width) */}
        <div
          className="absolute top-0 left-0 w-full z-50 flex items-center select-none pointer-events-none bg-claude-bg border-b border-claude-border transition-all duration-300"
          style={{ WebkitAppRegion: 'drag', height: `${titleBarHeight}px` } as React.CSSProperties}
        >
          {/* Left Controls inside Title Bar — extra padding on Mac for traffic lights */}
          <div
            className="h-full flex items-center pr-2 gap-0.5"
            style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag', paddingLeft: isMac ? '78px' : '4px' } as React.CSSProperties}
          >
            <Tooltip text="Menu">
              <button
                ref={appMenuButtonRef}
                onClick={() => setShowAppMenu((prev) => !prev)}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-claude-textSecondary hover:text-claude-text transition-colors"
              >
                <Menu size={18} className="opacity-80" />
              </button>
            </Tooltip>
            <Tooltip text={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-claude-textSecondary hover:text-claude-text transition-colors"
              >
                <IconSidebarToggle size={26} className="dark:invert transition-[filter] duration-200" />
              </button>
            </Tooltip>
            {canGoBack ? (
              <Tooltip text="Back">
                <button
                  onClick={handleNavBack}
                  className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: '#73726C' }}
                >
                  <ArrowLeft size={16} strokeWidth={1.5} />
                </button>
              </Tooltip>
            ) : (
              <span className="p-1.5" style={{ color: '#B7B5B0' }}>
                <ArrowLeft size={16} strokeWidth={1.5} />
              </span>
            )}
            {canGoForward ? (
              <Tooltip text="Forward">
                <button
                  onClick={handleNavForward}
                  className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: '#73726C' }}
                >
                  <ArrowRight size={16} strokeWidth={1.5} />
                </button>
              </Tooltip>
            ) : (
              <span className="p-1.5" style={{ color: '#B7B5B0' }}>
                <ArrowRight size={16} strokeWidth={1.5} />
              </span>
            )}
            {showAppMenu && (
              <div
                ref={appMenuRef}
                className="absolute left-2 top-[46px] z-[80] w-[240px] overflow-hidden rounded-2xl border border-claude-border bg-claude-input p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <button
                  onClick={() => {
                    setShowAppMenu(false);
                    handleNewChat();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <MessageSquarePlus size={16} className="text-claude-textSecondary" />
                  新建聊天
                </button>
                <button
                  onClick={() => {
                    setShowAppMenu(false);
                    setIsSidebarCollapsed((prev) => !prev);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  {isSidebarCollapsed ? <PanelLeftOpen size={16} className="text-claude-textSecondary" /> : <PanelLeftClose size={16} className="text-claude-textSecondary" />}
                  {isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                </button>
                <button
                  onClick={() => {
                    setShowAppMenu(false);
                    setShowSettings(true);
                    setShowUpgrade(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <Settings size={16} className="text-claude-textSecondary" />
                  设置
                </button>
                <button
                  onClick={() => {
                    setShowAppMenu(false);
                    setShowSupportModal(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <HelpCircle size={16} className="text-claude-textSecondary" />
                  售后支持
                </button>
              </div>
            )}
          </div>

          {/* Center Mode Tabs */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center rounded-xl p-0.5"
            style={{ pointerEvents: 'auto', WebkitAppRegion: 'no-drag', backgroundColor: 'var(--bg-mode-tabs)' } as React.CSSProperties}
          >
            <Tooltip text="Chat" shortcut="Ctrl+1">
              <button
                onClick={() => switchDesktopMode('chat')}
                className={`px-3.5 py-1 text-[13px] font-medium rounded-[10px] transition-colors ${isChatRoute ? 'text-claude-text shadow-sm' : 'text-claude-textSecondary hover:text-claude-text'}`}
                style={{ backgroundColor: isChatRoute ? 'var(--bg-mode-tab-active)' : 'transparent', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', letterSpacing: '0.01em' }}
              >
                聊天
              </button>
            </Tooltip>
            <Tooltip text="Cowork" shortcut="Ctrl+2">
              <button
                onClick={() => switchDesktopMode('cowork')}
                className={`px-3.5 py-1 text-[13px] font-medium rounded-[10px] transition-colors ${isCoworkRoute ? 'text-claude-text shadow-sm' : 'text-claude-textSecondary hover:text-claude-text'}`}
                style={{ backgroundColor: isCoworkRoute ? 'var(--bg-mode-tab-active)' : 'transparent', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', letterSpacing: '0.01em' }}
              >
                协作
              </button>
            </Tooltip>
            <Tooltip text="Code" shortcut="Ctrl+3">
              <button
                onClick={() => switchDesktopMode('code')}
                className={`px-3.5 py-1 text-[13px] font-medium rounded-[10px] transition-colors ${isCodeRoute ? 'text-claude-text shadow-sm' : 'text-claude-textSecondary hover:text-claude-text'}`}
                style={{ backgroundColor: isCodeRoute ? 'var(--bg-mode-tab-active)' : 'transparent', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', letterSpacing: '0.01em' }}
              >
                代码
              </button>
            </Tooltip>
          </div>
        </div>

        <Sidebar
          isCollapsed={isSidebarCollapsed}
          toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          refreshTrigger={refreshTrigger}
          onNewChatClick={handleNewChat}
          onOpenSettings={() => { setShowSettings(true); setShowUpgrade(false); }}
          onOpenUpgrade={() => { setShowUpgrade(true); setShowSettings(false); }}
          onCloseOverlays={() => { setShowSettings(false); setShowUpgrade(false); }}
          tunerConfig={tunerConfig}
          setTunerConfig={setTunerConfig}
        />

        {/* Unified Content Wrapper - takes remaining space after sidebar */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative" style={{ paddingTop: `${titleBarHeight}px` }}>
          <div className="flex h-[44px] items-center gap-2 border-b border-claude-border bg-claude-bg px-3">
            <div ref={desktopTabStripRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {visibleDesktopTabs.map((tab) => {
                const isActive = tab.id === (currentDesktopTabId || activeDesktopTabId);
                const Icon = tab.mode === 'code' ? Code2 : tab.mode === 'cowork' ? UsersRound : MessageSquareText;
                return (
                  <div
                    key={tab.id}
                    ref={(node) => {
                      desktopTabRefs.current[tab.id] = node;
                    }}
                    draggable
                    onDragStart={() => setDraggedDesktopTabId(tab.id)}
                    onDragEnd={() => {
                      setDraggedDesktopTabId(null);
                      setDragOverDesktopTabId(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverDesktopTabId(tab.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverDesktopTabId === tab.id) {
                        setDragOverDesktopTabId(null);
                      }
                    }}
                    onDrop={() => handleDesktopTabDrop(tab.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setDesktopTabMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                    }}
                    className={`group flex min-w-0 max-w-[260px] items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-all duration-150 ${
                      isActive
                        ? 'border-[#2E7CF6]/45 bg-[#2E7CF6]/12 text-claude-text shadow-sm'
                        : 'border-transparent bg-claude-input text-claude-textSecondary hover:border-claude-border hover:text-claude-text'
                    } ${draggedDesktopTabId === tab.id ? 'scale-[0.98] opacity-60 shadow-none' : ''} ${dragOverDesktopTabId === tab.id && draggedDesktopTabId !== tab.id ? 'border-[#2E7CF6]/55 shadow-[0_0_0_1px_rgba(46,124,246,0.28)]' : ''}`}
                  >
                    <button
                      onClick={() => openDesktopTab(tab)}
                      onDoubleClick={() => startDesktopTabRename(tab.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {tab.pinned && <Star size={12} className="flex-shrink-0 text-amber-300" />}
                      <Icon size={14} className={isActive ? 'text-[#6EA8FF]' : 'text-claude-textSecondary'} />
                      {renamingDesktopTabId === tab.id ? (
                        <input
                          autoFocus
                          value={desktopTabRenameValue}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setDesktopTabRenameValue(event.target.value)}
                          onBlur={() => submitDesktopTabRename(tab.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              submitDesktopTabRename(tab.id);
                            } else if (event.key === 'Escape') {
                              setRenamingDesktopTabId(null);
                              setDesktopTabRenameValue('');
                            }
                          }}
                          className="w-full min-w-0 rounded-md border border-[#2E7CF6]/45 bg-transparent px-1.5 py-0.5 text-[13px] font-medium text-claude-text outline-none"
                        />
                      ) : (
                        <span className="truncate text-[13px] font-medium">{getDesktopTabLabel(tab)}</span>
                      )}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        closeDesktopTab(tab.id);
                      }}
                      className="ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-claude-textSecondary opacity-0 transition-opacity hover:bg-black/5 hover:text-claude-text group-hover:opacity-100 dark:hover:bg-white/5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <Tooltip text="New workspace tab" shortcut="Ctrl+T">
              <button
                onClick={() => createDesktopTab('chat')}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-claude-border bg-claude-input text-claude-textSecondary transition-colors hover:text-claude-text"
              >
                <Plus size={15} />
              </button>
            </Tooltip>
          </div>
          {desktopTabMenu && (() => {
            const menuTab = desktopTabs.find((tab) => tab.id === desktopTabMenu.tabId);
            if (!menuTab) return null;
            return (
              <div
                className="fixed z-[120] w-[220px] overflow-hidden rounded-2xl border border-claude-border bg-claude-input p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
                style={{ left: Math.max(12, desktopTabMenu.x - 8), top: Math.max(12, desktopTabMenu.y + 4) }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => startDesktopTabRename(menuTab.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <Pencil size={15} className="text-claude-textSecondary" />
                  重命名标签
                </button>
                <button
                  onClick={() => toggleDesktopTabPinned(menuTab.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <Star size={15} className="text-claude-textSecondary" />
                  {menuTab.pinned ? '取消固定标签' : '固定标签'}
                </button>
                <button
                  onClick={() => createDesktopTab(menuTab.mode)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <Plus size={15} className="text-claude-textSecondary" />
                  新建同类标签
                </button>
                <div className="my-1 h-px bg-claude-border" />
                <button
                  onClick={() => closeOtherDesktopTabs(menuTab.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <PanelLeftOpen size={15} className="text-claude-textSecondary" />
                  关闭其他标签
                </button>
                <button
                  onClick={() => closeDesktopTabsToRight(menuTab.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-claude-text hover:bg-claude-hover"
                >
                  <ArrowRight size={15} className="text-claude-textSecondary" />
                  关闭右侧标签
                </button>
                <div className="my-1 h-px bg-claude-border" />
                <button
                  onClick={() => closeDesktopTab(menuTab.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#C6613F] hover:bg-[#C6613F]/10"
                >
                  <Trash size={15} className="text-[#C6613F]" />
                  关闭标签
                </button>
              </div>
            );
          })()}

          {/* Header - moved to allow conditional placement (Full Width Mode) */}
          {isChatMode && (showArtifacts && !documentPanelDoc) && !showSettings && !showUpgrade && (
            <ChatHeader
              title={currentChatTitle}
              showArtifacts={showArtifacts}
              documentPanelDoc={documentPanelDoc}
              onOpenArtifacts={handleOpenArtifacts}
              hasArtifacts={artifacts.length > 0}
              onTitleRename={handleTitleChange}
            />
          )}

          <div className="flex-1 flex overflow-hidden relative" ref={contentContainerRef}>

            {/* Main Content Area - takes remaining width after panel */}
            <div className="flex-1 flex flex-col h-full min-w-0">
              {/* Header - Only render here if NOT in Artifacts-only mode */}
              {isChatMode && (!showArtifacts || documentPanelDoc) && !showSettings && !showUpgrade && location.pathname !== '/chats' && location.pathname !== '/customize' && location.pathname !== '/projects' && location.pathname !== '/artifacts' && location.pathname !== '/code' && location.pathname !== '/cowork' && (
                <ChatHeader
                  title={currentChatTitle}
                  showArtifacts={showArtifacts}
                  documentPanelDoc={documentPanelDoc}
                  onOpenArtifacts={handleOpenArtifacts}
                  hasArtifacts={artifacts.length > 0}
                  onTitleRename={handleTitleChange}
                />
              )}

              {showSettings ? (
                <SettingsPage onClose={() => setShowSettings(false)} />
              ) : showUpgrade ? (
                <UpgradePlan onClose={() => setShowUpgrade(false)} />
              ) : location.pathname === '/chats' ? (
                <ChatsPage />
              ) : location.pathname === '/customize' ? (
                <CustomizePage onCreateWithClaude={() => {
                  sessionStorage.setItem('prefill_input', '让我们一起使用你的 skill-creator skill 来创建一个 skill 吧。请先问我这个 skill 应该做什么。');
                  handleNewChat();
                  window.location.hash = '#/';
                }} />
              ) : location.pathname === '/projects' ? (
                <ProjectsPage />
              ) : location.pathname === '/cowork' ? (
                <CoworkPage key={`cowork-${currentDesktopTabId || 'default'}`} desktopTabId={currentDesktopTabId || activeDesktopTabId || undefined} />
              ) : location.pathname === '/code' ? (
                <PageErrorBoundary
                  fallback={(
                    <div className="flex h-full items-center justify-center bg-claude-bg px-6">
                      <div className="max-w-[520px] rounded-2xl border border-claude-border bg-claude-input px-6 py-5 text-center shadow-xl">
                        <div className="text-[18px] font-semibold text-claude-text">Code 页面加载失败</div>
                        <div className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                          代码工作区遇到了渲染错误。现在已经加了兜底保护，你可以返回聊天继续使用，或刷新后重试。
                        </div>
                      </div>
                    </div>
                  )}
                >
                  <CodePage key={`code-${currentDesktopTabId || 'default'}`} desktopTabId={currentDesktopTabId || activeDesktopTabId || undefined} />
                </PageErrorBoundary>
              ) : location.pathname === '/artifacts' ? (
                <ArtifactsPage onTryPrompt={(prompt) => {
                  if (prompt === '__remix__') {
                    // Remix mode: artifact data already in sessionStorage
                    sessionStorage.setItem('artifact_prompt', '__remix__');
                  } else {
                    sessionStorage.setItem('artifact_prompt', prompt);
                  }
                  handleNewChat();
                  window.location.hash = '#/';
                }} />
              ) : (
                <MainContent
                  key={`chat-${currentDesktopTabId || location.pathname}`}
                  onNewChat={refreshSidebar}
                  resetKey={newChatKey}
                  tunerConfig={tunerConfig}
                  onOpenDocument={handleOpenDocument}
                  onArtifactsUpdate={handleArtifactsUpdate}
                  onOpenArtifacts={handleOpenArtifacts}
                  onTitleChange={handleTitleChange}
                  onChatModeChange={handleChatModeChange}
                  desktopTabId={currentDesktopTabId || activeDesktopTabId || undefined}
                />
              )}
            </div>

            {/* Animated Document Panel Container */}
            <div
              className={`h-full bg-claude-bg transition-all duration-300 ease-out flex z-20 relative ${(documentPanelDoc || showArtifacts) ? 'border-l border-claude-border' : ''}`}
              style={{
                width: documentPanelDoc ? `${documentPanelWidth}%` : showArtifacts ? '360px' : '0px',
                opacity: (documentPanelDoc || showArtifacts) ? 1 : 0,
                overflow: 'hidden'
              }}
            >
              {documentPanelDoc && (
                <div className="absolute left-0 top-0 bottom-0 h-full z-50">
                  <DraggableDivider onResize={setDocumentPanelWidth} containerRef={contentContainerRef} />
                </div>
              )}
              <div className={`w-full h-full flex relative min-w-0 overflow-hidden`}>
                {(documentPanelDoc || showArtifacts) && (
                  <>
                    {documentPanelDoc ? (
                      <DocumentPanel document={documentPanelDoc} onClose={handleCloseDocument} />
                    ) : (
                      <ArtifactsPanel
                        documents={artifacts}
                        onClose={handleCloseArtifacts}
                        onOpenDocument={handleOpenDocument}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
      {showSupportModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowSupportModal(false)}>
          <div
            className="w-full max-w-[360px] rounded-2xl border border-claude-border bg-claude-input p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-[16px] font-semibold text-claude-text">售后支持</h3>
            <p className="mb-3 text-[14px] text-claude-textSecondary">售后 QQ：</p>
            <div className="mb-6 rounded-xl bg-claude-btn-hover px-4 py-3 text-center text-[20px] font-semibold tracking-wide text-claude-text select-all">
              2592056451
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSupportModal(false)}
                className="rounded-lg bg-claude-btn-hover px-4 py-2 text-[13px] text-claude-text hover:bg-claude-hover transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {activeAnnouncement && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1F1F1F] shadow-2xl border border-black/5 dark:border-white/10">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-white/10">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300 flex items-center justify-center shrink-0">
                <BellRing size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[18px] font-semibold text-gray-900 dark:text-white break-words">{activeAnnouncement.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  系统公告 · {activeAnnouncement.created_at?.slice(0, 16).replace('T', ' ') || ''}
                </p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-700 dark:text-gray-200">
                {activeAnnouncement.content}
              </div>
              <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                点击右下角“已读”后，后续将不再重复弹出这条公告。
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-white/10">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {unreadAnnouncements.length > 1 ? `还有 ${unreadAnnouncements.length - 1} 条未读公告` : '暂无其他未读公告'}
              </div>
              <button
                onClick={handleAnnouncementRead}
                disabled={isMarkingAnnouncementRead}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMarkingAnnouncementRead ? '处理中...' : '已读'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const App = () => {
  useClientLanguageText();

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="keys" element={<AdminKeyPool />} />
          <Route path="models" element={<AdminModels />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="redemption" element={<AdminRedemption />} />
        </Route>
        <Route path="/" element={<Layout />} />
        <Route path="/chats" element={<Layout />} />
        <Route path="/customize" element={<Layout />} />
        <Route path="/projects" element={<Layout />} />
        <Route path="/cowork" element={<Layout />} />
        <Route path="/code" element={<Layout />} />
        <Route path="/artifacts" element={<Layout />} />
        <Route path="/chat/:id" element={<Layout />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
