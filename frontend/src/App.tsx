import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query';
import { TabBar } from './components/shared/TabBar';
import type { TabId } from './components/shared/TabBar';
import { SideDrawer } from './components/shared/SideDrawer';
import { useIceboxedTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import { ToastProvider, useToast } from './components/shared/Toast';
import { useIsMobile } from './hooks/useViewport';

const TodayView = lazy(() => import('./components/TodayView/TodayView').then(module => ({ default: module.TodayView })));
const IceboxView = lazy(() => import('./components/IceboxView/IceboxView').then(module => ({ default: module.IceboxView })));
const InvestmentListView = lazy(() => import('./components/InvestmentsView/InvestmentListView').then(module => ({ default: module.InvestmentListView })));
const InvestmentDetailView = lazy(() => import('./components/InvestmentsView/InvestmentDetailView').then(module => ({ default: module.InvestmentDetailView })));
const Login = lazy(() => import('./components/Auth/Login').then(module => ({ default: module.Login })));
const AdminPanel = lazy(() => import('./components/Auth/AdminPanel').then(module => ({ default: module.AdminPanel })));

/** React Query errors routed here; set from AppContent so toasts use current showToast. */
const queryErrorSink: { current: ((error: Error) => void) | null } = { current: null };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      queryErrorSink.current?.(error as Error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      queryErrorSink.current?.(error as Error);
    },
  }),
});

function AppContent() {
  const { showToast } = useToast();

  const notifyQueryError = useCallback(
    (error: Error) => {
      showToast(error.message || 'Something went wrong');
    },
    [showToast],
  );

  useEffect(() => {
    queryErrorSink.current = notifyQueryError;
    return () => {
      queryErrorSink.current = null;
    };
  }, [notifyQueryError]);

  const { user, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('me');
  const { data: iceboxTasks = [] } = useIceboxedTasks();
  const [openInvestmentId, setOpenInvestmentId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isMobile = useIsMobile();

  const tabs = [
    { id: 'me' as TabId, label: 'Me' },
    { id: 'family' as TabId, label: 'Family' },
    { id: 'investments' as TabId, label: 'Investments' },
  ];

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'investments') setOpenInvestmentId(null);
    setShowMenu(false);
  }, []);

  const handleSignOut = () => {
    setShowMenu(false);
    signOut();
  };

  // Keyboard shortcuts: 1-3 to switch tabs
  useEffect(() => {
    const tabMap: Record<string, TabId> = { '1': 'me', '2': 'family', '3': 'investments' };
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const tab = tabMap[e.key];
      if (tab) handleTabChange(tab);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTabChange]);

  // Auth loading spinner
  if (authLoading && !user) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#ffffff',
        fontFamily: "'DM Sans', sans-serif",
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
      fontFamily: "'DM Sans', sans-serif",
      background: '#ffffff',
      color: '#1D212B',
      height: '100vh',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #E7E3DF',
        flexShrink: 0,
      }}>
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Suspense fallback={<SectionLoading />}>
          {activeTab === 'me' && <TodayView plannerScope="me" />}
          {activeTab === 'family' && <TodayView plannerScope="family" />}

          {activeTab === 'icebox' && (
            <IceboxView />
          )}

          {activeTab === 'investments' && !openInvestmentId && (
            <InvestmentListView onOpenInvestment={setOpenInvestmentId} />
          )}

          {activeTab === 'investments' && openInvestmentId && (
            <InvestmentDetailView
              investmentId={openInvestmentId}
              onBack={() => setOpenInvestmentId(null)}
            />
          )}
        </Suspense>
      </div>

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
      background: '#ffffff',
      fontFamily: "'DM Sans', sans-serif",
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
      height: '100%',
      padding: '24px 16px',
      color: '#9ca3af',
      fontSize: '14px',
      textAlign: 'center',
      boxSizing: 'border-box',
    }}>
      Loading...
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
};

const menuBtn: React.CSSProperties = {
  ...headerBtn,
  minWidth: '42px',
  textAlign: 'center',
  background: 'transparent',
  border: '1px solid #E7E3DF',
  borderRadius: '999px',
  padding: '6px 14px',
  fontSize: '18px',
  color: '#1D212B',
};

const drawerActionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  background: '#F2F0ED',
  cursor: 'pointer',
  color: '#1D212B',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'inherit',
};

const drawerBadge: React.CSSProperties = {
  background: '#EA6657',
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
