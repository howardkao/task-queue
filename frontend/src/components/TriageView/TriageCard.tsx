import { useState } from 'react';
import type { Task, Classification, RecurrenceRule } from '../../types';

interface TriageCardProps {
  task: Task;
  projects: Array<{ id: string; name: string }>;
  onClassify: (id: string, classification: Classification, projectId?: string | null, deadline?: string | null, recurrence?: RecurrenceRule | null) => void;
  onDelete: (id: string) => void;
}

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su',
};

type RecurrenceMode = '' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'periodically' | 'custom';

const INDEX_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dayOfWeekFromDate(dateStr: string): string {
  try {
    return INDEX_TO_DAY[new Date(dateStr + 'T12:00:00').getDay()];
  } catch {
    return 'mon';
  }
}

export function TriageCard({ task, projects, onClassify, onDelete }: TriageCardProps) {
  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [projectId, setProjectId] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [removing, setRemoving] = useState(false);

  // Recurrence state
  const [recMode, setRecMode] = useState<RecurrenceMode>('');
  const [weeklyDays, setWeeklyDays] = useState<string[]>([]);
  const [periodicallyDays, setPeriodicallyDays] = useState(7);
  const [customUnit, setCustomUnit] = useState<'weekly' | 'monthly'>('weekly');
  const [customInterval, setCustomInterval] = useState(2);
  const [customDays, setCustomDays] = useState<string[]>([]);

  const handleRecModeChange = (mode: RecurrenceMode) => {
    setRecMode(mode);
    if ((mode === 'weekly') && weeklyDays.length === 0 && deadline) {
      setWeeklyDays([dayOfWeekFromDate(deadline)]);
    }
    if (mode === 'custom' && customUnit === 'weekly' && customDays.length === 0 && deadline) {
      setCustomDays([dayOfWeekFromDate(deadline)]);
    }
  };

  const buildRecurrence = (): RecurrenceRule | null => {
    switch (recMode) {
      case 'daily':
        return { freq: 'daily' };
      case 'weekly':
        return { freq: 'weekly', days: weeklyDays.length > 0 ? weeklyDays : undefined };
      case 'monthly':
        return { freq: 'monthly' };
      case 'yearly':
        return { freq: 'yearly' };
      case 'periodically':
        return { freq: 'periodically', interval: periodicallyDays };
      case 'custom':
        return {
          freq: 'custom',
          customUnit,
          interval: customInterval,
          days: customUnit === 'weekly' && customDays.length > 0 ? customDays : undefined,
        };
      default:
        return null;
    }
  };

  const handleAction = (classification: Classification | 'delete') => {
    setRemoving(true);
    setTimeout(() => {
      if (classification === 'delete') {
        onDelete(task.id);
      } else {
        onClassify(
          task.id,
          classification,
          projectId || null,
          deadline || null,
          buildRecurrence(),
        );
      }
    }, 350);
  };

  const toggleDay = (day: string, days: string[], setDays: (d: string[]) => void) => {
    if (days.includes(day) && days.length <= 1) return; // prevent empty
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
  };

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: removing ? '0 16px' : '16px',
        marginBottom: removing ? '0' : '10px',
        opacity: removing ? 0 : 1,
        transform: removing ? 'translateX(60px)' : 'none',
        maxHeight: removing ? '0' : '800px',
        overflow: 'hidden',
        transition: 'all 0.35s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
        {task.title}
      </div>

      <div
        style={{ fontSize: '12px', color: '#9ca3af', cursor: 'pointer', marginBottom: '8px' }}
        onClick={() => setShowNotes(!showNotes)}
      >
        {showNotes ? '▲' : '▼'} Notes
      </div>

      {showNotes && (
        <div style={{ marginBottom: '10px' }}>
          <textarea
            defaultValue={task.notes}
            placeholder="Add notes..."
            style={{
              width: '100%',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '8px 12px',
              fontSize: '13px',
              resize: 'vertical',
              minHeight: '50px',
              fontFamily: 'inherit',
              color: '#4b5563',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => handleAction('boulder')} style={btnStyle}>
          🪨 Boulder
        </button>
        <button onClick={() => handleAction('pebble')} style={btnStyle}>
          Pebble
        </button>
        <button onClick={() => handleAction('delete')} style={{ ...btnStyle, borderColor: '#fca5a5', color: '#ef4444' }}>
          Delete
        </button>
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={labelStyle}>
          Project:{' '}
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={selectStyle}>
            <option value="">None</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Deadline:{' '}
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={selectStyle} />
        </label>
        {deadline && (
          <label style={labelStyle}>
            Repeats:{' '}
            <select
              value={recMode}
              onChange={e => handleRecModeChange(e.target.value as RecurrenceMode)}
              style={selectStyle}
            >
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="periodically">Periodically</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        )}
      </div>

      {/* Weekly: day-of-week picker */}
      {recMode === 'weekly' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>On:</span>
          {ALL_DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day, weeklyDays, setWeeklyDays)}
              style={{
                ...dayBtnStyle,
                background: weeklyDays.includes(day) ? '#FF7A7A' : '#f9fafb',
                color: weeklyDays.includes(day) ? '#fff' : '#4b5563',
                borderColor: weeklyDays.includes(day) ? '#FF7A7A' : '#e5e7eb',
              }}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      )}

      {/* Periodically: days-after-completion picker */}
      {recMode === 'periodically' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Reschedule</span>
          <input
            type="number"
            min={1}
            max={30}
            value={periodicallyDays}
            onChange={e => setPeriodicallyDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
            style={{ ...selectStyle, width: '52px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>days after completion</span>
        </div>
      )}

      {/* Custom: unit toggle + interval + optional day picker */}
      {recMode === 'custom' && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Every</span>
            <input
              type="number"
              min={1}
              max={26}
              value={customInterval}
              onChange={e => setCustomInterval(Math.min(26, Math.max(1, parseInt(e.target.value) || 1)))}
              style={{ ...selectStyle, width: '52px', textAlign: 'center' }}
            />
            <select
              value={customUnit}
              onChange={e => setCustomUnit(e.target.value as 'weekly' | 'monthly')}
              style={selectStyle}
            >
              <option value="weekly">{customInterval === 1 ? 'week' : 'weeks'}</option>
              <option value="monthly">{customInterval === 1 ? 'month' : 'months'}</option>
            </select>
          </div>
          {customUnit === 'weekly' && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>On:</span>
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day, customDays, setCustomDays)}
                  style={{
                    ...dayBtnStyle,
                    background: customDays.includes(day) ? '#FF7A7A' : '#f9fafb',
                    color: customDays.includes(day) ? '#fff' : '#4b5563',
                    borderColor: customDays.includes(day) ? '#FF7A7A' : '#e5e7eb',
                  }}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  transition: 'opacity 0.2s ease',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '13px',
  background: '#fff',
  fontFamily: 'inherit',
  color: '#4b5563',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
};

const dayBtnStyle: React.CSSProperties = {
  width: '30px',
  height: '28px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'inherit',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
};
