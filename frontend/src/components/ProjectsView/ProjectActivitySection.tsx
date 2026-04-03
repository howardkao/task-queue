import { formatFirestoreDateShort } from '@/lib/firestoreTime';

export function ProjectActivitySection({
  entries,
  showLog,
  onToggle,
}: {
  entries: { id: string; description: string; timestamp: unknown }[];
  showLog: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: '16px' }}>
      <div
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          color: '#6b7280',
          fontSize: '14px',
          userSelect: 'none',
          fontWeight: 500,
        }}
      >
        Activity Log ({entries.length}) {showLog ? '▲' : '▼'}
      </div>
      {showLog && (
        <div
          style={{
            marginTop: '8px',
            background: '#fff',
            border: '1px solid #E7E3DF',
            borderRadius: '16px',
            padding: '8px 0',
            maxHeight: '300px',
            overflow: 'auto',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {entries.length === 0 && (
            <div style={{ padding: '12px 16px', color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>
              No activity yet
            </div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: '6px 16px',
                borderBottom: '1px solid #EFEDEB',
                display: 'flex',
                gap: '8px',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap', minWidth: '70px' }}>
                {formatFirestoreDateShort(entry.timestamp)}
              </span>
              <span style={{ fontSize: '13px', color: '#1D212B' }}>{entry.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
