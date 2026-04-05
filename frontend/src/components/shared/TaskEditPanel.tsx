import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, Check, Snowflake, Calendar, Clock, Plus, Repeat, FileText, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task, RecurrenceRule, Classification, Priority } from '../../types';
import { useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useProjects, useCreateProject } from '../../hooks/useProjects';
import { ProjectPicker } from './ProjectPicker';
import { TaskRecurrenceSection } from './TaskRecurrenceSection';
import {
  buildEditableState,
  dayOfWeekFromDate,
  parseDeadline,
  PRIORITY_CLASSES,
  recurrenceToMode,
  type EditableTaskState,
  type RecurrenceMode,
} from './taskEditPanelModel';

interface TaskEditPanelProps {
  task: Task;
  onClose: () => void;
  onComplete?: (id: string) => void;
  onIcebox?: (id: string) => void;
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

  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [showProject, setShowProject] = useState(!!task.projectId);
  const [showDeadline, setShowDeadline] = useState(!!task.deadline);
  const [showRecurrence, setShowRecurrence] = useState(!!task.recurrence);
  const [excludeFromFamily, setExcludeFromFamily] = useState(task.excludeFromFamily);
  const [familyPinned, setFamilyPinned] = useState(task.familyPinned);

  const [recMode, setRecMode] = useState<RecurrenceMode>(recurrenceToMode(task.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<string[]>(
    task.recurrence?.freq === 'weekly' && task.recurrence.days ? task.recurrence.days : [],
  );
  const [periodicallyValue, setPeriodicallyValue] = useState(
    task.recurrence?.freq === 'periodically' ? task.recurrence.interval || 7 : 7,
  );
  const [periodicallyUnit, setPeriodicallyUnit] = useState<'hours' | 'days' | 'weeks'>(
    task.recurrence?.freq === 'periodically' ? task.recurrence.periodUnit || 'days' : 'days',
  );
  const [customUnit, setCustomUnit] = useState<'weekly' | 'monthly'>(
    task.recurrence?.freq === 'custom' ? task.recurrence.customUnit || 'weekly' : 'weekly',
  );
  const [customInterval, setCustomInterval] = useState(
    task.recurrence?.freq === 'custom' ? task.recurrence.interval || 2 : 2,
  );
  const [customDays, setCustomDays] = useState<string[]>(
    task.recurrence?.freq === 'custom' && task.recurrence.days ? task.recurrence.days : [],
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveTimeoutRef = useRef<number | null>(null);
  const savedStateRef = useRef<EditableTaskState>(buildEditableState(task));
  const latestSaveIdRef = useRef(0);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => {
    autoResize(titleRef.current);
  }, [title, autoResize]);

  const buildRecurrence = useCallback((): RecurrenceRule | null => {
    if (!showRecurrence) return null;
    switch (recMode) {
      case 'daily':
        return { freq: 'daily' };
      case 'weekly':
        return weeklyDays.length > 0 ? { freq: 'weekly', days: weeklyDays } : { freq: 'weekly' };
      case 'monthly':
        return { freq: 'monthly' };
      case 'yearly':
        return { freq: 'yearly' };
      case 'periodically':
        return { freq: 'periodically', interval: periodicallyValue, periodUnit: periodicallyUnit };
      case 'custom': {
        const base: RecurrenceRule = { freq: 'custom', customUnit, interval: customInterval };
        if (customUnit === 'weekly' && customDays.length > 0) base.days = customDays;
        return base;
      }
      default:
        return null;
    }
  }, [
    showRecurrence,
    recMode,
    weeklyDays,
    periodicallyValue,
    periodicallyUnit,
    customUnit,
    customInterval,
    customDays,
  ]);

  const buildCurrentState = useCallback((): EditableTaskState => {
    const deadlineStr =
      showDeadline && deadlineDate ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : deadlineDate) : null;
    return {
      title,
      notes,
      classification,
      priority,
      projectId: projectId || null,
      deadline: deadlineStr,
      recurrence: buildRecurrence(),
      excludeFromFamily,
      familyPinned,
    };
  }, [
    title,
    notes,
    classification,
    priority,
    projectId,
    showDeadline,
    deadlineDate,
    deadlineTime,
    buildRecurrence,
    excludeFromFamily,
    familyPinned,
  ]);

  const buildUpdateData = useCallback((current: EditableTaskState): Partial<Task> => {
    const data: Partial<Task> = {};
    const saved = savedStateRef.current;
    if (current.title !== saved.title) data.title = current.title;
    if (current.notes !== saved.notes) data.notes = current.notes;
    if (current.classification !== saved.classification) data.classification = current.classification;
    if (current.priority !== saved.priority) data.priority = current.priority;
    if (current.projectId !== saved.projectId) data.projectId = current.projectId;
    if (current.deadline !== saved.deadline) data.deadline = current.deadline;
    if (JSON.stringify(current.recurrence) !== JSON.stringify(saved.recurrence)) data.recurrence = current.recurrence;
    if (current.excludeFromFamily !== saved.excludeFromFamily) data.excludeFromFamily = current.excludeFromFamily;
    if (current.familyPinned !== saved.familyPinned) data.familyPinned = current.familyPinned;
    return data;
  }, []);

  const persistDraft = useCallback(
    async (current: EditableTaskState) => {
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
    },
    [buildUpdateData, task.id, updateTask],
  );

  const flushAutosave = useCallback(() => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    const current = buildCurrentState();
    void persistDraft(current);
  }, [buildCurrentState, persistDraft]);

  useEffect(() => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    const initialDeadline = parseDeadline(task.deadline);
    savedStateRef.current = buildEditableState(task);
    setSaveState('idle');
    setTitle(task.title);
    setNotes(task.notes);
    setClassification(task.classification);
    setPriority(task.priority || 'low');
    setProjectId(task.projectId || '');
    setDeadlineDate(initialDeadline.date);
    setDeadlineTime(initialDeadline.time);
    setShowTime(!!initialDeadline.time);
    setShowNotes(!!task.notes);
    setShowProject(!!task.projectId);
    setShowDeadline(!!task.deadline);
    setShowRecurrence(!!task.recurrence);
    setExcludeFromFamily(task.excludeFromFamily);
    setFamilyPinned(task.familyPinned);
    setRecMode(recurrenceToMode(task.recurrence));
    setWeeklyDays(
      task.recurrence?.freq === 'weekly' && task.recurrence.days ? task.recurrence.days : [],
    );
    setPeriodicallyValue(
      task.recurrence?.freq === 'periodically' ? task.recurrence.interval || 7 : 7,
    );
    setPeriodicallyUnit(
      task.recurrence?.freq === 'periodically' ? task.recurrence.periodUnit || 'days' : 'days',
    );
    setCustomUnit(
      task.recurrence?.freq === 'custom' ? task.recurrence.customUnit || 'weekly' : 'weekly',
    );
    setCustomInterval(
      task.recurrence?.freq === 'custom' ? task.recurrence.interval || 2 : 2,
    );
    setCustomDays(
      task.recurrence?.freq === 'custom' && task.recurrence.days ? task.recurrence.days : [],
    );
  }, [task]);

  useEffect(() => {
    const current = buildCurrentState();
    const data = buildUpdateData(current);
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (Object.keys(data).length === 0) {
      setSaveState((prev) => (prev === 'error' ? 'error' : prev));
      return;
    }
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void persistDraft(current);
    }, 900);
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [buildCurrentState, buildUpdateData, persistDraft]);

  useEffect(
    () => () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
        const current = buildCurrentState();
        void persistDraft(current);
      }
    },
    [buildCurrentState, persistDraft],
  );

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
    setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
  };

  const removeField = (field: 'notes' | 'project' | 'deadline' | 'recurrence') => {
    switch (field) {
      case 'notes':
        setShowNotes(false);
        setNotes('');
        break;
      case 'project':
        setShowProject(false);
        setProjectId('');
        break;
      case 'deadline':
        setShowDeadline(false);
        setDeadlineDate('');
        setDeadlineTime('');
        setShowRecurrence(false);
        setRecMode('');
        break;
      case 'recurrence':
        setShowRecurrence(false);
        setRecMode('');
        break;
    }
  };

  const addLinks: { label: string; icon: React.ReactNode; action: () => void }[] = [];
  if (!showNotes) addLinks.push({ label: 'Notes', icon: <FileText className="w-3 h-3" />, action: () => setShowNotes(true) });
  if (!showProject) addLinks.push({ label: 'Project', icon: <FolderOpen className="w-3 h-3" />, action: () => setShowProject(true) });
  if (!showDeadline) {
    addLinks.push({
      label: 'Deadline',
      icon: <Calendar className="w-3 h-3" />,
      action: () => {
        setShowDeadline(true);
        if (!deadlineDate) {
          const now = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          setDeadlineDate(today);
        }
      },
    });
  }
  if (showDeadline && !showRecurrence) {
    addLinks.push({
      label: 'Recurrence',
      icon: <Repeat className="w-3 h-3" />,
      action: () => {
        setShowRecurrence(true);
        if (!recMode) handleRecModeChange('weekly');
      },
    });
  }

  return (
    <div
      className="p-4 bg-card border-t border-border animate-in slide-in-from-top-2 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={1}
        className={cn(
          'w-full px-3 py-2 mb-4 text-[15px] font-semibold text-foreground leading-snug',
          'bg-transparent border-0 resize-none overflow-hidden',
          'focus:outline-none',
          'placeholder:text-muted-foreground',
        )}
        placeholder="Task title..."
      />

      {showNotes && (
        <div className="relative mb-4">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Notes
          </label>
          <div className="relative">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className={cn(
                'w-full min-h-[72px] px-3 py-2 text-[13px] text-foreground leading-relaxed',
                'bg-card border border-input rounded-lg resize-y',
                'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
                'transition-all duration-150 placeholder:text-muted-foreground',
              )}
            />
            <button
              type="button"
              onClick={() => removeField('notes')}
              className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove notes"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
              type="button"
              onClick={() => removeField('project')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove project"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 space-y-2">
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Family
        </label>
        <label className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={familyPinned}
            onChange={(e) => setFamilyPinned(e.target.checked)}
            className="rounded border-input"
          />
          Show on Family (without a family-scoped project)
        </label>
        <label className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={excludeFromFamily}
            onChange={(e) => setExcludeFromFamily(e.target.checked)}
            className="rounded border-input"
          />
          Exclude from Family (even if project is family-visible)
        </label>
      </div>

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
                onChange={(e) => setDeadlineDate(e.target.value)}
                className={cn(
                  'h-8 pl-8 pr-3 text-[13px] rounded-md',
                  'bg-card border border-input text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
                  'transition-all duration-150',
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
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    className={cn(
                      'h-8 pl-8 pr-3 text-[13px] rounded-md',
                      'bg-card border border-input text-foreground',
                      'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
                      'transition-all duration-150',
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
              type="button"
              onClick={() => removeField('deadline')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove deadline"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {showRecurrence && showDeadline && (
        <TaskRecurrenceSection
          recMode={recMode}
          onRecModeChange={handleRecModeChange}
          onRemoveRecurrence={() => removeField('recurrence')}
          weeklyDays={weeklyDays}
          onToggleWeeklyDay={(day) => toggleDay(day, weeklyDays, setWeeklyDays)}
          periodicallyValue={periodicallyValue}
          onPeriodicallyValueChange={setPeriodicallyValue}
          periodicallyUnit={periodicallyUnit}
          onPeriodicallyUnitChange={handlePeriodicallyUnitChange}
          customInterval={customInterval}
          onCustomIntervalChange={setCustomInterval}
          customUnit={customUnit}
          onCustomUnitChange={setCustomUnit}
          customDays={customDays}
          onToggleCustomDay={(day) => toggleDay(day, customDays, setCustomDays)}
        />
      )}

      {addLinks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {addLinks.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={link.action}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium',
                'text-muted-foreground hover:text-foreground hover:bg-secondary',
                'transition-all duration-150',
              )}
            >
              <Plus className="w-3 h-3" />
              {link.label}
            </button>
          ))}
        </div>
      )}

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
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'px-3 py-1 text-[12px] font-medium rounded-full border transition-all duration-150',
                  active ? classes.active : classes.inactive,
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

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
                type="button"
                onClick={() => setClassification(type)}
                className={cn(
                  'px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md',
              'text-destructive/70 hover:text-destructive hover:bg-destructive/10',
              'transition-all duration-150',
            )}
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'flex items-center justify-center h-8 px-3 rounded-md',
              'bg-destructive text-destructive-foreground font-medium text-[12px]',
              'hover:bg-destructive/90 transition-all duration-150',
            )}
            title="Confirm delete"
          >
            Delete
          </button>
        )}
        {onComplete && (
          <button
            type="button"
            onClick={() => {
              flushAutosave();
              onComplete(task.id);
              onClose();
            }}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md',
              'text-emerald-600 hover:bg-emerald-50',
              'transition-all duration-150',
            )}
            title="Complete"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {onIcebox && (
          <button
            type="button"
            onClick={() => {
              flushAutosave();
              onIcebox(task.id);
              onClose();
            }}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md',
              'text-muted-foreground hover:text-foreground hover:bg-secondary',
              'transition-all duration-150',
            )}
            title="Icebox"
          >
            <Snowflake className="w-4 h-4" />
          </button>
        )}

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
          {saveState === 'error' && <span className="text-destructive">Save failed</span>}
        </div>

        <div className="flex-1 min-w-[8px]" />

        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-md text-[13px] font-medium',
            'border border-border bg-background text-foreground',
            'hover:bg-secondary transition-all duration-150',
          )}
        >
          Done
        </button>
      </div>
    </div>
  );
}
