import { useState } from 'react';
import type { Task, Classification, RecurrenceRule } from '../../types';
import { useProjects, useCreateProject } from '../../hooks/useProjects';
import { ProjectPicker } from '../shared/ProjectPicker';

interface TriageCardProps {
  task: Task;
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

export function TriageCard({ task, onClassify, onDelete }: TriageCardProps) {
  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();
  const [projectId, setProjectId] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [removing, setRemoving] = useState(false);

  // Progressive disclosure
  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [showProject, setShowProject] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);

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
    if (!showRecurrence) return null;
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
          (showDeadline && deadline) ? deadline : null,
          buildRecurrence(),
        );
      }
    }, 350);
  };

  const toggleDay = (day: string, days: string[], setDays: (d: string[]) => void) => {
    if (days.includes(day) && days.length <= 1) return;
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
  };

  const removeField = (field: 'notes' | 'project' | 'deadline' | 'recurrence') => {
    switch (field) {
      case 'notes': setShowNotes(false); break;
      case 'project': setShowProject(false); setProjectId(''); break;
      case 'deadline': setShowDeadline(false); setDeadline(''); setShowRecurrence(false); setRecMode(''); break;
      case 'recurrence': setShowRecurrence(false); setRecMode(''); break;
    }
  };

  // Collect add-field links
  const addLinks: { label: string; action: () => void }[] = [];
  if (!showNotes) addLinks.push({ label: '+ Add notes', action: () => setShowNotes(true) });
  if (!showProject) addLinks.push({ label: '+ Add project', action: () => setShowProject(true) });
  if (!showDeadline) addLinks.push({ 
    label: '+ Add deadline', 
    action: () => { 
      setShowDeadline(true); 
      if (!deadline) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        setDeadline(today);
      }
    } 
  });
  if (showDeadline && !showRecurrence) addLinks.push({ label: '+ Add recurrence', action: () => { setShowRecurrence(true); if (!recMode) setRecMode('weekly'); } });

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E7E3DF',
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
      <div style={{ fontSize: '14px', fontWeight: 500, color: '#1D212B', marginBottom: '8px' }}>
        {task.title}
      </div>

      {/* Classify + Delete — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <button onClick={() => handleAction('boulder')} style={btnStyle}>
          🪨 Boulder
        </button>
        <button onClick={() => handleAction('rock')} style={btnStyle}>
          Rock
        </button>
        <button onClick={() => handleAction('pebble')} style={btnStyle}>
          Pebble
        </button>
        <button onClick={() => handleAction('delete')} style={{ ...btnStyle, borderColor: '#FCEDED', color: '#DC2828' }}>
          Delete
        </button>
      </div>

      {/* Notes — progressive */}
      {showNotes && (
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <textarea
            defaultValue={task.notes}
            placeholder="Add notes..."
            style={{
              width: '100%',
              border: '1px solid #E7E3DF',
              borderRadius: '10px',
              padding: '8px 12px',
              fontSize: '13px',
              resize: 'vertical',
              minHeight: '50px',
              fontFamily: 'inherit',
              color: '#1D212B',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#fafafa',
            }}
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Deadline:</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={selectStyle} />
          <span onClick={() => removeField('deadline')} style={removeXStyle} title="Remove deadline">✕</span>
        </div>
      )}

      {/* Recurrence — progressive */}
      {showRecurrence && showDeadline && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
            <span style={labelStyle}>Repeats:</span>
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
            <span onClick={() => removeField('recurrence')} style={removeXStyle} title="Remove recurrence">✕</span>
          </div>

          {/* Weekly: day-of-week picker */}
          {recMode === 'weekly' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>On:</span>
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day, weeklyDays, setWeeklyDays)}
                  style={{
                    ...dayBtnStyle,
                    background: weeklyDays.includes(day) ? '#EA6657' : '#F2F0ED',
                    color: weeklyDays.includes(day) ? '#fff' : '#1D212B',
                    borderColor: weeklyDays.includes(day) ? '#EA6657' : '#E7E3DF',
                  }}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          )}

          {/* Periodically: days-after-completion picker */}
          {recMode === 'periodically' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <div>
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
                        background: customDays.includes(day) ? '#EA6657' : '#F2F0ED',
                        color: customDays.includes(day) ? '#fff' : '#1D212B',
                        borderColor: customDays.includes(day) ? '#EA6657' : '#E7E3DF',
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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
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
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  border: '1px solid #E7E3DF',
  borderRadius: '12px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'opacity 0.2s ease',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  fontSize: '13px',
  background: '#fff',
  fontFamily: 'inherit',
  color: '#1D212B',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
};

const dayBtnStyle: React.CSSProperties = {
  width: '30px',
  height: '28px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
