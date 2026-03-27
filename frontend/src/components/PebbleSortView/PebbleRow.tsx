import { useState } from 'react';
import type { Task, RecurrenceRule } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';

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

  const staleThreshold = Math.max(10, Math.floor(totalCount * 0.8));
  const isStale = index >= staleThreshold && task.createdAt;
  const ageInDays = task.createdAt ? getAgeDays(task.createdAt) : null;
  const staleOpacity = isStale && ageInDays && ageInDays > 7
    ? Math.min((ageInDays - 7) / 30, 0.15)
    : 0;
  const deadlineStr = task.deadline ? formatDeadline(task.deadline) : null;

  return (
    <div
      style={{
        background: isDragOver ? '#fef3c7' : staleOpacity > 0 ? `rgba(200, 180, 140, ${staleOpacity})` : '#fff',
        border: `1px solid ${isDragOver ? '#FF7A7A' : '#e5e7eb'}`,
        borderRadius: '12px',
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
          alignItems: 'center',
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

        {/* Task name — click to edit */}
        <span
          onClick={() => setEditing(!editing)}
          style={{
            flex: 1,
            fontSize: '14px',
            color: '#1f2937',
            cursor: 'pointer',
            borderBottom: editing ? '1px dashed #FF7A7A' : '1px dashed transparent',
            transition: 'border-color 0.15s',
          }}
          title="Click to edit"
        >
          {task.title}
          {task.recurrence && (
            <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '6px' }} title={formatRecurrenceTooltip(task.recurrence)}>
              ↻ {formatRecurrenceLabel(task.recurrence)}
            </span>
          )}
        </span>

        {/* Deadline flag */}
        {deadlineStr && (
          <span style={{ fontSize: '12px', color: '#FF6B6B', whiteSpace: 'nowrap' }}>
            ⚑ {deadlineStr}
          </span>
        )}

        {/* Staleness */}
        {ageInDays !== null && ageInDays > 7 && (
          <span style={{
            fontSize: '11px',
            color: ageInDays > 30 ? '#FF6B6B' : ageInDays > 14 ? '#f59e0b' : '#9ca3af',
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
          }}>
            {ageInDays}d
          </span>
        )}
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
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '12px',
  color: '#4b5563',
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

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}

const DAY_SHORT: Record<string, string> = {
  mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su',
};

function formatRecurrenceLabel(rec: RecurrenceRule): string {
  switch (rec.freq) {
    case 'daily': return 'daily';
    case 'weekly':
      if (rec.days && rec.days.length > 0 && rec.days.length < 7) {
        return rec.days.map(d => DAY_SHORT[d] || d).join('/');
      }
      return 'weekly';
    case 'monthly': return 'monthly';
    case 'yearly': return 'yearly';
    case 'periodically':
      return `every ${rec.interval || 7}d`;
    case 'custom': {
      const unit = rec.customUnit === 'monthly' ? 'mo' : 'wk';
      const label = `every ${rec.interval || 1}${unit}`;
      if (rec.customUnit === 'weekly' && rec.days && rec.days.length > 0) {
        return `${label} ${rec.days.map(d => DAY_SHORT[d] || d).join('/')}`;
      }
      return label;
    }
    default: return rec.freq;
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
