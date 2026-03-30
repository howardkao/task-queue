import { useState, useMemo, useCallback, useEffect } from 'react';
import { DayCalendar } from './DayCalendar';
import { BoulderSidebar } from './BoulderSidebar';
import { RockSidebar } from './RockSidebar';
import { PebbleSidebar } from './PebbleSidebar';
import { useTodayBoulders, useTodayRocks, useTodayInboxTasks, useCreateTask, useClassifyTask, useUpdateTask, useDueSoonTasks } from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';
import { useIsMobile } from '../../hooks/useViewport';
import { useEventsForDates } from '../../hooks/useCalendar';
import type { CalEvent } from './DayCalendar';
import type { CalendarEvent, Classification, Priority } from '../../types';
import { STANDALONE_PROJECT_FILTER } from '../../hooks/useTasks';
import type { TodayProjectFilter } from '../../hooks/useTasks';
import { SideDrawer } from '../shared/SideDrawer';
import { DueSoonSidebar } from './DueSoonSidebar';

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

type SidebarMode = 'boulders' | 'rocks' | 'pebbles';

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
  const isMobile = useIsMobile();
  const { data: projects = [] } = useProjects('active');
  const unfilteredProjectFilter = useMemo<TodayProjectFilter>(() => [], []);
  const [projectFilter, setProjectFilter] = useState<TodayProjectFilter>(() => {
    const saved = localStorage.getItem('today_projectFilter');
    return saved ? JSON.parse(saved) : [];
  });
  const { data: boulders = [] } = useTodayBoulders(projectFilter);
  const { data: rocks = [] } = useTodayRocks(projectFilter);
  const { data: allBoulders = [] } = useTodayBoulders(unfilteredProjectFilter);
  const { data: allRocks = [] } = useTodayRocks(unfilteredProjectFilter);
  const { data: inboxTasks = [] } = useTodayInboxTasks(projectFilter);
  const createTask = useCreateTask();
  const classifyTask = useClassifyTask();
  const dueSoonTasks = useDueSoonTasks();

  const [priorityFilter, setPriorityFilter] = useState<Priority[]>(() => {
    const saved = localStorage.getItem('today_priorityFilter');
    return saved ? JSON.parse(saved) : [];
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const saved = localStorage.getItem('today_sidebarMode');
    return (saved as SidebarMode) || 'boulders';
  });
  const [dayCount, setDayCount] = useState(() => {
    const saved = localStorage.getItem('today_dayCount');
    return saved ? parseInt(saved, 10) : 3;
  });
  const [wakeUpHour, setWakeUpHour] = useState(() => {
    const saved = localStorage.getItem('today_wakeUpHour');
    return saved ? parseInt(saved, 10) : 8;
  });
  const [bedTimeHour, setBedTimeHour] = useState(() => {
    const saved = localStorage.getItem('today_bedTimeHour');
    return saved ? parseInt(saved, 10) : 22;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [captureValue, setCaptureValue] = useState('');
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Persist filters/settings
  useEffect(() => { localStorage.setItem('today_projectFilter', JSON.stringify(projectFilter)); }, [projectFilter]);
  useEffect(() => { localStorage.setItem('today_priorityFilter', JSON.stringify(priorityFilter)); }, [priorityFilter]);
  useEffect(() => { localStorage.setItem('today_sidebarMode', sidebarMode); }, [sidebarMode]);
  useEffect(() => { localStorage.setItem('today_dayCount', dayCount.toString()); }, [dayCount]);
  useEffect(() => { localStorage.setItem('today_wakeUpHour', wakeUpHour.toString()); }, [wakeUpHour]);
  useEffect(() => { localStorage.setItem('today_bedTimeHour', bedTimeHour.toString()); }, [bedTimeHour]);

  const visibleDayCount = isMobile ? 1 : dayCount;

  // Compute visible dates
  const visibleDates = useMemo(() => {
    return Array.from({ length: visibleDayCount }, (_, i) => addDays(startDate, i));
  }, [startDate, visibleDayCount]);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const dateKeys = useMemo(() => visibleDates.map(toDateKey), [visibleDates]);
  const todayKey = toDateKey(new Date());

  const updateTask = useUpdateTask();

  // Derived map for easy lookup
  const placedTasksMap = useMemo(() => {
    const map: Record<string, { date: string; startHour: number; duration: number }> = {};
    [...allBoulders, ...allRocks, ...dueSoonTasks].forEach(t => {
      if (t.placement) {
        map[t.id] = t.placement;
      }
    });
    return map;
  }, [allBoulders, allRocks, dueSoonTasks]);

  // Fetch calendar events for all visible dates
  const calendarQueries = useEventsForDates(dateKeys);
  const apiConfigured = calendarQueries.some(q => q.data !== null && q.data !== undefined);

  // Priority filtering
  const togglePriorityFilter = useCallback((value: Priority) => {
    setPriorityFilter(prev => (
      prev.includes(value)
        ? prev.filter(item => item !== value)
        : [...prev, value]
    ));
  }, []);

  const filterByPriority = useCallback(<T extends { priority?: Priority }>(tasks: T[]): T[] => {
    if (priorityFilter.length === 0) return tasks;
    return tasks.filter(t => priorityFilter.includes(t.priority || 'low'));
  }, [priorityFilter]);

  const filteredBoulders = useMemo(() => filterByPriority(boulders), [filterByPriority, boulders]);
  const filteredRocks = useMemo(() => filterByPriority(rocks), [filterByPriority, rocks]);
  const filteredInboxTasks = useMemo(() => filterByPriority(inboxTasks), [filterByPriority, inboxTasks]);

  // Build calendar events per day
  const eventsPerDay = useMemo(() => {
    return dateKeys.map((dateKey, i) => {
      const icalEvents = calendarQueries[i]?.data;
      const baseEvents = icalEvents !== null && icalEvents !== undefined
        ? icalToCalEvents(icalEvents)
        : (dateKey === todayKey ? MOCK_CAL_EVENTS : []);

      const events: CalEvent[] = [...baseEvents];

      const schedulableTasks = [...allBoulders, ...allRocks, ...dueSoonTasks.filter(t => t.classification === 'boulder' || t.classification === 'rock')];
      // Add placed schedulable tasks for this day
      for (const task of schedulableTasks) {
        if (task.placement && task.placement.date === dateKey) {
          events.push({
            id: `boulder-${task.id}`,
            title: task.title,
            startHour: task.placement.startHour,
            duration: task.placement.duration,
            type: task.classification === 'rock' ? 'rock' : 'boulder',
            projectName: task.projectId ? 'Project' : undefined,
          });
        }
      }

      return events;
    });
  }, [dateKeys, calendarQueries, allBoulders, allRocks, dueSoonTasks, todayKey]);

  const handleBoulderDrop = useCallback((boulderId: string, startHour: number, dateKey: string) => {
    const task = [...allBoulders, ...allRocks, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task) return;
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: {
          date: dateKey,
          startHour,
          duration: task.placement?.duration ?? 2,
        },
      },
    });
  }, [allBoulders, allRocks, dueSoonTasks, updateTask]);

  const handleBoulderMove = useCallback((boulderId: string, startHour: number) => {
    const task = [...allBoulders, ...allRocks, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: { ...task.placement, startHour },
      },
    });
  }, [allBoulders, allRocks, dueSoonTasks, updateTask]);

  const handleBoulderResize = useCallback((boulderId: string, duration: number) => {
    const task = [...allBoulders, ...allRocks, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: { ...task.placement, duration },
      },
    });
  }, [allBoulders, allRocks, dueSoonTasks, updateTask]);

  const handleBoulderRemove = useCallback((boulderId: string) => {
    updateTask.mutate({
      id: boulderId,
      data: { placement: null },
    });
  }, [updateTask]);

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

  const standaloneCount = filteredBoulders.filter(b => !b.projectId).length;
  const projectBoulderIds = new Set(filteredBoulders.filter(b => b.projectId).map(b => b.projectId));
  const activeProjectCount = projectBoulderIds.size;

  const toggleProjectFilter = useCallback((value: string) => {
    setProjectFilter(prev => (
      prev.includes(value)
        ? prev.filter(item => item !== value)
        : [...prev, value]
    ));
  }, []);

  const sidebarContent = (
    <>
      {/* Capture + Inbox */}
      <div style={{ marginBottom: '12px' }}>
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
        />

        {filteredInboxTasks.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {filteredInboxTasks.map(task => (
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
                <button onClick={() => handleClassify(task.id, 'boulder')} style={classifyBtnStyle}>🪨</button>
                <button onClick={() => handleClassify(task.id, 'rock')} style={classifyBtnStyle}>Rock</button>
                <button onClick={() => handleClassify(task.id, 'pebble')} style={classifyBtnStyle}>Pebble</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {dueSoonTasks.length > 0 && (
        <DueSoonSidebar tasks={dueSoonTasks} placedTasks={placedTasksMap} />
      )}

      <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', background: '#fcfcfd', padding: '10px', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
        <div style={{ flex: 1 }}>
          <div style={filterHeaderStyle}>Priority</div>
          <div style={filterChipWrapStyle}>
            <button
              onClick={() => setPriorityFilter([])}
              style={{ ...filterChipStyle, ...(priorityFilter.length === 0 ? activeFilterChipStyle : {}) }}
            >
              All
            </button>
            {(['high', 'med', 'low'] as const).map(p => {
              const colors: Record<Priority, { bg: string; border: string }> = {
                high: { bg: '#ef4444', border: '#ef4444' },
                med: { bg: '#f59e0b', border: '#f59e0b' },
                low: { bg: '#9ca3af', border: '#9ca3af' },
              };
              const active = priorityFilter.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePriorityFilter(p)}
                  style={{
                    ...filterChipStyle,
                    ...(active ? { background: colors[p].bg, borderColor: colors[p].border, color: '#fff' } : {}),
                    textTransform: 'capitalize',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 2 }}>
          <div style={filterHeaderStyle}>Projects</div>
          <div style={filterChipWrapStyle}>
            <button
              onClick={() => setProjectFilter([])}
              style={{ ...filterChipStyle, ...(projectFilter.length === 0 ? activeFilterChipStyle : {}) }}
            >
              All
            </button>
            <button
              onClick={() => toggleProjectFilter(STANDALONE_PROJECT_FILTER)}
              style={{ ...filterChipStyle, ...(projectFilter.includes(STANDALONE_PROJECT_FILTER) ? activeFilterChipStyle : {}) }}
            >
              None
            </button>
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => toggleProjectFilter(project.id)}
                style={{ ...filterChipStyle, ...(projectFilter.includes(project.id) ? activeFilterChipStyle : {}) }}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '12px',
        background: '#f9fafb',
      }}>
        {(['boulders', 'rocks', 'pebbles'] as const).map(mode => (
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

      {sidebarMode === 'boulders' && (
        <BoulderSidebar
          boulders={filteredBoulders}
          placedBoulders={placedTasksMap}
          activeProjectCount={activeProjectCount}
          standaloneCount={standaloneCount}
        />
      )}
      {sidebarMode === 'rocks' && (
        <RockSidebar rocks={filteredRocks} placedBoulders={placedTasksMap} />
      )}
      {sidebarMode === 'pebbles' && (
        <PebbleSidebar projectFilter={projectFilter} priorityFilter={priorityFilter} />
      )}
    </>
  );

  return (
    <div style={{ padding: '12px 16px', maxWidth: '1700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Day Calendars */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Navigation bar moved inside here */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <button onClick={goToToday} style={{ ...navBtn, fontSize: '12px', padding: '4px 12px' }}>
              Today
            </button>
            <button onClick={navigateBack} style={navBtn} title="Previous day">
              ←
            </button>
            <button onClick={navigateForward} style={navBtn} title="Next day">
              →
            </button>
            
            <div style={{ flex: 1 }} />

            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={dayCount}
                  onChange={(e) => setDayCount(parseInt(e.target.value, 10))}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#fff',
                    fontSize: '12px',
                    color: '#4b5563',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {[1, 2, 3, 5].map(count => (
                    <option key={count} value={count}>{count} Days</option>
                  ))}
                </select>
                
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  style={{ ...navBtn, padding: '4px 8px', fontSize: '14px' }}
                  title="Calendar Settings"
                >
                  ⚙️
                </button>
              </div>
            )}
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)} style={{ ...navBtn }}>
                Tasks
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0px' }}>
            {visibleDates.map((date, i) => (
              <DayCalendar
                key={dateKeys[i]}
                date={formatDateHeader(date, dateKeys[i] === todayKey)}
                dateKey={dateKeys[i]}
                events={eventsPerDay[i]}
                startHour={wakeUpHour}
                endHour={bedTimeHour}
                compact
                showLabels={i === 0}
                isToday={dateKeys[i] === todayKey}
                onBoulderDrop={handleBoulderDrop}
                onBoulderMove={handleBoulderMove}
                onBoulderResize={handleBoulderResize}
                onBoulderRemove={handleBoulderRemove}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        {!isMobile && (
          <div style={{ width: '600px', flexShrink: 0, marginTop: '46px' }}>
            {sidebarContent}
          </div>
        )}
      </div>

      {isMobile && (
        <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Today Tasks">
          {sidebarContent}
        </SideDrawer>
      )}

      <SideDrawer open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Calendar Settings">
        <div style={{ display: 'grid', gap: '20px', padding: '16px' }}>
          <div>
            <label style={settingLabelStyle}>Wake Up (Hour 0-23)</label>
            <input 
              type="number" 
              min="0" 
              max="23" 
              value={wakeUpHour} 
              onChange={e => setWakeUpHour(parseInt(e.target.value, 10) || 0)}
              style={settingInputStyle}
            />
          </div>
          <div>
            <label style={settingLabelStyle}>Go to Bed (Hour 0-23)</label>
            <input 
              type="number" 
              min="0" 
              max="23" 
              value={bedTimeHour} 
              onChange={e => setBedTimeHour(parseInt(e.target.value, 10) || 0)}
              style={settingInputStyle}
            />
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
            Adjusting these will change the visible range of your daily calendar.
          </div>
        </div>
      </SideDrawer>

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

const filterHeaderStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  fontWeight: 600,
  marginBottom: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const filterChipWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

const filterChipStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: '999px',
  fontSize: '12px',
  background: '#fff',
  color: '#4b5563',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const activeFilterChipStyle: React.CSSProperties = {
  background: '#FF7A7A',
  borderColor: '#FF7A7A',
  color: '#fff',
};

const settingLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
};

const settingInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
