import { useState, useCallback, useEffect } from 'react';
import type { Task, Priority } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useTodayPebbles, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import type { PlannerScope } from '../../types';
import { reorderPebbles as reorderPebblesApi } from '../../api/tasks';
import type { TodayProjectFilter } from '../../hooks/useTasks';
import {
  listCardStyle as cardStyle,
  listCardInnerStyle as cardInner,
  listCardTitleStyle as titleStyle,
} from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';
import { formatLastCompletedLabel, getAgeDaysFromCreated } from '@/lib/firestoreTime';

interface PebbleSidebarProps {
  projectFilter?: TodayProjectFilter;
  priorityFilter?: Priority[];
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  plannerScope?: PlannerScope;
}

export function PebbleSidebar({
  projectFilter = [],
  priorityFilter = [],
  expandedTaskId,
  onExpandedTaskIdChange,
  plannerScope = 'me',
}: PebbleSidebarProps) {
  const { data: allPebbles = [] } = useTodayPebbles(projectFilter, plannerScope);
  const pebbles = priorityFilter.length === 0
    ? allPebbles
    : allPebbles.filter(t => priorityFilter.includes(t.priority || 'low'));
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayPebbles = localOrder || pebbles;

  const persistOrder = useCallback(
    async (newList: Task[]) => {
      const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
      try {
        await reorderPebblesApi(order, plannerScope);
      } catch (e) {
        console.error('Failed to persist order:', e);
      }
    },
    [plannerScope],
  );

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayPebbles];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayPebbles, persistOrder]);


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

  useEffect(() => {
    if (!localOrder || dragFromIndex !== null) return;

    if (!haveSameTaskIds(pebbles, localOrder)) {
      setLocalOrder(null);
      return;
    }

    setLocalOrder((current) => {
      if (!current) return current;
      const merged = mergeTasksPreservingOrder(pebbles, current);
      const changed = merged.some((task, index) => task !== current[index]);
      return changed ? merged : current;
    });
  }, [dragFromIndex, localOrder, pebbles]);

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
          const isEditing = expandedTaskId === task.id;
          const projectName = task.projectId ? projectMap.get(task.projectId) : null;
          const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
          const ageInDays = task.createdAt ? getAgeDaysFromCreated(task.createdAt) : null;
          const prevStr = task.lastOccurrenceCompletedAt
            ? `Prev: ${formatLastCompletedLabel(task.lastOccurrenceCompletedAt)}`
            : null;
          const collapsedMeta = formatCollapsedTaskMetaLine({
            deadlineLabel: deadlineStr,
            showRecurrence: !!task.recurrence,
            projectName: projectName ?? null,
            prevCompletedLabel: prevStr,
          });
          const showGapBefore = dragFromIndex !== null && dropGapIndex === index && dropGapIndex !== dragFromIndex && dropGapIndex !== dragFromIndex + 1;

          return (
            <div key={task.id}>
              {showGapBefore && <div style={dropIndicatorLine} />}
              <div
                data-task-row-id={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={handleDropOnCard}
                onDragEnd={handleDragEnd}
              style={{
                ...cardStyle,
                cursor: 'grab',
                ...(dragFromIndex === index ? { opacity: 0.4 } : {}),
              }}
              >
              <div style={cardInner}>
                {/* Drag handle */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                }}>
                  <span style={dragHandle}>⠿</span>
                </div>

                {/* Content area — click to expand */}
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => onExpandedTaskIdChange(isEditing ? null : task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={titleStyle}>{task.title}</span>
                    {ageInDays !== null && ageInDays > 7 && (
                      <span style={{
                        fontSize: '10px',
                        fontStyle: 'italic',
                        flexShrink: 0,
                        color: ageInDays > 30 ? '#E14747' : ageInDays > 14 ? '#F59F0A' : '#9ca3af',
                      }}>
                        {ageInDays}d
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
                  onComplete={handleComplete}
                  onIcebox={handleIcebox}
                />
              )}
              </div>
              {index === displayPebbles.length - 1
                && dragFromIndex !== null
                && dropGapIndex === displayPebbles.length
                && dropGapIndex !== dragFromIndex + 1
                && <div style={dropIndicatorLine} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
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
