import { useState, useMemo, useCallback } from 'react';
import { DayCalendar } from './DayCalendar';
import { BoulderSidebar } from './BoulderSidebar';
import { PebbleSidebar } from './PebbleSidebar';
import { useBoulders, useInboxTasks, useCreateTask, useClassifyTask } from '../../hooks/useTasks';
import { useTodayEvents } from '../../hooks/useCalendar';
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
}

type SidebarMode = 'boulders' | 'pebbles';

export function TodayView() {
  const { data: boulders = [] } = useBoulders();
  const { data: icalEvents } = useTodayEvents();
  const { data: inboxTasks = [] } = useInboxTasks();
  const createTask = useCreateTask();
  const classifyTask = useClassifyTask();

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('boulders');
  const [placedBoulders, setPlacedBoulders] = useState<Record<string, PlacedBoulder>>({});
  const [captureValue, setCaptureValue] = useState('');

  const placedIds = Object.keys(placedBoulders);

  // Build calendar events
  const calEvents = useMemo(() => {
    const baseEvents = icalEvents !== null && icalEvents !== undefined
      ? icalToCalEvents(icalEvents)
      : MOCK_CAL_EVENTS;
    const events: CalEvent[] = [...baseEvents];

    for (const [boulderId, placement] of Object.entries(placedBoulders)) {
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
  }, [placedBoulders, boulders, icalEvents]);

  const apiConfigured = icalEvents !== null && icalEvents !== undefined;

  const handleBoulderDrop = useCallback((boulderId: string, startHour: number) => {
    setPlacedBoulders(prev => ({
      ...prev,
      [boulderId]: { startHour, duration: 2 },
    }));
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

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const standaloneCount = boulders.filter(b => !b.projectId).length;
  const projectBoulderIds = new Set(boulders.filter(b => b.projectId).map(b => b.projectId));
  const activeProjectCount = projectBoulderIds.size;

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Day Calendar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayCalendar
            date={dateStr}
            events={calEvents}
            startHour={7}
            endHour={22}
            onBoulderDrop={handleBoulderDrop}
            onBoulderMove={handleBoulderMove}
            onBoulderResize={handleBoulderResize}
            onBoulderRemove={handleBoulderRemove}
          />
          {!apiConfigured && (
            <div style={{
              marginTop: '8px', fontSize: '12px', color: '#9ca3af',
              fontStyle: 'italic', textAlign: 'center',
            }}>
              Showing sample events. Set VITE_API_BASE to connect your Google Calendar via iCal feeds.
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: '320px', flexShrink: 0 }}>
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
              placedIds={placedIds}
              activeProjectCount={activeProjectCount}
              standaloneCount={standaloneCount}
            />
          )}
          {sidebarMode === 'pebbles' && (
            <PebbleSidebar />
          )}
        </div>
      </div>
    </div>
  );
}

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
