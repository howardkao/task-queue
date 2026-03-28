import { useState, useCallback } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderPebbles as reorderTasksApi } from '../../api/tasks';

interface PlacedBoulderInfo {
  startHour: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

interface BoulderSidebarProps {
  boulders: Task[];
  placedBoulders: Record<string, PlacedBoulderInfo>;
  activeProjectCount: number;
  standaloneCount: number;
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

export function BoulderSidebar({
  boulders, placedBoulders,
  activeProjectCount, standaloneCount,
}: BoulderSidebarProps) {
  const placedIds = Object.keys(placedBoulders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  // Reorder state — dropGapIndex represents the gap between items
  // 0 = before first item, 1 = between item 0 and 1, etc.
  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayBoulders = localOrder || boulders;

  const persistOrder = useCallback(async (newList: Task[]) => {
    const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
    try { await reorderTasksApi(order); } catch (e) { console.error('Failed to persist boulder order:', e); }
  }, []);

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayBoulders];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayBoulders, persistOrder]);

  const handleBumpToTop = useCallback((id: string) => {
    const idx = displayBoulders.findIndex(t => t.id === id);
    if (idx > 0) applyReorder(idx, 0);
  }, [displayBoulders, applyReorder]);

  const handleDropBy10 = useCallback((id: string) => {
    const idx = displayBoulders.findIndex(t => t.id === id);
    if (idx >= 0) {
      const newIdx = Math.min(idx + 10, displayBoulders.length - 1);
      if (newIdx !== idx) applyReorder(idx, newIdx);
    }
  }, [displayBoulders, applyReorder]);

  const handleDragStart = (e: React.DragEvent, boulder: Task, index: number) => {
    // Set boulder-id for calendar drops
    e.dataTransfer.setData('boulder-id', boulder.id);
    // Set reorder data for list reordering
    e.dataTransfer.setData('boulder-reorder', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragFromIndex(index);
  };

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes('boulder-reorder')) return;
    e.preventDefault();
    // Determine if cursor is in top or bottom half of this card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const gap = e.clientY < midY ? index : index + 1;
    setDropGapIndex(gap);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropGapIndex(null);
  }, []);

  const handleDropOnCard = useCallback((_e: React.DragEvent) => {
    if (dragFromIndex === null || dropGapIndex === null) {
      setDropGapIndex(null);
      setDragFromIndex(null);
      return;
    }
    // Convert gap index to effective insert index
    const toIdx = dropGapIndex > dragFromIndex ? dropGapIndex - 1 : dropGapIndex;
    if (toIdx !== dragFromIndex) {
      applyReorder(dragFromIndex, toIdx);
    }
    setDropGapIndex(null);
    setDragFromIndex(null);
  }, [dragFromIndex, dropGapIndex, applyReorder]);

  const handleDragEnd = useCallback(() => {
    setDragFromIndex(null);
    setDropGapIndex(null);
  }, []);

  // Sync localOrder when boulders list changes externally
  if (localOrder && boulders.length !== localOrder.length && dragFromIndex === null) {
    setLocalOrder(null);
  }

  return (
    <div>
      <h2 style={sectionHeader}>
        Drag boulders to calendar
      </h2>

      {displayBoulders.length === 0 && (
        <div style={emptyStyle}>
          No boulders available. Classify some tasks as boulders in Triage.
        </div>
      )}

      {displayBoulders.map((b, index) => {
        const isEditing = editingId === b.id;
        const isPlaced = placedIds.includes(b.id);
        const projectName = b.projectId ? projectMap.get(b.projectId) : null;
        const deadlineStr = b.deadline ? formatDeadline(b.deadline) : null;
        const showGapBefore = dragFromIndex !== null && dropGapIndex === index && dropGapIndex !== dragFromIndex && dropGapIndex !== dragFromIndex + 1;

        return (
          <div key={b.id}>
            {showGapBefore && <div style={dropIndicatorLine} />}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, b, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropOnCard}
              onDragEnd={handleDragEnd}
              style={{
                ...cardStyle,
                ...(isPlaced ? placedCardStyle : {}),
                ...(dragFromIndex === index ? { opacity: 0.4 } : {}),
              }}
            >
            <div style={cardInner}>
              {/* Drag handle + reorder buttons */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                flexShrink: 0,
              }}>
                <span style={{ ...dragHandle, color: isPlaced ? '#e5c6c6' : '#FFB3B3' }}>⠿</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleBumpToTop(b.id); }}
                  title="Bump to top"
                  style={reorderBtn}
                >
                  ⤒
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDropBy10(b.id); }}
                  title="Drop 10"
                  style={reorderBtn}
                >
                  ↓
                </button>
              </div>

              {/* Content area — click to expand */}
              <div
                style={{ flex: 1, cursor: 'pointer' }}
                onClick={() => setEditingId(isEditing ? null : b.id)}
              >
                <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1f2937' }}>
                  {isPlaced && <span style={{ fontSize: '11px', marginRight: '4px' }}>📅</span>}
                  {b.title}
                </div>
                {isPlaced && placedBoulders[b.id] && (
                  <div style={{ fontSize: '11px', color: '#FF7A7A', marginTop: '1px' }}>
                    {formatPlacedDate(placedBoulders[b.id].date)}
                  </div>
                )}
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
            {/* Show gap indicator after last item if needed */}
            {index === displayBoulders.length - 1
              && dragFromIndex !== null
              && dropGapIndex === displayBoulders.length
              && dropGapIndex !== dragFromIndex + 1
              && <div style={dropIndicatorLine} />}
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

const dropIndicatorLine: React.CSSProperties = {
  height: '3px',
  background: '#FF7A7A',
  borderRadius: '2px',
  margin: '2px 0',
};

const cardStyle: React.CSSProperties = {
  border: '2px dashed #FFB3B3',
  borderRadius: '12px',
  marginBottom: '6px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  cursor: 'grab',
  transition: 'all 0.15s',
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

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}
