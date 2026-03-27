import { useState } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';

interface BoulderSidebarProps {
  boulders: Task[];
  placedIds: string[];
  activeProjectCount: number;
  standaloneCount: number;
}

export function BoulderSidebar({
  boulders, placedIds,
  activeProjectCount, standaloneCount,
}: BoulderSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const handleDragStart = (e: React.DragEvent, boulder: Task) => {
    e.dataTransfer.setData('boulder-id', boulder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div>
      <h2 style={sectionHeader}>
        Drag boulders to calendar
      </h2>

      {boulders.length === 0 && (
        <div style={emptyStyle}>
          No boulders available. Classify some tasks as boulders in Triage.
        </div>
      )}

      {boulders.map((b) => {
        const isEditing = editingId === b.id;
        const isPlaced = placedIds.includes(b.id);
        const projectName = b.projectId ? projectMap.get(b.projectId) : null;
        const deadlineStr = b.deadline ? formatDeadline(b.deadline) : null;

        return (
          <div
            key={b.id}
            draggable
            onDragStart={(e) => handleDragStart(e, b)}
            style={{
              ...cardStyle,
              ...(isPlaced ? placedCardStyle : {}),
            }}
          >
            <div style={cardInner}>
              <span style={{ ...dragHandle, color: isPlaced ? '#e5c6c6' : '#FFB3B3' }}>⠿</span>
              <div
                style={{ flex: 1, cursor: 'pointer' }}
                onClick={() => setEditingId(isEditing ? null : b.id)}
              >
                <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1f2937' }}>
                  {isPlaced && <span style={{ fontSize: '11px', marginRight: '4px' }}>📅</span>}
                  {b.title}
                </div>
                {projectName && (
                  <div style={metaLine}>{projectName}</div>
                )}
                {(deadlineStr || b.recurrence) && (
                  <div style={metaLine}>
                    {deadlineStr && <span style={{ color: '#FF6B6B' }}>⚑ {deadlineStr}</span>}
                    {deadlineStr && b.recurrence && <span style={{ margin: '0 4px' }}></span>}
                    {b.recurrence && <span>↻</span>}
                  </div>
                )}
              </div>
            </div>
            {isEditing && (
              <TaskEditPanel
                task={b}
                onClose={() => setEditingId(null)}
                onComplete={(id) => completeTask.mutate(id)}
                onIcebox={(id) => iceboxTask.mutate(id)}
              />
            )}
          </div>
        );
      })}

      <div style={{
        fontSize: '13px', color: '#9ca3af', marginTop: '12px', fontStyle: 'italic',
      }}>
        {activeProjectCount} active project{activeProjectCount !== 1 ? 's' : ''}
        {standaloneCount > 0 ? ` + ${standaloneCount} standalone` : ''}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  padding: '20px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '14px',
  textAlign: 'center',
};

const cardStyle: React.CSSProperties = {
  border: '2px dashed #FFB3B3',
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  cursor: 'grab',
  transition: 'all 0.2s ease',
};

const placedCardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fafafa',
  boxShadow: 'none',
  opacity: 0.7,
};

const cardInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
};

const dragHandle: React.CSSProperties = {
  color: '#FFB3B3',
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#1f2937',
  fontWeight: 500,
};

const metaLine: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '2px',
};

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}
