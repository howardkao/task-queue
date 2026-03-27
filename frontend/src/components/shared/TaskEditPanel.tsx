import { useState, useEffect } from 'react';
import type { Task, RecurrenceRule } from '../../types';
import { useUpdateTask } from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';

interface TaskEditPanelProps {
  task: Task;
  onClose: () => void;
  onComplete?: (id: string) => void;
  onIcebox?: (id: string) => void;
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

function recurrenceToMode(rec: RecurrenceRule | null): RecurrenceMode {
  if (!rec) return '';
  return rec.freq as RecurrenceMode;
}

function parseDeadline(deadline: string | null): string {
  if (!deadline) return '';
  try {
    const d = new Date(deadline);
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function TaskEditPanel({ task, onClose, onComplete, onIcebox }: TaskEditPanelProps) {
  const updateTask = useUpdateTask();
  const { data: projects = [] } = useProjects('active');

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [projectId, setProjectId] = useState(task.projectId || '');
  const [deadline, setDeadline] = useState(parseDeadline(task.deadline));

  // Recurrence state
  const [recMode, setRecMode] = useState<RecurrenceMode>(recurrenceToMode(task.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<string[]>(
    task.recurrence?.freq === 'weekly' && task.recurrence.days ? task.recurrence.days : []
  );
  const [periodicallyDays, setPeriodicallyDays] = useState(
    task.recurrence?.freq === 'periodically' ? (task.recurrence.interval || 7) : 7
  );
  const [customUnit, setCustomUnit] = useState<'weekly' | 'monthly'>(
    task.recurrence?.freq === 'custom' ? (task.recurrence.customUnit || 'weekly') : 'weekly'
  );
  const [customInterval, setCustomInterval] = useState(
    task.recurrence?.freq === 'custom' ? (task.recurrence.interval || 2) : 2
  );
  const [customDays, setCustomDays] = useState<string[]>(
    task.recurrence?.freq === 'custom' && task.recurrence.days ? task.recurrence.days : []
  );

  const [dirty, setDirty] = useState(false);

  // Track changes
  useEffect(() => { setDirty(true); }, [title, notes, projectId, deadline, recMode, weeklyDays, periodicallyDays, customUnit, customInterval, customDays]);
  useEffect(() => { setDirty(false); }, []); // reset on mount

  const buildRecurrence = (): RecurrenceRule | null => {
    switch (recMode) {
      case 'daily': return { freq: 'daily' };
      case 'weekly': return { freq: 'weekly', days: weeklyDays.length > 0 ? weeklyDays : undefined };
      case 'monthly': return { freq: 'monthly' };
      case 'yearly': return { freq: 'yearly' };
      case 'periodically': return { freq: 'periodically', interval: periodicallyDays };
      case 'custom': return {
        freq: 'custom', customUnit, interval: customInterval,
        days: customUnit === 'weekly' && customDays.length > 0 ? customDays : undefined,
      };
      default: return null;
    }
  };

  const handleSave = () => {
    const data: any = {};
    if (title !== task.title) data.title = title;
    if (notes !== task.notes) data.notes = notes;
    if ((projectId || null) !== (task.projectId || null)) data.projectId = projectId || null;

    const newDeadline = deadline || null;
    const oldDeadline = parseDeadline(task.deadline) || null;
    if (newDeadline !== oldDeadline) data.deadline = newDeadline;

    const newRec = buildRecurrence();
    if (JSON.stringify(newRec) !== JSON.stringify(task.recurrence)) data.recurrence = newRec;

    if (Object.keys(data).length > 0) {
      updateTask.mutate({ id: task.id, data });
    }
    onClose();
  };

  const handleRecModeChange = (mode: RecurrenceMode) => {
    setRecMode(mode);
    if (mode === 'weekly' && weeklyDays.length === 0 && deadline) {
      setWeeklyDays([dayOfWeekFromDate(deadline)]);
    }
    if (mode === 'custom' && customUnit === 'weekly' && customDays.length === 0 && deadline) {
      setCustomDays([dayOfWeekFromDate(deadline)]);
    }
  };

  const toggleDay = (day: string, days: string[], setDays: (d: string[]) => void) => {
    if (days.includes(day) && days.length <= 1) return; // prevent empty
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
  };

  return (
    <div
      style={{
        padding: '12px',
        background: '#fafafa',
        borderTop: '1px solid #e5e7eb',
        animation: 'slideDown 0.15s ease',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ ...inputStyle, fontWeight: 600, marginBottom: '8px' }}
      />

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes..."
        style={{ ...inputStyle, minHeight: '40px', resize: 'vertical', marginBottom: '8px' }}
      />

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
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
            <select value={recMode} onChange={e => handleRecModeChange(e.target.value as RecurrenceMode)} style={selectStyle}>
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

      {/* Weekly day picker */}
      {recMode === 'weekly' && (
        <div style={{ marginBottom: '8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>On:</span>
          {ALL_DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day, weeklyDays, setWeeklyDays)}
              style={{
                ...dayBtnStyle,
                background: weeklyDays.includes(day) ? '#FF7A7A' : '#fff',
                color: weeklyDays.includes(day) ? '#fff' : '#4b5563',
                borderColor: weeklyDays.includes(day) ? '#FF7A7A' : '#e5e7eb',
              }}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      )}

      {/* Periodically */}
      {recMode === 'periodically' && (
        <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Reschedule</span>
          <input
            type="number" min={1} max={30} value={periodicallyDays}
            onChange={e => setPeriodicallyDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
            style={{ ...selectStyle, width: '52px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>days after completion</span>
        </div>
      )}

      {/* Custom */}
      {recMode === 'custom' && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Every</span>
            <input
              type="number" min={1} max={26} value={customInterval}
              onChange={e => setCustomInterval(Math.min(26, Math.max(1, parseInt(e.target.value) || 1)))}
              style={{ ...selectStyle, width: '52px', textAlign: 'center' }}
            />
            <select value={customUnit} onChange={e => setCustomUnit(e.target.value as 'weekly' | 'monthly')} style={selectStyle}>
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
                    background: customDays.includes(day) ? '#FF7A7A' : '#fff',
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

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {onComplete && (
          <button
            onClick={() => { onComplete(task.id); onClose(); }}
            style={{ ...actionBtnStyle, color: '#22c55e', borderColor: '#bbf7d0' }}
          >
            Complete
          </button>
        )}
        {onIcebox && (
          <button
            onClick={() => { onIcebox(task.id); onClose(); }}
            style={{ ...actionBtnStyle, color: '#6b7280' }}
          >
            Icebox
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={actionBtnStyle}>Cancel</button>
        <button
          onClick={handleSave}
          style={{
            ...actionBtnStyle,
            background: dirty ? '#FF7A7A' : '#f9fafb',
            color: dirty ? '#fff' : '#4b5563',
            borderColor: dirty ? '#FF7A7A' : '#e5e7eb',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
  color: '#1f2937',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '12px',
  background: '#fff',
  fontFamily: 'inherit',
  color: '#4b5563',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
};

const dayBtnStyle: React.CSSProperties = {
  width: '28px',
  height: '26px',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 600,
  fontFamily: 'inherit',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};
