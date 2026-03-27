import { useState, useCallback } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { usePebbles, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderPebbles as reorderPebblesApi } from '../../api/tasks';

export function PebbleSidebar() {
  const { data: pebbles = [] } = usePebbles();
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayPebbles = localOrder || pebbles;

  const persistOrder = useCallback(async (newList: Task[]) => {
    const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
    try { await reorderPebblesApi(order); } catch (e) { console.error('Failed to persist order:', e); }
  }, []);

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayPebbles];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayPebbles, persistOrder]);

  const handleBumpToTop = useCallback((id: string) => {
    const idx = displayPebbles.findIndex(t => t.id === id);
    if (idx > 0) applyReorder(idx, 0);
  }, [displayPebbles, applyReorder]);

  const handleDropBy10 = useCallback((id: string) => {
    const idx = displayPebbles.findIndex(t => t.id === id);
    if (idx >= 0) {
      const newIdx = Math.min(idx + 10, displayPebbles.length - 1);
      if (newIdx !== idx) applyReorder(idx, newIdx);
    }
  }, [displayPebbles, applyReorder]);

  const handleComplete = useCallback((id: string) => {
    setLocalOrder(prev => (prev || pebbles).filter(t => t.id !== id));
    completeTask.mutate(id);
  }, [pebbles, completeTask]);

  const handleIcebox = useCallback((id: string) => {
    setLocalOrder(prev => (prev || pebbles).filter(t => t.id !== id));
    iceboxTask.mutate(id);
  }, [pebbles, iceboxTask]);

  const handleDragStart = useCallback((_e: React.DragEvent, index: number) => {
    setDragFromIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent, toIndex: number) => {
    setDragOverIndex(null);
    if (dragFromIndex !== null && dragFromIndex !== toIndex) {
      applyReorder(dragFromIndex, toIndex);
    }
    setDragFromIndex(null);
  }, [dragFromIndex, applyReorder]);

  if (localOrder && pebbles.length !== localOrder.length && dragFromIndex === null) {
    setLocalOrder(null);
  }

  return (
    <div>
      <h2 style={sectionHeader}>
        Pebbles ({displayPebbles.length})
      </h2>

      {displayPebbles.length === 0 && (
        <div style={emptyStyle}>
          No pebbles yet.
        </div>
      )}

      <div style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
        {displayPebbles.map((task, index) => {
          const isEditing = editingId === task.id;
          const isDragOver = dragOverIndex === index;
          const projectName = task.projectId ? projectMap.get(task.projectId) : null;
          const deadlineStr = task.deadline ? formatDeadline(task.deadline) : null;
          const ageInDays = task.createdAt ? getAgeDays(task.createdAt) : null;

          return (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              style={{
                ...cardStyle,
                background: isDragOver ? '#fef3c7' : '#fff',
                borderColor: isDragOver ? '#FF7A7A' : '#e5e7eb',
                boxShadow: isDragOver ? '0 2px 4px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={cardInner}>
                {/* Drag handle + reorder buttons stacked vertically */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                }}>
                  <span style={dragHandle}>⠿</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBumpToTop(task.id); }}
                    title="Bump to top"
                    style={reorderBtn}
                  >
                    ⤒
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDropBy10(task.id); }}
                    title="Drop 10"
                    style={reorderBtn}
                  >
                    ↓
                  </button>
                </div>

                {/* Content area — click to expand */}
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => setEditingId(isEditing ? null : task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={titleStyle}>{task.title}</span>
                    {ageInDays !== null && ageInDays > 7 && (
                      <span style={{
                        fontSize: '11px',
                        fontStyle: 'italic',
                        flexShrink: 0,
                        color: ageInDays > 30 ? '#FF6B6B' : ageInDays > 14 ? '#f59e0b' : '#9ca3af',
                      }}>
                        {ageInDays}d
                      </span>
                    )}
                  </div>
                  {projectName && (
                    <div style={metaLine}>{projectName}</div>
                  )}
                  {(deadlineStr || task.recurrence) && (
                    <div style={metaLine}>
                      {deadlineStr && <span style={{ color: '#FF6B6B' }}>⚑ {deadlineStr}</span>}
                      {deadlineStr && task.recurrence && <span style={{ margin: '0 4px' }}></span>}
                      {task.recurrence && <span>↻</span>}
                    </div>
                  )}
                </div>
              </div>

              {isEditing && (
                <TaskEditPanel
                  task={task}
                  onClose={() => setEditingId(null)}
                  onComplete={handleComplete}
                  onIcebox={handleIcebox}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '8px',
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
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  cursor: 'grab',
  transition: 'all 0.15s',
};

const cardInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
};

const dragHandle: React.CSSProperties = {
  color: '#d1d5db',
  fontSize: '16px',
  userSelect: 'none',
};

const reorderBtn: React.CSSProperties = {
  padding: '0px 4px',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '10px',
  color: '#9ca3af',
  fontFamily: 'inherit',
  lineHeight: '1.4',
  display: 'block',
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

function getAgeDays(createdAt: any): number {
  if (!createdAt) return 0;
  const created = createdAt.seconds
    ? new Date(createdAt.seconds * 1000)
    : new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}
