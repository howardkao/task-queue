import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useInvestments } from '../../hooks/useInvestments';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import {
  listCardStyle,
  listPlacedCardStyle,
  listCardInnerStyle,
  listCardTitleStyle,
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
  date: string; // YYYY-MM-DD
}

interface DueSoonSidebarProps {
  tasks: Task[];
  placedTasks: Record<string, PlacedTaskInfo>;
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
}

export function DueSoonSidebar({
  tasks,
  placedTasks,
  expandedTaskId,
  onExpandedTaskIdChange,
}: DueSoonSidebarProps) {
  const { data: investments = [] } = useInvestments('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const investmentMap = new Map(investments.map(i => [i.id, i.name]));
  const placedIds = Object.keys(placedTasks);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (task.size != null) {
      e.dataTransfer.setData('task-id', task.id);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

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
        <span style={{ fontSize: '12px' }}>⏱</span> Overdue & Today
      </div>
      {tasks.map((task) => {
        const isEditing = expandedTaskId === task.id;
        const isPlaced = placedIds.includes(task.id);
        const investmentName = task.investmentId ? investmentMap.get(task.investmentId) : null;
        const deadlineStr = formatTaskDeadlineForMeta(task.deadline);

        const prevStr = task.lastOccurrenceCompletedAt
          ? `Prev: ${formatLastCompletedLabel(task.lastOccurrenceCompletedAt)}`
          : null;
        const collapsedMeta = formatCollapsedTaskMetaLine({
          deadlineLabel: deadlineStr,
          showRecurrence: !!task.recurrence,
          investmentName: investmentName ?? null,
          prevCompletedLabel: prevStr,
        });

        const calendarDraggable = task.size != null;

        return (
          <div key={task.id}>
            <div
              data-task-row-id={task.id}
              draggable={calendarDraggable}
              onDragStart={(e) => handleDragStart(e, task)}
              style={{
                ...listCardStyle,
                cursor: calendarDraggable ? 'grab' : undefined,
                ...(isPlaced ? listPlacedCardStyle : {}),
              }}
            >
              <div style={listCardInnerStyle}>
                {calendarDraggable && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    flexShrink: 0,
                  }}>
                    <span style={{ ...dragHandle, color: isPlaced ? '#E7E3DF' : '#EFEDEB' }}>⠿</span>
                  </div>
                )}
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => onExpandedTaskIdChange(isEditing ? null : task.id)}
                >
                  <div style={{ ...listCardTitleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}>
                    {task.title}
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
  );
}

const dragHandle: React.CSSProperties = {
  color: '#EFEDEB',
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};
