import { useState } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
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
}

export function DueSoonSidebar({ tasks, placedTasks }: DueSoonSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const placedIds = Object.keys(placedTasks);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (
      task.classification === 'boulder' ||
      task.classification === 'rock' ||
      task.classification === 'pebble'
    ) {
      e.dataTransfer.setData('boulder-id', task.id);
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
        const isEditing = editingId === task.id;
        const isPlaced = placedIds.includes(task.id);
        const projectName = task.projectId ? projectMap.get(task.projectId) : null;
        const deadlineStr = formatTaskDeadlineForMeta(task.deadline);

        const prevStr = task.lastOccurrenceCompletedAt
          ? `Prev: ${formatLastCompletedLabel(task.lastOccurrenceCompletedAt)}`
          : null;
        const collapsedMeta = formatCollapsedTaskMetaLine({
          deadlineLabel: deadlineStr,
          showRecurrence: !!task.recurrence,
          projectName: projectName ?? null,
          prevCompletedLabel: prevStr,
        });

        const calendarDraggable =
          task.classification === 'boulder' ||
          task.classification === 'rock' ||
          task.classification === 'pebble';

        return (
          <div key={task.id}>
            <div
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
                  onClick={() => setEditingId(isEditing ? null : task.id)}
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

const dragHandle: React.CSSProperties = {
  color: '#EFEDEB',
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};
