import { useState, useCallback } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderPebbles as reorderTasksApi } from '../../api/tasks';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string;
}

interface RockSidebarProps {
  rocks: Task[];
  placedBoulders: Record<string, PlacedTaskInfo>;
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

export function RockSidebar({ rocks, placedBoulders }: RockSidebarProps) {
  const placedIds = Object.keys(placedBoulders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayRocks = localOrder || rocks;

  const persistOrder = useCallback(async (newList: Task[]) => {
    const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
    try { await reorderTasksApi(order); } catch (e) { console.error('Failed to persist rock order:', e); }
  }, []);

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayRocks];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayRocks, persistOrder]);

  const handleDragStart = (e: React.DragEvent, rock: Task, index: number) => {
    e.dataTransfer.setData('boulder-id', rock.id);
    e.dataTransfer.setData('boulder-reorder', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragFromIndex(index);
  };

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes('boulder-reorder')) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropGapIndex(e.clientY < midY ? index : index + 1);
  }, []);

  const handleDropOnCard = useCallback(() => {
    if (dragFromIndex === null || dropGapIndex === null) {
      setDropGapIndex(null);
      setDragFromIndex(null);
      return;
    }
    const toIdx = dropGapIndex > dragFromIndex ? dropGapIndex - 1 : dropGapIndex;
    if (toIdx !== dragFromIndex) applyReorder(dragFromIndex, toIdx);
    setDropGapIndex(null);
    setDragFromIndex(null);
  }, [dragFromIndex, dropGapIndex, applyReorder]);

  if (
    localOrder
    && dragFromIndex === null
    && (
      rocks.length !== localOrder.length
      || rocks.some((task, index) => task.id !== localOrder[index]?.id)
    )
  ) {
    setLocalOrder(null);
  }

  return (
    <div>
      <h2 style={sectionHeader}>Drag rocks to calendar</h2>

      {displayRocks.length === 0 && (
        <div style={emptyStyle}>No rocks available.</div>
      )}

      {displayRocks.map((rock, index) => {
        const isEditing = editingId === rock.id;
        const isPlaced = placedIds.includes(rock.id);
        const projectName = rock.projectId ? projectMap.get(rock.projectId) : null;
        const deadlineStr = rock.deadline ? formatDeadline(rock.deadline) : null;
        const showGapBefore = dragFromIndex !== null && dropGapIndex === index && dropGapIndex !== dragFromIndex && dropGapIndex !== dragFromIndex + 1;

        return (
          <div key={rock.id}>
            {showGapBefore && <div style={dropIndicatorLine} />}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, rock, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={() => setDropGapIndex(null)}
              onDrop={handleDropOnCard}
              onDragEnd={() => { setDragFromIndex(null); setDropGapIndex(null); }}
              style={{
                ...cardStyle,
                ...(isPlaced ? placedCardStyle : {}),
                ...(dragFromIndex === index ? { opacity: 0.4 } : {}),
              }}
            >
              <div style={cardInner}>
                <span style={{ ...dragHandle, color: isPlaced ? '#d8ccb3' : '#d7b27a' }}>⠿</span>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEditingId(isEditing ? null : rock.id)}>
                  <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1f2937' }}>
                    {isPlaced && <span style={{ fontSize: '11px', marginRight: '4px' }}>📅</span>}
                    {rock.title}
                  </div>
                  {isPlaced && placedBoulders[rock.id] && (
                    <div style={{ fontSize: '11px', color: '#c08457', marginTop: '1px' }}>
                      {formatPlacedDate(placedBoulders[rock.id].date)}
                    </div>
                  )}
                  {projectName && <div style={metaLine}>{projectName}</div>}
                  {(deadlineStr || rock.recurrence) && (
                    <div style={metaLine}>
                      {deadlineStr && <span style={{ color: '#FF6B6B' }}>⚑ {deadlineStr}</span>}
                      {deadlineStr && rock.recurrence && <span style={{ margin: '0 4px' }}></span>}
                      {rock.recurrence && <span>↻</span>}
                    </div>
                  )}
                </div>
              </div>
              {isEditing && (
                <TaskEditPanel
                  task={rock}
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

const dropIndicatorLine: React.CSSProperties = {
  height: '3px',
  background: '#c08457',
  borderRadius: '2px',
  margin: '2px 0',
};

const cardStyle: React.CSSProperties = {
  border: '2px dashed #d7b27a',
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  cursor: 'grab',
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
