import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { TabBar } from './components/shared/TabBar';
import type { TabId } from './components/shared/TabBar';
import { useIceboxedTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { ToastProvider, useToast } from './components/shared/Toast';

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

  const tabs = [
    { id: 'today' as TabId, label: 'Today' },
    { id: 'icebox' as TabId, label: 'Icebox', badge: iceboxTasks.length },
    { id: 'projects' as TabId, label: 'Projects' },
  ];

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'projects') setOpenProjectId(null);
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
          {user.isAdmin && (
            <button onClick={() => setShowAdmin(true)} style={headerBtn} title="Manage invite codes">
              Invites
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{user.email}</span>
          <button onClick={signOut} style={headerBtn}>
            Sign Out
          </button>
        </div>
      </div>

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
