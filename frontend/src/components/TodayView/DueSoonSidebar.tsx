import { useState } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

interface DueSoonSidebarProps {
  tasks: Task[];
  placedTasks: Record<string, PlacedTaskInfo>;
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

export function DueSoonSidebar({ tasks, placedTasks }: DueSoonSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const placedIds = Object.keys(placedTasks);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    // Only allow calendar dragging for boulders and rocks
    if (task.classification === 'boulder' || task.classification === 'rock') {
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
        const deadline = task.deadline ? new Date(task.deadline) : null;
        const isOverdue = deadline ? deadline < new Date() : false;
        
        const deadlineStr = deadline ? deadline.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
        }) : null;

        // Visual style based on classification
        const isBoulder = task.classification === 'boulder';
        const isRock = task.classification === 'rock';
        const isPebble = task.classification === 'pebble';

        const classLabel = isBoulder ? 'ROCK' : isRock ? 'ROCK' : isPebble ? 'PEBBLE' : 'INBOX';
        const classColor = isBoulder ? '#E14747' : isRock ? '#E14747' : isPebble ? '#478CD1' : '#9ca3af';

        return (
          <div key={task.id}>
            <div
              draggable={isBoulder || isRock}
              onDragStart={(e) => handleDragStart(e, task)}
              style={{
                ...cardStyle,
                background: isOverdue ? '#FCEDED' : '#fff',
                border: `1px solid ${isOverdue ? '#f5c6c6' : '#E7E3DF'}`,
                ...(isPlaced ? placedCardStyle : {}),
              }}
            >
              <div style={cardInner}>
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => setEditingId(isEditing ? null : task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      color: classColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {classLabel}
                    </span>
                    {(isBoulder || isRock) && (
                      <span style={{ fontSize: '12px', color: isPlaced ? '#9ca3af' : classColor }}>○</span>
                    )}
                    {task.recurrence && <span style={{ fontSize: '12px', color: '#9ca3af' }}>↻</span>}
                    <div style={{ flex: 1 }} />
                    {deadlineStr && (
                      <span style={{ fontSize: '12px', color: '#E14747', fontWeight: 600 }}>
                        △ {deadlineStr}
                      </span>
                    )}
                  </div>
                  <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1D212B', fontWeight: 500 }}>
                    {isPlaced && <span style={{ fontSize: '10px', marginRight: '4px' }}>📅</span>}
                    {task.title}
                  </div>
                  <div style={metaLine}>
                    {isPlaced && placedTasks[task.id] && (
                      <span style={{ color: isBoulder ? '#EA6657' : '#c08457', marginRight: '8px' }}>
                        {formatPlacedDate(placedTasks[task.id].date)}
                      </span>
                    )}
                    {projectName && <span>{projectName}</span>}
                  </div>
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

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  marginBottom: '8px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  overflow: 'hidden',
  transition: 'all 0.15s',
};

const placedCardStyle: React.CSSProperties = {
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: '#E7E3DF',
  background: '#F9F7F6',
  opacity: 0.7,
};

const cardInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px 14px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#1D212B',
  fontWeight: 500,
};

const metaLine: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '3px',
};
