import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, Check, Snowflake, Calendar, Clock, Plus, Repeat, FileText, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
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

/**
 * Split deadline into date + optional time for the editor.
 * Date-only tasks use `YYYY-MM-DD` or ISO UTC midnight from Firestore; those must not
 * infer a bogus local clock time (which made the time field look required).
 */
function parseDeadline(deadline: string | null): { date: string; time: string } {
  if (!deadline) return { date: '', time: '' };
  const s = deadline.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { date: s, time: '' };
  }

  const utcMidnight = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(s);
  if (utcMidnight) {
    return { date: utcMidnight[1], time: '' };
  }

  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${day}`;
    const h = d.getHours();
    const min = d.getMinutes();
    const sec = d.getSeconds();
    const ms = d.getMilliseconds();
    if (h === 0 && min === 0 && sec === 0 && ms === 0) {
      return { date, time: '' };
    }
    const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
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

const PRIORITY_CLASSES: Record<Priority, { active: string; inactive: string }> = {
  high: {
    active: 'bg-priority-high text-white border-priority-high',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-high-bg',
  },
  med: {
    active: 'bg-priority-med text-white border-priority-med',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-med-bg',
  },
  low: {
    active: 'bg-priority-low text-white border-priority-low',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-low-bg',
  },
};

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
  const addLinks: { label: string; icon: React.ReactNode; action: () => void }[] = [];
  if (!showNotes) addLinks.push({ label: 'Notes', icon: <FileText className="w-3 h-3" />, action: () => setShowNotes(true) });
  if (!showProject) addLinks.push({ label: 'Project', icon: <FolderOpen className="w-3 h-3" />, action: () => setShowProject(true) });
  if (!showDeadline) addLinks.push({
    label: 'Deadline',
    icon: <Calendar className="w-3 h-3" />,
    action: () => {
      setShowDeadline(true);
      if (!deadlineDate) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        setDeadlineDate(today);
      }
    }
  });
  if (showDeadline && !showRecurrence) addLinks.push({
    label: 'Recurrence',
    icon: <Repeat className="w-3 h-3" />,
    action: () => { setShowRecurrence(true); if (!recMode) handleRecModeChange('weekly'); }
  });

  return (
    <div
      className="p-4 bg-card border-t border-border animate-in slide-in-from-top-2 duration-200"
      onClick={e => e.stopPropagation()}
    >
      {/* Title */}
      <textarea
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        rows={1}
        className={cn(
          "w-full px-3 py-2 mb-4 text-[15px] font-semibold text-foreground leading-snug",
          "bg-transparent border-0 resize-none overflow-hidden",
          "focus:outline-none",
          "placeholder:text-muted-foreground"
        )}
        placeholder="Task title..."
      />

      {/* Notes - Progressive */}
      {showNotes && (
        <div className="relative mb-4">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Notes
          </label>
          <div className="relative">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes..."
              className={cn(
                "w-full min-h-[72px] px-3 py-2 text-[13px] text-foreground leading-relaxed",
                "bg-card border border-input rounded-lg resize-y",
                "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring",
                "transition-all duration-150 placeholder:text-muted-foreground"
              )}
            />
            <button
              onClick={() => removeField('notes')}
              className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove notes"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Project - Progressive */}
      {showProject && (
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Project
          </label>
          <div className="flex items-center gap-2">
            <ProjectPicker
              projects={projects}
              value={projectId}
              onChange={setProjectId}
              onCreateProject={(name) => createProject.mutateAsync({ name })}
            />
            <button
              onClick={() => removeField('project')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove project"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Deadline - Progressive */}
      {showDeadline && (
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Deadline
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                required={false}
                value={deadlineDate}
                onChange={e => setDeadlineDate(e.target.value)}
                className={cn(
                  "h-8 pl-8 pr-3 text-[13px] rounded-md",
                  "bg-card border border-input text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring",
                  "transition-all duration-150"
                )}
              />
            </div>
            {showTime ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="relative">
                  <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="time"
                    required={false}
                    value={deadlineTime}
                    onChange={e => setDeadlineTime(e.target.value)}
                    className={cn(
                      "h-8 pl-8 pr-3 text-[13px] rounded-md",
                      "bg-card border border-input text-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring",
                      "transition-all duration-150"
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeadlineTime('');
                    setShowTime(false);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
                >
                  Date only
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTime(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add time
              </button>
            )}
            <button
              onClick={() => removeField('deadline')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove deadline"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Recurrence - Progressive */}
      {showRecurrence && showDeadline && (
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Repeats
          </label>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={recMode}
              onChange={e => handleRecModeChange(e.target.value as RecurrenceMode)}
              className={cn(
                "h-8 px-3 text-[13px] rounded-md appearance-none",
                "bg-card border border-input text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring",
                "transition-all duration-150"
              )}
            >
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="periodically">Periodically</option>
              <option value="custom">Custom</option>
            </select>
            <button
              onClick={() => removeField('recurrence')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove recurrence"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekly day picker */}
          {recMode === 'weekly' && (
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[11px] text-muted-foreground mr-1">On:</span>
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day, weeklyDays, setWeeklyDays)}
                  className={cn(
                    "w-7 h-6 text-[11px] font-medium rounded border transition-all duration-150",
                    weeklyDays.includes(day)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-input hover:bg-secondary"
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          )}

          {/* Periodically */}
          {recMode === 'periodically' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Reschedule</span>
              <input
                type="number"
                min={1}
                value={periodicallyValue}
                onChange={e => setPeriodicallyValue(Math.max(1, parseInt(e.target.value) || 1))}
                className={cn(
                  "w-14 h-8 px-2 text-[13px] text-center rounded-md",
                  "bg-card border border-input text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                )}
              />
              <select
                value={periodicallyUnit}
                onChange={e => handlePeriodicallyUnitChange(e.target.value as any)}
                className={cn(
                  "h-8 px-3 text-[13px] rounded-md appearance-none",
                  "bg-card border border-input text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                )}
              >
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <span className="text-[11px] text-muted-foreground">after completion</span>
            </div>
          )}

          {/* Custom */}
          {recMode === 'custom' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Every</span>
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={customInterval}
                  onChange={e => setCustomInterval(Math.min(26, Math.max(1, parseInt(e.target.value) || 1)))}
                  className={cn(
                    "w-14 h-8 px-2 text-[13px] text-center rounded-md",
                    "bg-card border border-input text-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                  )}
                />
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value as 'weekly' | 'monthly')}
                  className={cn(
                    "h-8 px-3 text-[13px] rounded-md appearance-none",
                    "bg-card border border-input text-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                  )}
                >
                  <option value="weekly">{customInterval === 1 ? 'week' : 'weeks'}</option>
                  <option value="monthly">{customInterval === 1 ? 'month' : 'months'}</option>
                </select>
              </div>
              {customUnit === 'weekly' && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground mr-1">On:</span>
                  {ALL_DAYS.map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day, customDays, setCustomDays)}
                      className={cn(
                        "w-7 h-6 text-[11px] font-medium rounded border transition-all duration-150",
                        customDays.includes(day)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-input hover:bg-secondary"
                      )}
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
        <div className="flex flex-wrap gap-1.5 mb-4">
          {addLinks.map(link => (
            <button
              key={link.label}
              onClick={link.action}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-secondary",
                "transition-all duration-150"
              )}
            >
              <Plus className="w-3 h-3" />
              {link.label}
            </button>
          ))}
        </div>
      )}

      {/* Priority Toggle - Color-coded chips */}
      <div className="mb-4">
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Priority
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(['high', 'med', 'low'] as const).map((p) => {
            const active = priority === p;
            const classes = PRIORITY_CLASSES[p];
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  "px-3 py-1 text-[12px] font-medium rounded-full border transition-all duration-150",
                  active ? classes.active : classes.inactive
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Classification Toggle - Pill style */}
      <div className="mb-4">
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Classification
        </label>
        <div className="flex rounded-full border border-border bg-card p-0.5 w-fit">
          {(['boulder', 'rock', 'pebble'] as const).map((type) => {
            const active = classification === type;
            return (
              <button
                key={type}
                onClick={() => setClassification(type)}
                className={cn(
                  "px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "text-destructive/70 hover:text-destructive hover:bg-destructive/10",
              "transition-all duration-150"
            )}
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleDelete}
            className={cn(
              "flex items-center justify-center h-8 px-3 rounded-md",
              "bg-destructive text-destructive-foreground font-medium text-[12px]",
              "hover:bg-destructive/90 transition-all duration-150"
            )}
            title="Confirm delete"
          >
            Delete
          </button>
        )}
        {onComplete && (
          <button
            onClick={() => { flushAutosave(); onComplete(task.id); onClose(); }}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "text-emerald-600 hover:bg-emerald-50",
              "transition-all duration-150"
            )}
            title="Complete"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {onIcebox && (
          <button
            onClick={() => { flushAutosave(); onIcebox(task.id); onClose(); }}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-secondary",
              "transition-all duration-150"
            )}
            title="Icebox"
          >
            <Snowflake className="w-4 h-4" />
          </button>
        )}

        {/* Save Status */}
        <div className="text-[11px] text-muted-foreground min-w-[50px]">
          {saveState === 'saving' && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              Saving...
            </span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
          {saveState === 'error' && (
            <span className="text-destructive">Save failed</span>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={handleClose}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-md",
            "text-muted-foreground hover:text-foreground hover:bg-secondary",
            "transition-all duration-150"
          )}
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
