
export type TabId = 'today' | 'icebox' | 'projects';

interface Tab {
  id: TabId;
  label: string;
  badge?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <nav style={{
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      background: '#FBFAF9',
      padding: '12px 16px',
    }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: isActive ? '8px 20px' : '8px 16px',
              cursor: 'pointer',
              background: isActive ? '#EA6657' : 'transparent',
              border: isActive ? '1px solid #EA6657' : '1px solid transparent',
              borderRadius: '999px',
              fontSize: '14px',
              color: isActive ? '#fff' : '#1D212B',
              fontWeight: isActive ? 700 : 500,
              fontFamily: 'inherit',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                background: isActive ? '#fff' : '#EA6657',
                color: isActive ? '#EA6657' : '#fff',
                fontSize: '10px',
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: '9999px',
                marginLeft: '6px',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
