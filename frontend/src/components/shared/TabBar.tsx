
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
      gap: '8px',
      background: '#F7F7F7',
      padding: '12px 16px',
      borderBottom: '1px solid #e5e7eb',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '8px 20px',
            cursor: 'pointer',
            background: activeTab === tab.id ? '#FF7A7A' : '#f9fafb',
            border: activeTab === tab.id ? '1px solid #FF7A7A' : '1px solid #e5e7eb',
            borderRadius: '12px',
            fontSize: '15px',
            color: activeTab === tab.id ? '#fff' : '#4b5563',
            fontWeight: activeTab === tab.id ? 700 : 500,
            fontFamily: 'inherit',
            transition: 'all 0.2s ease',
          }}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span style={{
              background: activeTab === tab.id ? '#fff' : '#FF7A7A',
              color: activeTab === tab.id ? '#FF7A7A' : '#fff',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '9999px',
              marginLeft: '6px',
            }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
