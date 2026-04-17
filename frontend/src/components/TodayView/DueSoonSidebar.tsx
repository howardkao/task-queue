import { useCallback, useMemo } from 'react';
import type { Task, Investment } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useAuth } from '../../hooks/useAuth';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import {
  listCardStyle,
  listPlacedCardStyle,
  listCardInnerStyle,
  listCardTitleStyle,
  listCardCompleteButtonStyle,
} from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
  formatTaskSizeForUi,
  sizeBadgeStyle,
} from '../shared/collapsedTaskMeta';
import { InlineEditableTitle } from '../shared/InlineEditableTitle';
import { onExpandedTaskHeaderBackgroundClick } from '../shared/expandedTaskHeader';
import { TaskCollapsedSharingIndicator } from '../shared/TaskCollapsedSharingIndicator';
import { formatLastCompletedLabel } from '@/lib/firestoreTime';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

interface DueSoonSidebarProps {
  tasks: Task[];
  placedTasks: Record<string, PlacedTaskInfo>;
  investments: Investment[];
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  onCalendarDragFromSidebarStart?: (task: Task) => void;
  onCalendarDragFromSidebarEnd?: () => void;
}

export function DueSoonSidebar({
  tasks,
  placedTasks,
  investments,
  expandedTaskId,
  onExpandedTaskIdChange,
  onCalendarDragFromSidebarStart,
  onCalendarDragFromSidebarEnd,
}: DueSoonSidebarProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const investmentById = useMemo(
    () => new Map(investments.map((inv) => [inv.id, inv])),
    [investments],
  );
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const placedIds = Object.keys(placedTasks);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (task.size != null) {
      e.dataTransfer.setData('task-id', task.id);
      e.dataTransfer.effectAllowed = 'move';
      onCalendarDragFromSidebarStart?.(task);
    }
  };

  const handleDragEnd = useCallback(() => {
    onCalendarDragFromSidebarEnd?.();
  }, [onCalendarDragFromSidebarEnd]);

  if (tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px',
        color: '#EA6657',
        fontWeight: 500,
        marginBottom: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ fontSize: '12px' }}>⏱</span> Due and overdue
      </div>
      {tasks.map((task) => {
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

        const calendarDraggable = task.size != null;

        return (
          <div key={task.id}>
            <div
              data-task-row-id={task.id}
              draggable={calendarDraggable}
              onDragStart={(e) => handleDragStart(e, task)}
              onDragEnd={calendarDraggable ? handleDragEnd : undefined}
              style={{
                ...listCardStyle,
                cursor: calendarDraggable ? 'grab' : undefined,
                ...(isPlaced ? listPlacedCardStyle : {}),
              }}
            >
              <div
                style={listCardInnerStyle}
                onClick={(e) =>
                  onExpandedTaskHeaderBackgroundClick(e, isEditing, () =>
                    onExpandedTaskIdChange(null),
                  )
                }
              >
                <div
                  style={{ flex: 1, minWidth: 0, cursor: isEditing ? undefined : 'pointer' }}
                  onClick={isEditing ? undefined : () => onExpandedTaskIdChange(task.id)}
                >
                  {isEditing ? (
                    <InlineEditableTitle
                      taskId={task.id}
                      initialTitle={task.title}
                      style={{ ...listCardTitleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}
                    />
                  ) : (
                    <>
                      <span style={{ ...listCardTitleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}>
                        {task.title}
                      </span>
                      {collapsedMeta && (
                        <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
                      )}
                    </>
                  )}
                </div>
                <TaskCollapsedSharingIndicator
                  task={task}
                  familyVisibleParent={
                    task.investmentId
                      ? investmentById.get(task.investmentId)?.familyVisible === true
                      : false
                  }
                  viewerUid={uid}
                  viewerEmail={user?.email}
                />
                {task.size && (
                  <span style={sizeBadgeStyle}>{formatTaskSizeForUi(task.size)}</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    completeTask.mutate(task.id);
                  }}
                  style={listCardCompleteButtonStyle}
                  title="Complete"
                >
                  &#10003;
                </button>
              </div>

              {isEditing && (
                <TaskEditPanel
                  task={task}
                  onClose={() => onExpandedTaskIdChange(null)}
                  onComplete={(id) => completeTask.mutate(id)}
                  onIcebox={(id) => iceboxTask.mutate(id)}
                  seamless
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
