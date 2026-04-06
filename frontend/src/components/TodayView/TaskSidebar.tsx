import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Task, Investment } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderTasks as reorderTasksApi, type TaskReorderContext } from '../../api/tasks';
import {
  listCardStyle as cardStyle,
  listPlacedCardStyle as placedCardStyle,
  listCardInnerStyle as cardInner,
  listCardTitleStyle as titleStyle,
} from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';
import { formatLastCompletedLabel } from '@/lib/firestoreTime';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string;
}

interface TaskSidebarProps {
  tasks: Task[];
  placedTasks: Record<string, PlacedTaskInfo>;
  investments: Investment[];
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  reorderContext?: TaskReorderContext;
}

export function TaskSidebar({
  tasks,
  placedTasks,
  investments,
  expandedTaskId,
  onExpandedTaskIdChange,
  reorderContext = 'me',
}: TaskSidebarProps) {
  const placedIds = Object.keys(placedTasks);
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const investmentMap = useMemo(
    () => new Map(investments.map(inv => [inv.id, inv.name])),
    [investments],
  );

  // Group tasks by investment
  const groups = useMemo(() => {
    const byInvestment = new Map<string | null, Task[]>();
    for (const task of tasks) {
      const key = task.investmentId;
      if (!byInvestment.has(key)) byInvestment.set(key, []);
      byInvestment.get(key)!.push(task);
    }
    // Sort groups: named investments in investment rank order, then orphans at bottom
    const result: { investmentId: string | null; name: string; tasks: Task[] }[] = [];
    for (const inv of investments) {
      const group = byInvestment.get(inv.id);
      if (group && group.length > 0) {
        result.push({ investmentId: inv.id, name: inv.name, tasks: group });
      }
    }
    const orphans = byInvestment.get(null);
    if (orphans && orphans.length > 0) {
      result.push({ investmentId: null, name: 'No Investment', tasks: orphans });
    }
    // Include any tasks with investmentIds not in the active investments list
    for (const [key, group] of byInvestment) {
      if (key !== null && !investments.some(inv => inv.id === key)) {
        result.push({ investmentId: key, name: investmentMap.get(key) || 'Unknown', tasks: group });
      }
    }
    return result;
  }, [tasks, investments, investmentMap]);

  // Reorder state
  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayTasks = localOrder || tasks;

  const persistOrder = useCallback(
    async (newList: Task[]) => {
      const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
      try {
        await reorderTasksApi(order, reorderContext);
      } catch (e) {
        console.error('Failed to persist task order:', e);
      }
    },
    [reorderContext],
  );

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayTasks];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayTasks, persistOrder]);

  const handleDragStart = (e: React.DragEvent, task: Task, index: number) => {
    e.dataTransfer.setData('task-id', task.id);
    e.dataTransfer.setData('task-reorder', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragFromIndex(index);
  };

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes('task-reorder')) return;
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

  const handleDragEnd = useCallback(() => {
    setDragFromIndex(null);
    setDropGapIndex(null);
  }, []);

  useEffect(() => {
    if (!localOrder || dragFromIndex !== null) return;

    if (!haveSameTaskIds(tasks, localOrder)) {
      setLocalOrder(null);
      return;
    }

    setLocalOrder((current) => {
      if (!current) return current;
      const merged = mergeTasksPreservingOrder(tasks, current);
      const changed = merged.some((task, index) => task !== current[index]);
      return changed ? merged : current;
    });
  }, [tasks, dragFromIndex, localOrder]);

  if (tasks.length === 0) {
    return (
      <div style={emptyStyle}>
        No tasks in this view.
      </div>
    );
  }

  // Flat rendering with group headers
  let flatIndex = 0;
  return (
    <div>
      {groups.map((group) => (
        <div key={group.investmentId ?? '__orphan'} style={{ marginBottom: '16px' }}>
          <h3 style={groupHeader}>{group.name}</h3>
          {group.tasks.map((task) => {
            const idx = flatIndex++;
            const isEditing = expandedTaskId === task.id;
            const isPlaced = placedIds.includes(task.id);
            const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
            const prevStr = task.lastOccurrenceCompletedAt
              ? `Prev: ${formatLastCompletedLabel(task.lastOccurrenceCompletedAt)}`
              : null;
            const collapsedMeta = formatCollapsedTaskMetaLine({
              deadlineLabel: deadlineStr,
              showRecurrence: !!task.recurrence,
              investmentName: task.investmentId ? investmentMap.get(task.investmentId) ?? null : null,
              prevCompletedLabel: prevStr,
            });
            const showGapBefore = dragFromIndex !== null && dropGapIndex === idx && dropGapIndex !== dragFromIndex && dropGapIndex !== dragFromIndex + 1;

            return (
              <div key={task.id}>
                {showGapBefore && <div style={dropIndicatorLine} />}
                <div
                  data-task-row-id={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={() => setDropGapIndex(null)}
                  onDrop={handleDropOnCard}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...cardStyle,
                    cursor: 'grab',
                    ...(isPlaced ? placedCardStyle : {}),
                    ...(dragFromIndex === idx ? { opacity: 0.4 } : {}),
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

                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => onExpandedTaskIdChange(isEditing ? null : task.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}>
                          {task.title}
                        </span>
                        {task.size && (
                          <span style={{
                            fontSize: '10px',
                            color: '#9ca3af',
                            flexShrink: 0,
                            fontWeight: 600,
                          }}>
                            {task.size}
                          </span>
                        )}
                      </div>
                      {collapsedMeta && (
                        <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <TaskEditPanel
                      task={task}
                      onClose={() => onExpandedTaskIdChange(null)}
                      onComplete={(id) => completeTask.mutate(id)}
                      onIcebox={(id) => iceboxTask.mutate(id)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const groupHeader: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  marginBottom: '8px',
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
  background: '#EA6657',
  borderRadius: '2px',
  margin: '2px 0',
};

const dragHandle: React.CSSProperties = {
  color: '#EFEDEB',
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};

function haveSameTaskIds(source: Task[], ordered: Task[]): boolean {
  if (source.length !== ordered.length) return false;
  const sourceIds = new Set(source.map(task => task.id));
  return ordered.every(task => sourceIds.has(task.id));
}

function mergeTasksPreservingOrder(source: Task[], ordered: Task[]): Task[] {
  const latestById = new Map(source.map(task => [task.id, task]));
  return ordered.map(task => latestById.get(task.id) ?? task);
}
