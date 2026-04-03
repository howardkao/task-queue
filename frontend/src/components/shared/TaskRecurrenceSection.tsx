import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_DAYS,
  DAY_LABELS,
  type RecurrenceMode,
} from './taskEditPanelModel';

interface TaskRecurrenceSectionProps {
  recMode: RecurrenceMode;
  onRecModeChange: (mode: RecurrenceMode) => void;
  onRemoveRecurrence: () => void;
  weeklyDays: string[];
  onToggleWeeklyDay: (day: string) => void;
  periodicallyValue: number;
  onPeriodicallyValueChange: (n: number) => void;
  periodicallyUnit: 'hours' | 'days' | 'weeks';
  onPeriodicallyUnitChange: (unit: 'hours' | 'days' | 'weeks') => void;
  customInterval: number;
  onCustomIntervalChange: (n: number) => void;
  customUnit: 'weekly' | 'monthly';
  onCustomUnitChange: (u: 'weekly' | 'monthly') => void;
  customDays: string[];
  onToggleCustomDay: (day: string) => void;
}

export function TaskRecurrenceSection({
  recMode,
  onRecModeChange,
  onRemoveRecurrence,
  weeklyDays,
  onToggleWeeklyDay,
  periodicallyValue,
  onPeriodicallyValueChange,
  periodicallyUnit,
  onPeriodicallyUnitChange,
  customInterval,
  onCustomIntervalChange,
  customUnit,
  onCustomUnitChange,
  customDays,
  onToggleCustomDay,
}: TaskRecurrenceSectionProps) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Repeats
      </label>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={recMode}
          onChange={(e) => onRecModeChange(e.target.value as RecurrenceMode)}
          className={cn(
            'h-8 px-3 text-[13px] rounded-md appearance-none',
            'bg-card border border-input text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
            'transition-all duration-150',
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
          type="button"
          onClick={onRemoveRecurrence}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Remove recurrence"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {recMode === 'weekly' && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[11px] text-muted-foreground mr-1">On:</span>
          {ALL_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => onToggleWeeklyDay(day)}
              className={cn(
                'w-7 h-6 text-[11px] font-medium rounded border transition-all duration-150',
                weeklyDays.includes(day)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-foreground border-input hover:bg-secondary',
              )}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      )}

      {recMode === 'periodically' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Reschedule</span>
          <input
            type="number"
            min={1}
            value={periodicallyValue}
            onChange={(e) => onPeriodicallyValueChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={cn(
              'w-14 h-8 px-2 text-[13px] text-center rounded-md',
              'bg-card border border-input text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
            )}
          />
          <select
            value={periodicallyUnit}
            onChange={(e) => onPeriodicallyUnitChange(e.target.value as 'hours' | 'days' | 'weeks')}
            className={cn(
              'h-8 px-3 text-[13px] rounded-md appearance-none',
              'bg-card border border-input text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
            )}
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
          <span className="text-[11px] text-muted-foreground">after completion</span>
        </div>
      )}

      {recMode === 'custom' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Every</span>
            <input
              type="number"
              min={1}
              max={26}
              value={customInterval}
              onChange={(e) =>
                onCustomIntervalChange(Math.min(26, Math.max(1, parseInt(e.target.value, 10) || 1)))
              }
              className={cn(
                'w-14 h-8 px-2 text-[13px] text-center rounded-md',
                'bg-card border border-input text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              )}
            />
            <select
              value={customUnit}
              onChange={(e) => onCustomUnitChange(e.target.value as 'weekly' | 'monthly')}
              className={cn(
                'h-8 px-3 text-[13px] rounded-md appearance-none',
                'bg-card border border-input text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              )}
            >
              <option value="weekly">{customInterval === 1 ? 'week' : 'weeks'}</option>
              <option value="monthly">{customInterval === 1 ? 'month' : 'months'}</option>
            </select>
          </div>
          {customUnit === 'weekly' && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1">On:</span>
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => onToggleCustomDay(day)}
                  className={cn(
                    'w-7 h-6 text-[11px] font-medium rounded border transition-all duration-150',
                    customDays.includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-input hover:bg-secondary',
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
  );
}
