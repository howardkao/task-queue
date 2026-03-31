import { useState, useCallback, useEffect } from 'react';
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

  useEffect(() => {
    if (!localOrder || dragFromIndex !== null) return;

    if (!haveSameTaskIds(rocks, localOrder)) {
      setLocalOrder(null);
      return;
    }

    setLocalOrder((current) => {
      if (!current) return current;
      const merged = mergeTasksPreservingOrder(rocks, current);
      const changed = merged.some((task, index) => task !== current[index]);
      return changed ? merged : current;
    });
  }, [dragFromIndex, localOrder, rocks]);

  return (
    <div>
      <h2 style={sectionHeader}>Drag Rocks to Calendar</h2>

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
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                }}>
                  <span style={{ ...dragHandle, color: isPlaced ? '#E7E3DF' : '#EFEDEB' }}>⠿</span>
                  </div>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEditingId(isEditing ? null : rock.id)}>
                  <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}>                    {isPlaced && <span style={{ fontSize: '10px', marginRight: '4px' }}>📅</span>}
                    {rock.title}
                  </div>
                  {isPlaced && placedBoulders[rock.id] && (
                    <div style={{ fontSize: '10px', color: '#c08457', marginTop: '1px' }}>
                      {formatPlacedDate(placedBoulders[rock.id].date)}
                    </div>
                  )}
                  {(projectName || deadlineStr) && (
                    <div style={metaLine}>
                      {deadlineStr && <span style={{ color: '#E14747', marginRight: '8px' }}>△ {deadlineStr}</span>}
                      {projectName && <span>{projectName}</span>}
                    </div>
                  )}
                  {(rock.recurrence || rock.lastOccurrenceCompletedAt) && (
                    <div style={metaLine}>
                      {rock.recurrence && <span style={{ marginRight: '4px' }}>↻</span>}
                      {rock.lastOccurrenceCompletedAt && (
                        <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                          Prev: {formatLastCompleted(rock.lastOccurrenceCompletedAt)}
                        </span>
                      )}
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
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 500,
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
  border: '1px solid #E7E3DF',
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  overflow: 'hidden',
  cursor: 'grab',
};

const placedCardStyle: React.CSSProperties = {
  border: '1px solid #E7E3DF',
  background: '#F9F7F6',
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
  color: '#1D212B',
  fontWeight: 500,
};

const metaLine: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '3px',
};

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}

function formatLastCompleted(timestamp: any): string {
  if (!timestamp) return '';
  try {
    const d = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase();
  } catch {
    return '';
  }
}

function haveSameTaskIds(source: Task[], ordered: Task[]): boolean {
  if (source.length !== ordered.length) return false;
  const sourceIds = new Set(source.map(task => task.id));
  return ordered.every(task => sourceIds.has(task.id));
}

function mergeTasksPreservingOrder(source: Task[], ordered: Task[]): Task[] {
  const latestById = new Map(source.map(task => [task.id, task]));
  return ordered.map(task => latestById.get(task.id) ?? task);
}
