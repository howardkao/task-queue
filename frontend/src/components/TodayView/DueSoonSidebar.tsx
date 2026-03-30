import { useState } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

interface DueSoonSidebarProps {
  tasks: Task[];
  placedTasks: Record<string, PlacedTaskInfo>;
}

function formatPlacedDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function DueSoonSidebar({ tasks, placedTasks }: DueSoonSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const placedIds = Object.keys(placedTasks);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    // Only allow calendar dragging for boulders and rocks
    if (task.classification === 'boulder' || task.classification === 'rock') {
      e.dataTransfer.setData('boulder-id', task.id);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      {tasks.length === 0 && (
        <div style={emptyStyle}>No tasks due soon.</div>
      )}
      {tasks.map((task) => {
        const isEditing = editingId === task.id;
        const isPlaced = placedIds.includes(task.id);
        const projectName = task.projectId ? projectMap.get(task.projectId) : null;
        const deadline = task.deadline ? new Date(task.deadline) : null;
        const isOverdue = deadline ? deadline < new Date() : false;
        
        const deadlineStr = deadline ? deadline.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
        }) : null;

        // Visual style based on classification
        const isBoulder = task.classification === 'boulder';
        const isRock = task.classification === 'rock';
        const isPebble = task.classification === 'pebble';

        const borderColor = isBoulder ? '#FFB3B3' : isRock ? '#d7b27a' : isPebble ? '#93c5fd' : '#e5e7eb';
        const icon = isBoulder ? '🪨' : isRock ? 'Rock' : isPebble ? 'Pebble' : '📥';

        return (
          <div key={task.id}>
            <div
              draggable={isBoulder || isRock}
              onDragStart={(e) => handleDragStart(e, task)}
              style={{
                ...cardStyle,
                border: `2px dashed ${borderColor}`,
                background: isOverdue ? '#fff1f2' : '#fff',
                ...(isPlaced ? placedCardStyle : {}),
              }}
            >
              <div style={cardInner}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                  width: '24px',
                }}>
                  {(isBoulder || isRock) && (
                    <span style={{ ...dragHandle, color: isPlaced ? '#9ca3af' : borderColor }}>⠿</span>
                  )}
                  <div style={{ fontSize: '11px', marginTop: '1px' }}>{icon}</div>
                </div>

                <div 
                  style={{ flex: 1, cursor: 'pointer' }} 
                  onClick={() => setEditingId(isEditing ? null : task.id)}
                >
                  <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1f2937' }}>
                    {isPlaced && <span style={{ fontSize: '11px', marginRight: '4px' }}>📅</span>}
                    {task.title}
                  </div>
                  <div style={metaLine}>
                    {isPlaced && placedTasks[task.id] && (
                      <span style={{ color: isBoulder ? '#FF7A7A' : '#c08457', marginRight: '8px' }}>
                        {formatPlacedDate(placedTasks[task.id].date)}
                      </span>
                    )}
                    {projectName && <span style={{ marginRight: '8px' }}>{projectName}</span>}
                    {deadlineStr && (
                      <span style={{ color: isOverdue ? '#ef4444' : '#ef4444', fontWeight: 600 }}>
                        ⚑ {deadlineStr}
                      </span>
                    )}
                    {task.recurrence && <span style={{ marginLeft: '8px' }}>↻</span>}
                  </div>
                </div>
              </div>

              {isEditing && (
                <TaskEditPanel
                  task={task}
                  onClose={() => setEditingId(null)}
                  onComplete={(id) => completeTask.mutate(id)}
                  onIcebox={(id) => iceboxTask.mutate(id)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  fontWeight: 600,
  marginBottom: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '13px',
  textAlign: 'center',
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  overflow: 'hidden',
  transition: 'all 0.15s',
};

const placedCardStyle: React.CSSProperties = {
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: '#e5e7eb',
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
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  cursor: 'grab',
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
