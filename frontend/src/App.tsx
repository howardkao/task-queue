import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { TabBar } from './components/shared/TabBar';
import type { TabId } from './components/shared/TabBar';
import { SideDrawer } from './components/shared/SideDrawer';
import { useIceboxedTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { ToastProvider, useToast } from './components/shared/Toast';
import { useIsMobile } from './hooks/useViewport';

const TodayView = lazy(() => import('./components/TodayView/TodayView').then(module => ({ default: module.TodayView })));
const IceboxView = lazy(() => import('./components/IceboxView/IceboxView').then(module => ({ default: module.IceboxView })));
const ProjectListView = lazy(() => import('./components/ProjectsView/ProjectListView').then(module => ({ default: module.ProjectListView })));
const ProjectDetailView = lazy(() => import('./components/ProjectsView/ProjectDetailView').then(module => ({ default: module.ProjectDetailView })));
const Login = lazy(() => import('./components/Auth/Login').then(module => ({ default: module.Login })));
const AdminPanel = lazy(() => import('./components/Auth/AdminPanel').then(module => ({ default: module.AdminPanel })));

// Global error handler ref — set by AppContent once toast is available
let globalErrorHandler: ((error: Error) => void) | null = null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      globalErrorHandler?.(error as Error);
    },
  }),
});

function AppContent() {
  const { showToast } = useToast();
  globalErrorHandler = (error: Error) => {
    showToast(error.message || 'Something went wrong');
  };

  const { user, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const { data: iceboxTasks = [] } = useIceboxedTasks();
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isMobile = useIsMobile();

  const tabs = [
    { id: 'today' as TabId, label: 'Today' },
    { id: 'projects' as TabId, label: 'Projects' },
  ];

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'projects') setOpenProjectId(null);
    setShowMenu(false);
  };

  const handleSignOut = () => {
    setShowMenu(false);
    signOut();
  };

  // Keyboard shortcuts: 1-3 to switch tabs
  useEffect(() => {
    const tabMap: Record<string, TabId> = { '1': 'today', '2': 'icebox', '3': 'projects' };
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const tab = tabMap[e.key];
      if (tab) handleTabChange(tab);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auth loading spinner
  if (authLoading && !user) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#F7F7F7',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#9ca3af', fontSize: '15px',
      }}>
        Loading...
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <Suspense fallback={<FullPageLoading />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#F7F7F7',
      color: '#1f2937',
      minHeight: '100vh',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <TabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 16px', flexShrink: 0,
        }}>
          <button
            onClick={() => setShowMenu(true)}
            style={menuBtn}
            aria-label="Open menu"
            title="Open menu"
          >
            {isMobile ? '☰' : 'Menu'}
          </button>
        </div>
      </div>

      <SideDrawer open={showMenu} onClose={() => setShowMenu(false)} title="Menu">
        <div style={{ display: 'grid', gap: '8px' }}>
          <button
            onClick={() => handleTabChange('icebox')}
            style={drawerActionBtn}
          >
            Icebox
            {iceboxTasks.length > 0 && (
              <span style={drawerBadge}>{iceboxTasks.length}</span>
            )}
          </button>

          {user.isAdmin && (
            <button
              onClick={() => {
                setShowMenu(false);
                setShowAdmin(true);
              }}
              style={drawerActionBtn}
            >
              Invites
            </button>
          )}

          <div style={{ fontSize: '12px', color: '#9ca3af', padding: '6px 4px' }}>
            {user.email}
          </div>

          <button onClick={handleSignOut} style={drawerActionBtn}>
            Sign Out
          </button>
        </div>
      </SideDrawer>

      <Suspense fallback={<SectionLoading />}>
        {activeTab === 'today' && (
          <TodayView />
        )}

        {activeTab === 'icebox' && (
          <IceboxView />
        )}

        {activeTab === 'projects' && !openProjectId && (
          <ProjectListView onOpenProject={setOpenProjectId} />
        )}

        {activeTab === 'projects' && openProjectId && (
          <ProjectDetailView
            projectId={openProjectId}
            onBack={() => setOpenProjectId(null)}
          />
        )}
      </Suspense>

      {showAdmin && (
        <Suspense fallback={null}>
          <AdminPanel onClose={() => setShowAdmin(false)} />
        </Suspense>
      )}
    </div>
  );
}

function FullPageLoading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#F7F7F7',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: '#9ca3af',
      fontSize: '15px',
    }}>
      Loading...
    </div>
  );
}

function SectionLoading() {
  return (
    <div style={{
      padding: '24px 16px',
      color: '#9ca3af',
      fontSize: '14px',
      textAlign: 'center',
    }}>
      Loading...
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
};

const menuBtn: React.CSSProperties = {
  ...headerBtn,
  minWidth: '42px',
  textAlign: 'center',
};

const drawerActionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  background: '#f9fafb',
  cursor: 'pointer',
  color: '#374151',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'inherit',
};

const drawerBadge: React.CSSProperties = {
  background: '#FF7A7A',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: '9999px',
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
