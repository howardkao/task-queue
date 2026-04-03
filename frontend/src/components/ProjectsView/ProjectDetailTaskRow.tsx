import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';
import {
  getTaskTypeStyles,
  taskDragHandleStyle,
  taskRowCardStyle,
} from './projectDetailStyles';

const PROJECT_DETAIL_TASK_DRAG_TYPE = 'project-detail-task';

export function ProjectDetailTaskRow({
  task,
  expandedTaskId,
  onExpandedTaskIdChange,
  onComplete,
  onIcebox,
}: {
  task: Task;
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
}) {
  const editing = expandedTaskId === task.id;
  const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel: deadlineStr,
    showRecurrence: !!task.recurrence,
    projectName: null,
    prevCompletedLabel: null,
  });
  const typeStyles = getTaskTypeStyles(task.classification);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(PROJECT_DETAIL_TASK_DRAG_TYPE, task.id);
    e.dataTransfer.setData(`${PROJECT_DETAIL_TASK_DRAG_TYPE}-classification`, task.classification);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{ marginBottom: '6px' }}>
      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          ...taskRowCardStyle,
          borderColor: typeStyles.border,
          background: typeStyles.bg,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '10px 12px',
          cursor: 'grab',
        }}
      >
        <span
          style={{ ...taskDragHandleStyle, color: typeStyles.handle }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => onExpandedTaskIdChange(editing ? null : task.id)}
        >
          <div
            style={{
              fontSize: '13px',
              color: '#1D212B',
              fontWeight: 500,
              borderBottom: editing ? '1px dashed #EA6657' : '1px dashed transparent',
            }}
          >
            {task.title}
          </div>
          {collapsedMeta && <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>}
        </div>
      </div>
      {editing && (
        <TaskEditPanel
          task={task}
          onClose={() => onExpandedTaskIdChange(null)}
          onComplete={onComplete}
          onIcebox={onIcebox}
        />
      )}
    </div>
  );
}
