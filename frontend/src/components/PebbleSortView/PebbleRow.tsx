import { useState } from 'react';
import type { Task, RecurrenceRule } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';

interface PebbleRowProps {
  task: Task;
  index: number;
  totalCount: number;
  onBumpToTop: (id: string) => void;
  onDropBy10: (id: string) => void;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragOver: boolean;
}

export function PebbleRow({
  task, index, totalCount,
  onBumpToTop, onDropBy10, onComplete, onIcebox,
  onDragStart, onDragOver, onDragLeave, onDrop,
  isDragOver,
}: PebbleRowProps) {
  const [editing, setEditing] = useState(false);
  const { data: projects = [] } = useProjects('active');
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const staleThreshold = Math.max(10, Math.floor(totalCount * 0.8));
  const isStale = index >= staleThreshold && task.createdAt;
  const ageInDays = task.createdAt ? getAgeDays(task.createdAt) : null;
  const staleOpacity = isStale && ageInDays && ageInDays > 7
    ? Math.min((ageInDays - 7) / 30, 0.15)
    : 0;
  const deadlineStr = formatTaskDeadlineForMeta(task.deadline);
  const projectName = task.projectId ? projectMap.get(task.projectId) : null;
  const prevStr = task.lastOccurrenceCompletedAt
    ? `Prev: ${formatLastCompleted(task.lastOccurrenceCompletedAt)}`
    : null;
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel: deadlineStr,
    showRecurrence: !!task.recurrence,
    projectName: projectName ?? null,
    prevCompletedLabel: prevStr,
  });

  return (
    <div
      style={{
        background: isDragOver ? '#fef3c7' : staleOpacity > 0 ? `rgba(200, 180, 140, ${staleOpacity})` : '#fff',
        border: `1px solid ${isDragOver ? '#EA6657' : '#E7E3DF'}`,
        borderRadius: '8px',
        marginBottom: '4px',
        overflow: 'hidden',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: isDragOver ? '0 4px 6px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.1)',
        transform: isDragOver ? 'translateY(-1px)' : 'none',
      }}
    >
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, index)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '10px 12px',
          cursor: 'grab',
        }}
      >
        {/* Drag handle */}
        <span style={{ color: '#9ca3af', cursor: 'grab', fontSize: '16px', userSelect: 'none' }}>
          ⠿
        </span>

        {/* Number */}
        <span style={{ fontSize: '13px', color: '#9ca3af', width: '28px', textAlign: 'right', flexShrink: 0 }}>
          {index + 1}.
        </span>

        {/* Action buttons */}
        <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={() => onBumpToTop(task.id)} title="Bump to top" style={btnStyle}>⤒</button>
          <button onClick={() => onDropBy10(task.id)} title="Drop by 10" style={btnStyle}>↓10</button>
          <button onClick={() => onComplete(task.id)} title="Complete" style={btnStyle}>✓</button>
          <button onClick={() => onIcebox(task.id)} title="Icebox" style={btnStyle}>❄</button>
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
            <span
              onClick={() => setEditing(!editing)}
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#1D212B',
                cursor: 'pointer',
                borderBottom: editing ? '1px dashed #EA6657' : '1px dashed transparent',
                transition: 'border-color 0.15s',
              }}
              title="Click to edit"
            >
              {task.title}
            </span>
            {ageInDays !== null && ageInDays > 7 && (
              <span style={{
                fontSize: '10px',
                color: ageInDays > 30 ? '#E14747' : ageInDays > 14 ? '#F59F0A' : '#9ca3af',
                fontStyle: 'italic',
                flexShrink: 0,
              }}>
                {ageInDays}d
              </span>
            )}
          </div>
          {collapsedMeta && (
            <div
              style={collapsedTaskMetaLineStyle}
              title={task.recurrence ? formatRecurrenceTooltip(task.recurrence) : undefined}
            >
              {collapsedMeta}
            </div>
          )}
        </div>
      </div>

      {/* Expandable edit panel */}
      {editing && (
        <TaskEditPanel task={task} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  color: '#1D212B',
  fontFamily: 'inherit',
  lineHeight: '1',
  transition: 'opacity 0.2s ease',
};

function getAgeDays(createdAt: any): number {
  if (!createdAt) return 0;
  const created = createdAt.seconds
    ? new Date(createdAt.seconds * 1000)
    : new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function formatLastCompleted(timestamp: unknown): string {
  if (!timestamp) return '';
  try {
    const t = timestamp as { seconds?: number };
    const d = t.seconds != null ? new Date(t.seconds * 1000) : new Date(timestamp as string);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase();
  } catch {
    return '';
  }
}

function formatRecurrenceTooltip(rec: RecurrenceRule): string {
  switch (rec.freq) {
    case 'daily': return 'Repeats daily';
    case 'weekly':
      if (rec.days && rec.days.length > 0) {
        return `Repeats weekly on ${rec.days.join(', ')}`;
      }
      return 'Repeats weekly';
    case 'monthly': return 'Repeats monthly';
    case 'yearly': return 'Repeats yearly';
    case 'periodically':
      return `Repeats ${rec.interval || 7} days after completion`;
    case 'custom': {
      const unit = rec.customUnit === 'monthly' ? 'months' : 'weeks';
      return `Repeats every ${rec.interval || 1} ${unit}`;
    }
    default: return `Repeats ${rec.freq}`;
  }
}
