import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
  sizeBadgeStyle,
} from '../shared/collapsedTaskMeta';
import { InlineEditableTitle } from '../shared/InlineEditableTitle';
import { onExpandedTaskHeaderBackgroundClick } from '../shared/expandedTaskHeader';
import { TaskCollapsedSharingIndicator } from '../shared/TaskCollapsedSharingIndicator';
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
  familyVisibleParent,
  viewerUid,
  viewerEmail,
}: {
  task: Task;
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
  familyVisibleParent: boolean;
  viewerUid: string;
  viewerEmail: string | null | undefined;
}) {
  const editing = expandedTaskId === task.id;
  const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel: deadlineStr,
    showRecurrence: !!task.recurrence,
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
        onClick={(e) =>
          onExpandedTaskHeaderBackgroundClick(e, editing, () => onExpandedTaskIdChange(null))
        }
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
          data-task-card-drag-handle
          style={{ ...taskDragHandleStyle, color: typeStyles.handle }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
        <div
          style={{ flex: 1, minWidth: 0, cursor: editing ? undefined : 'pointer' }}
          onClick={editing ? undefined : () => onExpandedTaskIdChange(task.id)}
        >
          {editing ? (
            <InlineEditableTitle
              taskId={task.id}
              initialTitle={task.title}
              style={{ fontSize: '13px', color: '#1D212B', fontWeight: 500 }}
            />
          ) : (
            <>
              <div style={{ fontSize: '13px', color: '#1D212B', fontWeight: 500 }}>
                {task.title}
              </div>
              {collapsedMeta && <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>}
            </>
          )}
        </div>
        <TaskCollapsedSharingIndicator
          task={task}
          familyVisibleParent={familyVisibleParent}
          viewerUid={viewerUid}
          viewerEmail={viewerEmail}
        />
        {task.size && <span style={sizeBadgeStyle}>{task.size}</span>}
      </div>
      {editing && (
        <TaskEditPanel
          task={task}
          onClose={() => onExpandedTaskIdChange(null)}
          onComplete={onComplete}
          onIcebox={onIcebox}
          seamless
        />
      )}
    </div>
  );
}
