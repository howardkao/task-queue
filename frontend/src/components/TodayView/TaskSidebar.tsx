import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Task, Investment } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { useAuth } from '../../hooks/useAuth';
import { reorderPrivateTaskPlacements, reorderTasks as reorderTasksApi, type TaskReorderContext } from '../../api/tasks';
import { computePrivatePlacementUpdates, computeSharedOrderUpdates, haveSameTaskIds, mergeTasksPreservingOrder } from '../../lib/taskOrdering';
import { isFamilyInvestment } from '../../taskPolicy';
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
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const placedIds = Object.keys(placedTasks);
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const investmentMap = useMemo(
    () => new Map(investments.map(inv => [inv.id, inv.name])),
    [investments],
  );
  const investmentById = useMemo(
    () => new Map(investments.map((investment) => [investment.id, investment])),
    [investments],
  );

  // Reorder state
  const [dropGap, setDropGap] = useState<{ groupKey: string; index: number } | null>(null);
  const [dragState, setDragState] = useState<{ groupKey: string; index: number } | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const displayTasks = localOrder || tasks;

  const groups = useMemo(() => {
    const byInvestment = new Map<string | null, Task[]>();
    for (const task of displayTasks) {
      const key = task.investmentId;
      if (!byInvestment.has(key)) byInvestment.set(key, []);
      byInvestment.get(key)!.push(task);
    }
    const result: { key: string; investmentId: string | null; name: string; tasks: Task[] }[] = [];
    const orphans = byInvestment.get(null);
    if (orphans && orphans.length > 0) {
      result.push({ key: '__uncategorized', investmentId: null, name: '(uncategorized)', tasks: orphans });
    }
    for (const inv of investments) {
      const group = byInvestment.get(inv.id);
      if (group && group.length > 0) {
        result.push({ key: inv.id, investmentId: inv.id, name: inv.name, tasks: group });
      }
    }
    for (const [key, group] of byInvestment) {
      if (key !== null && !investments.some(inv => inv.id === key)) {
        result.push({ key, investmentId: key, name: investmentMap.get(key) || 'Unknown', tasks: group });
      }
    }
    return result;
  }, [displayTasks, investments, investmentMap]);

  const persistOrder = useCallback(
    async (groupTasks: Task[]) => {
      try {
        if (reorderContext === 'family') {
          const order = groupTasks.map((task, index) => ({ id: task.id, sortOrder: (index + 1) * 1000 }));
          await reorderTasksApi(order, 'family');
          return;
        }

        const investment = groupTasks[0]?.investmentId ? investmentById.get(groupTasks[0].investmentId) : undefined;
        if (investment && isFamilyInvestment(investment)) {
          const sharedOrder = computeSharedOrderUpdates(groupTasks, investment);
          const privatePlacements = computePrivatePlacementUpdates(groupTasks, uid, investment);
          if (sharedOrder.length > 0) await reorderTasksApi(sharedOrder, 'family');
          if (privatePlacements.length > 0) await reorderPrivateTaskPlacements(privatePlacements);
        } else {
          const personalOrder = groupTasks.map((task, index) => ({ id: task.id, sortOrder: (index + 1) * 1000 }));
          if (personalOrder.length > 0) await reorderTasksApi(personalOrder, 'me');
        }
      } catch (e) {
        console.error('Failed to persist task order:', e);
      }
    },
    [investmentById, reorderContext, uid],
  );

  const applyGroupReorder = useCallback((
    groupTasks: Task[],
    fromIdx: number,
    toIdx: number,
  ) => {
    const reorderedGroup = [...groupTasks];
    const [moved] = reorderedGroup.splice(fromIdx, 1);
    reorderedGroup.splice(toIdx, 0, moved);

    const groupIds = new Set(groupTasks.map((task) => task.id));
    let nextGroupIndex = 0;
    const merged = displayTasks.map((task) => (
      groupIds.has(task.id) ? reorderedGroup[nextGroupIndex++]! : task
    ));

    setLocalOrder(merged);
    persistOrder(reorderedGroup);
  }, [displayTasks, persistOrder]);

  const handleDragStart = (e: React.DragEvent, task: Task, groupKey: string, index: number) => {
    e.dataTransfer.setData('task-id', task.id);
    e.dataTransfer.setData('task-reorder', `${groupKey}:${index}`);
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ groupKey, index });
  };

  const handleDragOver = useCallback((e: React.DragEvent, groupKey: string, index: number) => {
    if (!e.dataTransfer.types.includes('task-reorder')) return;
    if (!dragState || dragState.groupKey !== groupKey) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropGap({ groupKey, index: e.clientY < midY ? index : index + 1 });
  }, [dragState]);

  const handleDropOnGroup = useCallback((groupKey: string, groupTasks: Task[]) => {
    if (!dragState || !dropGap || dragState.groupKey !== groupKey || dropGap.groupKey !== groupKey) {
      setDropGap(null);
      setDragState(null);
      return;
    }
    const toIdx = dropGap.index > dragState.index ? dropGap.index - 1 : dropGap.index;
    if (toIdx !== dragState.index) applyGroupReorder(groupTasks, dragState.index, toIdx);
    setDropGap(null);
    setDragState(null);
  }, [applyGroupReorder, dragState, dropGap]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDropGap(null);
  }, []);

  useEffect(() => {
    if (!localOrder || dragState !== null) return;

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
  }, [tasks, dragState, localOrder]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      const validKeys = new Set(groups.map((group) => group.key));
      for (const key of Object.keys(next)) {
        if (!validKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      for (const group of groups) {
        if (!(group.key in next)) {
          next[group.key] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

  if (tasks.length === 0) {
    return (
      <div style={emptyStyle}>
        No tasks in this view.
      </div>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
            style={groupHeaderButton}
          >
            <span style={groupCaret}>{collapsedGroups[group.key] ? '▸' : '▾'}</span>
            <span style={groupHeader}>{group.name}</span>
          </button>
          {!collapsedGroups[group.key] && group.tasks.map((task, idx) => {
            const isEditing = expandedTaskId === task.id;
            const isPlaced = placedIds.includes(task.id);
            const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
            const prevStr = task.lastOccurrenceCompletedAt
              ? `last completed ${formatLastCompletedLabel(task.lastOccurrenceCompletedAt)}`
              : null;
            const collapsedMeta = formatCollapsedTaskMetaLine({
              deadlineLabel: deadlineStr,
              showRecurrence: !!task.recurrence,
              prevCompletedLabel: prevStr,
            });
            const showGapBefore = !!dragState
              && dragState.groupKey === group.key
              && dropGap?.groupKey === group.key
              && dropGap.index === idx
              && dropGap.index !== dragState.index
              && dropGap.index !== dragState.index + 1;

            return (
              <div key={task.id}>
                {showGapBefore && <div style={dropIndicatorLine} />}
                <div
                  data-task-row-id={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task, group.key, idx)}
                  onDragOver={(e) => handleDragOver(e, group.key, idx)}
                  onDragLeave={() => setDropGap((current) => (
                    current?.groupKey === group.key ? null : current
                  ))}
                  onDrop={() => handleDropOnGroup(group.key, group.tasks)}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...cardStyle,
                    cursor: 'grab',
                    ...(isPlaced ? placedCardStyle : {}),
                    ...(dragState?.groupKey === group.key && dragState.index === idx ? { opacity: 0.4 } : {}),
                  }}
                >
                  <div style={cardInner}>
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
          {!collapsedGroups[group.key]
            && dragState?.groupKey === group.key
            && dropGap?.groupKey === group.key
            && dropGap.index === group.tasks.length
            && dropGap.index !== dragState.index + 1
            && <div style={dropIndicatorLine} />}
        </div>
      ))}
    </div>
  );
}

const groupHeaderButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  border: 'none',
  background: 'transparent',
  padding: 0,
  marginBottom: '8px',
  cursor: 'pointer',
};

const groupHeader: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  fontWeight: 500,
};

const groupCaret: React.CSSProperties = {
  width: '10px',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: '11px',
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
