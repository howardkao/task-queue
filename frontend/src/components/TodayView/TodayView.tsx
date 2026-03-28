import { useState, useMemo, useCallback } from 'react';
import { DayCalendar } from './DayCalendar';
import { BoulderSidebar } from './BoulderSidebar';
import { PebbleSidebar } from './PebbleSidebar';
import { useBoulders, useInboxTasks, useCreateTask, useClassifyTask } from '../../hooks/useTasks';
import { useEventsForDates } from '../../hooks/useCalendar';
import type { CalEvent } from './DayCalendar';
import type { CalendarEvent, Classification } from '../../types';

// Fallback mock events when no iCal feeds configured
const MOCK_CAL_EVENTS: CalEvent[] = [
  { id: 'cal-1', title: 'Team standup', startHour: 9, duration: 0.5, type: 'meeting', busy: true },
  { id: 'cal-2', title: 'Design review', startHour: 10, duration: 1, type: 'meeting', busy: true },
  { id: 'cal-3', title: 'Lunch w/ Sam', startHour: 12, duration: 1, type: 'personal', busy: true },
  { id: 'cal-4', title: 'Pickup kids', startHour: 16, duration: 0.5, type: 'personal', busy: true },
];

function icalToCalEvents(events: CalendarEvent[]): CalEvent[] {
  return events.map((e, i) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return {
      id: `ical-${i}`,
      title: e.title,
      startHour,
      duration: Math.max(duration, 0.25),
      type: 'meeting' as const,
      busy: e.busy,
    };
  });
}

interface PlacedBoulder {
  startHour: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

type SidebarMode = 'boulders' | 'pebbles';

const DAYS_VISIBLE = 3;

function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function formatDateHeader(d: Date, isToday: boolean): string {
  const label = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return isToday ? `${label} (Today)` : label;
}

export function TodayView() {
  const { data: boulders = [] } = useBoulders();
  const { data: inboxTasks = [] } = useInboxTasks();
  const createTask = useCreateTask();
  const classifyTask = useClassifyTask();

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('boulders');
  const [placedBoulders, setPlacedBoulders] = useState<Record<string, PlacedBoulder>>({});
  const [captureValue, setCaptureValue] = useState('');
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Compute visible dates
  const visibleDates = useMemo(() => {
    return Array.from({ length: DAYS_VISIBLE }, (_, i) => addDays(startDate, i));
  }, [startDate]);

  const dateKeys = useMemo(() => visibleDates.map(toDateKey), [visibleDates]);
  const todayKey = toDateKey(new Date());

  // Fetch calendar events for all visible dates
  const calendarQueries = useEventsForDates(dateKeys);
  const apiConfigured = calendarQueries.some(q => q.data !== null && q.data !== undefined);

  // Build calendar events per day
  const eventsPerDay = useMemo(() => {
    return dateKeys.map((dateKey, i) => {
      const icalEvents = calendarQueries[i]?.data;
      const baseEvents = icalEvents !== null && icalEvents !== undefined
        ? icalToCalEvents(icalEvents)
        : (dateKey === todayKey ? MOCK_CAL_EVENTS : []);

      const events: CalEvent[] = [...baseEvents];

      // Add placed boulders for this day
      for (const [boulderId, placement] of Object.entries(placedBoulders)) {
        if (placement.date !== dateKey) continue;
        const boulder = boulders.find(b => b.id === boulderId);
        if (!boulder) continue;
        events.push({
          id: `boulder-${boulderId}`,
          title: boulder.title,
          startHour: placement.startHour,
          duration: placement.duration,
          type: 'boulder',
          projectName: boulder.projectId ? 'Project' : undefined,
        });
      }

      return events;
    });
  }, [dateKeys, calendarQueries, placedBoulders, boulders, todayKey]);

  const handleBoulderDrop = useCallback((boulderId: string, startHour: number, dateKey: string) => {
    setPlacedBoulders(prev => {
      const existing = prev[boulderId];
      return {
        ...prev,
        [boulderId]: {
          startHour,
          duration: existing?.duration ?? 2,
          date: dateKey,
        },
      };
    });
  }, []);

  const handleBoulderMove = useCallback((boulderId: string, startHour: number) => {
    setPlacedBoulders(prev => {
      if (!prev[boulderId]) return prev;
      return { ...prev, [boulderId]: { ...prev[boulderId], startHour } };
    });
  }, []);

  const handleBoulderResize = useCallback((boulderId: string, duration: number) => {
    setPlacedBoulders(prev => {
      if (!prev[boulderId]) return prev;
      return { ...prev, [boulderId]: { ...prev[boulderId], duration } };
    });
  }, []);

  const handleBoulderRemove = useCallback((boulderId: string) => {
    setPlacedBoulders(prev => {
      const next = { ...prev };
      delete next[boulderId];
      return next;
    });
  }, []);

  const handleCapture = () => {
    if (!captureValue.trim()) return;
    createTask.mutate({ title: captureValue.trim() });
    setCaptureValue('');
  };

  const handleClassify = useCallback((id: string, classification: Classification) => {
    classifyTask.mutate({ id, classification });
  }, [classifyTask]);

  const navigateBack = () => setStartDate(prev => addDays(prev, -1));
  const navigateForward = () => setStartDate(prev => addDays(prev, 1));
  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setStartDate(d);
  };

  const isShowingToday = dateKeys.includes(todayKey);

  const standaloneCount = boulders.filter(b => !b.projectId).length;
  const projectBoulderIds = new Set(boulders.filter(b => b.projectId).map(b => b.projectId));
  const activeProjectCount = projectBoulderIds.size;

  return (
    <div style={{ padding: '12px 16px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Navigation bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
      }}>
        <button onClick={navigateBack} style={navBtn} title="Previous day">
          ←
        </button>
        {!isShowingToday && (
          <button onClick={goToToday} style={{ ...navBtn, fontSize: '12px', padding: '4px 12px' }}>
            Today
          </button>
        )}
        <button onClick={navigateForward} style={navBtn} title="Next day">
          →
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Day Calendars */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '8px' }}>
          {visibleDates.map((date, i) => (
            <DayCalendar
              key={dateKeys[i]}
              date={formatDateHeader(date, dateKeys[i] === todayKey)}
              dateKey={dateKeys[i]}
              events={eventsPerDay[i]}
              startHour={7}
              endHour={22}
              compact
              onBoulderDrop={handleBoulderDrop}
              onBoulderMove={handleBoulderMove}
              onBoulderResize={handleBoulderResize}
              onBoulderRemove={handleBoulderRemove}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div style={{ width: '300px', flexShrink: 0 }}>
          {/* Capture + Inbox */}
          <div style={{ marginBottom: '16px' }}>
            <input
              type="text"
              value={captureValue}
              onChange={e => setCaptureValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCapture(); }}
              placeholder="+ Add a task..."
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '14px',
                background: '#fff',
                color: '#1f2937',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            />

            {inboxTasks.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {inboxTasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ flex: 1, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                      {task.title}
                    </div>
                    <button
                      onClick={() => handleClassify(task.id, 'boulder')}
                      style={classifyBtnStyle}
                    >
                      🪨
                    </button>
                    <button
                      onClick={() => handleClassify(task.id, 'pebble')}
                      style={classifyBtnStyle}
                    >
                      Pebble
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Toggle */}
          <div style={{
            display: 'flex',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '16px',
            background: '#f9fafb',
          }}>
            {(['boulders', 'pebbles'] as const).map(mode => (
              <div
                key={mode}
                onClick={() => setSidebarMode(mode)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: sidebarMode === mode ? '#fff' : '#4b5563',
                  background: sidebarMode === mode ? '#FF7A7A' : 'transparent',
                  fontWeight: sidebarMode === mode ? 700 : 500,
                  userSelect: 'none',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease',
                  borderRadius: '12px',
                }}
              >
                {mode}
              </div>
            ))}
          </div>

          {/* Content */}
          {sidebarMode === 'boulders' && (
            <BoulderSidebar
              boulders={boulders}
              placedBoulders={placedBoulders}
              activeProjectCount={activeProjectCount}
              standaloneCount={standaloneCount}
            />
          )}
          {sidebarMode === 'pebbles' && (
            <PebbleSidebar />
          )}
        </div>
      </div>

      {!apiConfigured && (
        <div style={{
          marginTop: '8px', fontSize: '12px', color: '#9ca3af',
          fontStyle: 'italic', textAlign: 'center',
        }}>
          Showing sample events for today. Set VITE_API_BASE to connect your Google Calendar via iCal feeds.
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '16px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};

const classifyBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};
