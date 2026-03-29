import { useState, useEffect, useRef, useCallback } from 'react';
import type { Task, RecurrenceRule, Classification, Priority } from '../../types';
import { useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useProjects, useCreateProject } from '../../hooks/useProjects';
import { ProjectPicker } from './ProjectPicker';

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

function parseDeadline(deadline: string | null): { date: string; time: string } {
  if (!deadline) return { date: '', time: '' };
  try {
    const d = new Date(deadline);
    const date = d.toISOString().slice(0, 10);
    const time = d.getHours() || d.getMinutes() ? d.toTimeString().slice(0, 5) : '';
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

interface EditableTaskState {
  title: string;
  notes: string;
  classification: Classification;
  priority: Priority;
  projectId: string | null;
  deadline: string | null;
  recurrence: RecurrenceRule | null;
}

function buildEditableState(task: Task): EditableTaskState {
  const { date, time } = parseDeadline(task.deadline);
  const deadlineStr = date ? (time ? `${date}T${time}` : date) : null;
  return {
    title: task.title,
    notes: task.notes,
    classification: task.classification,
    priority: task.priority || 'low',
    projectId: task.projectId || null,
    deadline: deadlineStr,
    recurrence: task.recurrence || null,
  };
}

export function TaskEditPanel({ task, onClose, onComplete, onIcebox }: TaskEditPanelProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();

  const initialDeadline = parseDeadline(task.deadline);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [classification, setClassification] = useState<Classification>(task.classification);
  const [priority, setPriority] = useState<Priority>(task.priority || 'low');
  const [projectId, setProjectId] = useState(task.projectId || '');
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [showTime, setShowTime] = useState(!!initialDeadline.time);

  // Progressive disclosure: which optional fields are shown
  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [showProject, setShowProject] = useState(!!task.projectId);
  const [showDeadline, setShowDeadline] = useState(!!task.deadline);
  const [showRecurrence, setShowRecurrence] = useState(!!task.recurrence);

  // Recurrence state
  const [recMode, setRecMode] = useState<RecurrenceMode>(recurrenceToMode(task.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<string[]>(
    task.recurrence?.freq === 'weekly' && task.recurrence.days ? task.recurrence.days : []
  );
  const [periodicallyValue, setPeriodicallyValue] = useState(
    task.recurrence?.freq === 'periodically' ? (task.recurrence.interval || 7) : 7
  );
  const [periodicallyUnit, setPeriodicallyUnit] = useState<'hours' | 'days' | 'weeks'>(
    task.recurrence?.freq === 'periodically' ? (task.recurrence.periodUnit || 'days') : 'days'
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveTimeoutRef = useRef<number | null>(null);
  const savedStateRef = useRef<EditableTaskState>(buildEditableState(task));
  const latestSaveIdRef = useRef(0);

  // Auto-resize title textarea
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);
  useEffect(() => { autoResize(titleRef.current); }, [title, autoResize]);

  const buildRecurrence = useCallback((): RecurrenceRule | null => {
    if (!showRecurrence) return null;
    switch (recMode) {
      case 'daily': return { freq: 'daily' };
      case 'weekly': return weeklyDays.length > 0 ? { freq: 'weekly', days: weeklyDays } : { freq: 'weekly' };
      case 'monthly': return { freq: 'monthly' };
      case 'yearly': return { freq: 'yearly' };
      case 'periodically': return { freq: 'periodically', interval: periodicallyValue, periodUnit: periodicallyUnit };
      case 'custom': {
        const base: RecurrenceRule = { freq: 'custom', customUnit, interval: customInterval };
        if (customUnit === 'weekly' && customDays.length > 0) base.days = customDays;
        return base;
      }
      default: return null;
    }
  }, [showRecurrence, recMode, weeklyDays, periodicallyValue, periodicallyUnit, customUnit, customInterval, customDays]);

  const buildCurrentState = useCallback((): EditableTaskState => {
    const deadlineStr = (showDeadline && deadlineDate) ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : deadlineDate) : null;
    return {
      title,
      notes,
      classification,
      priority,
      projectId: projectId || null,
      deadline: deadlineStr,
      recurrence: buildRecurrence(),
    };
  }, [title, notes, classification, priority, projectId, showDeadline, deadlineDate, deadlineTime, buildRecurrence]);

  const buildUpdateData = useCallback((current: EditableTaskState) => {
    const data: any = {};
    const saved = savedStateRef.current;
    if (current.title !== saved.title) data.title = current.title;
    if (current.notes !== saved.notes) data.notes = current.notes;
    if (current.classification !== saved.classification) data.classification = current.classification;
    if (current.priority !== saved.priority) data.priority = current.priority;
    if (current.projectId !== saved.projectId) data.projectId = current.projectId;
    if (current.deadline !== saved.deadline) data.deadline = current.deadline;
    if (JSON.stringify(current.recurrence) !== JSON.stringify(saved.recurrence)) data.recurrence = current.recurrence;
    return data;
  }, []);

  const persistDraft = useCallback(async (current: EditableTaskState) => {
    const data = buildUpdateData(current);
    if (Object.keys(data).length === 0) return;

    const saveId = ++latestSaveIdRef.current;
    setSaveState('saving');
    try {
      await updateTask.mutateAsync({ id: task.id, data });
      savedStateRef.current = current;
      if (latestSaveIdRef.current === saveId) {
        setSaveState('saved');
      }
    } catch {
      if (latestSaveIdRef.current === saveId) {
        setSaveState('error');
      }
    }
  }, [buildUpdateData, task.id, updateTask]);

  const flushAutosave = useCallback(() => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    const current = buildCurrentState();
    void persistDraft(current);
  }, [buildCurrentState, persistDraft]);

  useEffect(() => {
    savedStateRef.current = buildEditableState(task);
    setSaveState('idle');
  }, [task.id]);

  useEffect(() => {
    const current = buildCurrentState();
    const data = buildUpdateData(current);
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (Object.keys(data).length === 0) {
      setSaveState(prev => (prev === 'error' ? 'error' : prev));
      return;
    }
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void persistDraft(current);
    }, 350);
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [buildCurrentState, buildUpdateData, persistDraft]);

  useEffect(() => () => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
      const current = buildCurrentState();
      void persistDraft(current);
    }
  }, [buildCurrentState, persistDraft]);

  const handleClose = () => {
    flushAutosave();
    onClose();
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id);
    onClose();
  };

  const handleRecModeChange = (mode: RecurrenceMode) => {
    setRecMode(mode);
    if (mode === 'weekly' && weeklyDays.length === 0 && deadlineDate) {
      setWeeklyDays([dayOfWeekFromDate(deadlineDate)]);
    }
    if (mode === 'custom' && customUnit === 'weekly' && customDays.length === 0 && deadlineDate) {
      setCustomDays([dayOfWeekFromDate(deadlineDate)]);
    }
    if (mode === 'periodically') {
      // Set defaults if not already set
      if (periodicallyUnit === 'hours') setPeriodicallyValue(24);
      else if (periodicallyUnit === 'weeks') setPeriodicallyValue(2);
      else setPeriodicallyValue(3);
    }
  };

  const handlePeriodicallyUnitChange = (unit: 'hours' | 'days' | 'weeks') => {
    setPeriodicallyUnit(unit);
    if (unit === 'hours') setPeriodicallyValue(24);
    else if (unit === 'weeks') setPeriodicallyValue(2);
    else setPeriodicallyValue(3);
  };

  const toggleDay = (day: string, days: string[], setDays: (d: string[]) => void) => {
    if (days.includes(day) && days.length <= 1) return;
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
  };

  const removeField = (field: 'notes' | 'project' | 'deadline' | 'recurrence') => {
    switch (field) {
      case 'notes': setShowNotes(false); setNotes(''); break;
      case 'project': setShowProject(false); setProjectId(''); break;
      case 'deadline': setShowDeadline(false); setDeadlineDate(''); setDeadlineTime(''); setShowRecurrence(false); setRecMode(''); break;
      case 'recurrence': setShowRecurrence(false); setRecMode(''); break;
    }
  };

  // Collect which add-field links to show
  const addLinks: { label: string; action: () => void }[] = [];
  if (!showNotes) addLinks.push({ label: '+ Add notes', action: () => setShowNotes(true) });
  if (!showProject) addLinks.push({ label: '+ Add project', action: () => setShowProject(true) });
  if (!showDeadline) addLinks.push({ label: '+ Add deadline', action: () => setShowDeadline(true) });
  if (showDeadline && !showRecurrence) addLinks.push({ label: '+ Add recurrence', action: () => { setShowRecurrence(true); if (!recMode) handleRecModeChange('weekly'); } });

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
      <textarea
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        rows={1}
        style={{ ...inputStyle, fontWeight: 600, marginBottom: '8px', resize: 'none', overflow: 'hidden' }}
      />

      {/* Type toggle — always visible */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {(['boulder', 'rock', 'pebble'] as const).map((type) => {
          const active = classification === type;
          const color = active ? '#FF7A7A' : '#e5e7eb';
          return (
            <button
              key={type}
              onClick={() => setClassification(type)}
              style={{
                padding: '6px 18px',
                border: `1px solid ${color}`,
                borderRadius: '8px',
                background: active ? '#FF7A7A' : '#f9fafb',
                color: active ? '#fff' : '#4b5563',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              {type === 'boulder' ? 'Boulder' : type === 'rock' ? 'Rock' : 'Pebble'}
            </button>
          );
        })}
      </div>

      {/* Priority toggle */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
        <span style={labelStyle}>Priority:</span>
        {(['high', 'med', 'low'] as const).map((p) => {
          const active = priority === p;
          const colors: Record<Priority, string> = { high: '#ef4444', med: '#f59e0b', low: '#9ca3af' };
          const color = colors[p];
          return (
            <button
              key={p}
              onClick={() => setPriority(p)}
              style={{
                padding: '4px 14px',
                border: `1px solid ${active ? color : '#e5e7eb'}`,
                borderRadius: '8px',
                background: active ? color : '#f9fafb',
                color: active ? '#fff' : '#4b5563',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
                textTransform: 'capitalize',
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Notes — progressive */}
      {showNotes && (
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes..."
            style={{ ...inputStyle, minHeight: '40px', resize: 'vertical' }}
          />
          <span onClick={() => removeField('notes')} style={removeXStyle} title="Remove notes">✕</span>
        </div>
      )}

      {/* Project — progressive */}
      {showProject && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Project:</span>
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            onCreateProject={(name) => createProject.mutateAsync({ name })}
          />
          <span onClick={() => removeField('project')} style={removeXStyle} title="Remove project">✕</span>
        </div>
      )}

      {/* Deadline — progressive */}
      {showDeadline && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={labelStyle}>Deadline:</span>
          <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} style={selectStyle} />
          {showTime ? (
            <input type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)} style={selectStyle} />
          ) : (
            <span onClick={() => setShowTime(true)} style={addFieldStyle}>+ Add time</span>
          )}
          <span onClick={() => removeField('deadline')} style={removeXStyle} title="Remove deadline">✕</span>
        </div>
      )}

      {/* Recurrence — progressive */}
      {showRecurrence && showDeadline && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
            <span style={labelStyle}>Repeats:</span>
            <select value={recMode} onChange={e => handleRecModeChange(e.target.value as RecurrenceMode)} style={selectStyle}>
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="periodically">Periodically</option>
              <option value="custom">Custom</option>
            </select>
            <span onClick={() => removeField('recurrence')} style={removeXStyle} title="Remove recurrence">✕</span>
          </div>

          {/* Weekly day picker */}
          {recMode === 'weekly' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Reschedule</span>
              <input
                type="number" min={1} value={periodicallyValue}
                onChange={e => setPeriodicallyValue(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ ...selectStyle, width: '52px', textAlign: 'center' }}
              />
              <select
                value={periodicallyUnit}
                onChange={e => handlePeriodicallyUnitChange(e.target.value as any)}
                style={selectStyle}
              >
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>after completion</span>
            </div>
          )}

          {/* Custom */}
          {recMode === 'custom' && (
            <div>
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
        </div>
      )}

      {/* Add-field links */}
      {addLinks.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {addLinks.map(link => (
            <span
              key={link.label}
              onClick={link.action}
              style={addFieldStyle}
            >
              {link.label}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            style={{ ...iconBtnStyle, color: '#ef4444', borderColor: '#fca5a5' }}
            title="Delete task"
          >
            🗑
          </button>
        ) : (
          <button
            onClick={handleDelete}
            style={{ ...iconBtnStyle, background: '#ef4444', color: '#fff', borderColor: '#ef4444', width: 'auto', padding: '0 10px' }}
            title="Confirm delete"
          >
            Delete
          </button>
        )}
        {onComplete && (
          <button
            onClick={() => { flushAutosave(); onComplete(task.id); onClose(); }}
            style={{ ...iconBtnStyle, color: '#22c55e', borderColor: '#bbf7d0' }}
            title="Complete"
          >
            ✓
          </button>
        )}
        {onIcebox && (
          <button
            onClick={() => { flushAutosave(); onIcebox(task.id); onClose(); }}
            style={{ ...iconBtnStyle, color: '#6b7280' }}
            title="Icebox"
          >
            ❄
          </button>
        )}
        <div style={saveStatusStyle}>
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleClose} style={iconBtnStyle} title="Close">✕</button>
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

const iconBtnStyle: React.CSSProperties = {
  width: '30px',
  height: '28px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: 'all 0.15s ease',
};

const removeXStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#d1d5db',
  cursor: 'pointer',
  transition: 'color 0.15s',
  userSelect: 'none',
  padding: '0 2px',
};

const addFieldStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '3px 0',
  transition: 'color 0.15s',
  userSelect: 'none',
};

const saveStatusStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  minWidth: '64px',
};
