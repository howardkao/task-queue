import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DayCalendar } from './DayCalendar';
import { TaskSidebar } from './TaskSidebar';
import {
  useVitalTasks,
  useOtherTasks,
  useInboxTasksV2,
  useCreateTask,
  useTriageTask,
  useUpdateTask,
  useDueSoonTasks,
  isOverdueOrDueToday,
  type PlannerScope,
} from '../../hooks/useTasks';
import { useInvestments } from '../../hooks/useInvestments';
import { useAuth } from '../../hooks/useAuth';
import { readPlannerStorage, writePlannerStorage } from '../../plannerStorage';
import { useIsMobile } from '../../hooks/useViewport';
import { useCalendarFeeds, useEventsForRange } from '../../hooks/useCalendar';
import type { CalEvent, PlacedTaskDragPreview } from './dayCalendarTypes';
import type { CalendarEvent, Task, TaskSize } from '../../types';
import { SideDrawer } from '../shared/SideDrawer';
import { DueSoonSidebar } from './DueSoonSidebar';
import { CalendarFeedSettings } from './CalendarFeedSettings';
import {
  listCardStyle,
  listCardInnerStyle,
  listCardTitleStyle,
} from '../shared/listCardStyles';
import {
  clampStartDateForCalendarScroll,
  isCalendarScrollAtFutureLimit,
  isCalendarScrollAtPastLimit,
} from '../../calendar/calendarLimits';
import { addDays, formatDateHeader, toDateKey } from './todayDateUtils';
import {
  calendarEventTypeForTask,
  icalToCalEvents,
  MOCK_CAL_EVENTS,
} from './todayCalendarBridge';
import { PX_PER_HOUR } from './dayCalendarConstants';
import { snapToGrid } from './dayCalendarUtils';
import { isTaskVisibleOnFamilyV2 } from '../../taskFamilyScope';
import { sortTasksWithinInvestments } from '../../lib/taskOrdering';

type SidebarMode = 'vital' | 'other';

/** Day only changes when the pointer is inside an adjacent column (not merely past the inner edge). */
function resolveStickyDateKey(
  grids: Map<string, HTMLDivElement>,
  orderedKeys: readonly string[],
  prevDateKey: string,
  clientX: number,
): string {
  const idx = orderedKeys.indexOf(prevDateKey);
  if (idx < 0) return prevDateKey;
  const r = grids.get(prevDateKey)?.getBoundingClientRect();
  if (!r) return prevDateKey;
  if (idx > 0) {
    const pr = grids.get(orderedKeys[idx - 1]!)?.getBoundingClientRect();
    if (pr && clientX < r.left && clientX >= pr.left && clientX <= pr.right) {
      return orderedKeys[idx - 1]!;
    }
  }
  if (idx < orderedKeys.length - 1) {
    const nr = grids.get(orderedKeys[idx + 1]!)?.getBoundingClientRect();
    if (nr && clientX > r.right && clientX >= nr.left && clientX <= nr.right) {
      return orderedKeys[idx + 1]!;
    }
  }
  return prevDateKey;
}

function eventOverlapsDateKey(event: CalendarEvent, dateKey: string): boolean {
  const dayStart = new Date(`${dateKey}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  return eventEnd > dayStart && eventStart < dayEnd;
}

export interface TodayViewProps {
  plannerScope?: PlannerScope;
}

export function TodayView({ plannerScope = 'me' }: TodayViewProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: investments = [] } = useInvestments('active');
  const { data: vitalTasks = [] } = useVitalTasks();
  const { data: otherTasks = [] } = useOtherTasks();
  const { data: inboxTasks = [] } = useInboxTasksV2();
  const createTask = useCreateTask();
  const triageTask = useTriageTask();
  const dueSoonTasks = useDueSoonTasks(plannerScope);
  const uid = user?.uid ?? '';

  const scopedTasks = useCallback((tasks: Task[]) => {
    const filtered = plannerScope === 'me'
      ? tasks.filter((task) => !uid || task.assigneeUids.includes(uid))
      : tasks.filter((task) => isTaskVisibleOnFamilyV2(task, task.investmentId ? investments.find((investment) => investment.id === task.investmentId) : undefined));
    return sortTasksWithinInvestments(filtered, investments, plannerScope, uid);
  }, [investments, plannerScope, uid]);

  const scopedVitalTasks = useMemo(() => scopedTasks(vitalTasks), [scopedTasks, vitalTasks]);
  const scopedOtherTasks = useMemo(() => scopedTasks(otherTasks), [scopedTasks, otherTasks]);
  const scopedInboxTasks = useMemo(() => scopedTasks(inboxTasks), [scopedTasks, inboxTasks]);
  const allSizedTasks = useMemo(() => [...scopedVitalTasks, ...scopedOtherTasks], [scopedVitalTasks, scopedOtherTasks]);

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const saved = readPlannerStorage(plannerScope, 'sidebarMode');
    if (saved === 'vital' || saved === 'other') return saved;
    return 'vital';
  });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const skipClearExpandedOnNextSidebarMode = useRef(false);
  const dayGridElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [placedTaskDragPreview, setPlacedTaskDragPreview] = useState<PlacedTaskDragPreview | null>(null);
  const [dayCount, setDayCount] = useState(() => {
    const saved = readPlannerStorage(plannerScope, 'dayCount');
    return saved ? parseInt(saved, 10) : 3;
  });
  const [wakeUpHour, setWakeUpHour] = useState(() => {
    const saved = readPlannerStorage(plannerScope, 'wakeUpHour');
    return saved ? parseInt(saved, 10) : 8;
  });
  const [bedTimeHour, setBedTimeHour] = useState(() => {
    const saved = readPlannerStorage(plannerScope, 'bedTimeHour');
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

  const [shouldBustCache, setShouldBustCache] = useState(false);

  useEffect(() => {
    writePlannerStorage(plannerScope, 'sidebarMode', sidebarMode);
  }, [plannerScope, sidebarMode]);
  useEffect(() => {
    if (skipClearExpandedOnNextSidebarMode.current) {
      skipClearExpandedOnNextSidebarMode.current = false;
      return;
    }
    setExpandedTaskId(null);
  }, [sidebarMode]);
  useEffect(() => {
    writePlannerStorage(plannerScope, 'dayCount', dayCount.toString());
  }, [plannerScope, dayCount]);
  useEffect(() => {
    writePlannerStorage(plannerScope, 'wakeUpHour', wakeUpHour.toString());
  }, [plannerScope, wakeUpHour]);
  useEffect(() => {
    writePlannerStorage(plannerScope, 'bedTimeHour', bedTimeHour.toString());
  }, [plannerScope, bedTimeHour]);

  const visibleDayCount = isMobile ? 1 : dayCount;

  const calendarAtPastLimit = useMemo(
    () => isCalendarScrollAtPastLimit(startDate, visibleDayCount),
    [startDate, visibleDayCount],
  );
  const calendarAtFutureLimit = useMemo(
    () => isCalendarScrollAtFutureLimit(startDate, visibleDayCount),
    [startDate, visibleDayCount],
  );

  useEffect(() => {
    setStartDate((prev) => clampStartDateForCalendarScroll(prev, visibleDayCount));
  }, [visibleDayCount]);

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
    [...allSizedTasks, ...dueSoonTasks].forEach(t => {
      if (t.placement) {
        map[t.id] = t.placement;
      }
    });
    return map;
  }, [allSizedTasks, dueSoonTasks]);

  const schedulableCalendarTasks = useMemo(() => {
    const fromDueSoon = dueSoonTasks.filter(t => t.size != null);
    const byId = new Map<string, Task>();
    for (const t of [...allSizedTasks, ...fromDueSoon]) {
      byId.set(t.id, t);
    }
    return [...byId.values()];
  }, [allSizedTasks, dueSoonTasks]);

  const calendarQuery = useEventsForRange(dateKeys[0], Math.max(dateKeys.length, 1), shouldBustCache);
  const apiConfigured = calendarQuery.isConfigured;
  const syncWarnings = calendarQuery.data?.syncWarnings || [];

  const { data: calendarFeeds = [] } = useCalendarFeeds();
  const visibleFeedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const feed of calendarFeeds) {
      if (feed.hiddenByUser) continue;
      if (plannerScope === 'family') {
        if (feed.sharedWithFamily) ids.add(feed.id);
      } else {
        // Me view: own enabled feeds + shared feeds
        if (feed.isOwner && feed.enabled) ids.add(feed.id);
        else if (!feed.isOwner && feed.sharedWithFamily) ids.add(feed.id);
      }
    }
    return ids;
  }, [calendarFeeds, plannerScope]);

  const handleRefresh = useCallback(() => {
    setShouldBustCache(true);
    // Reset the flag after a short delay so subsequent range changes use cache again
    setTimeout(() => setShouldBustCache(false), 1000);
  }, []);

  const handleTriage = useCallback((id: string, taskSize: TaskSize, taskVital: boolean) => {
    triageTask.mutate({ id, size: taskSize, vital: taskVital });
  }, [triageTask]);

  // Build calendar events per day
  const eventsPerDay = useMemo(() => {
    const scopedEvents = calendarQuery.data?.events
      ? calendarQuery.data.events.filter(e => !e.feedId || visibleFeedIds.has(e.feedId))
      : [];
    const allRangeEvents = scopedEvents.length > 0 ? icalToCalEvents(scopedEvents) : [];

    return dateKeys.map((dateKey) => {
      const dayIcalEvents = allRangeEvents.filter(e => {
        let ce: CalendarEvent | undefined;
        if (e.id.startsWith('mirror-')) {
          const docId = e.id.slice('mirror-'.length);
          ce = calendarQuery.data?.events.find((ev) => ev.mirrorDocId === docId);
        } else if (e.id.startsWith('ical-')) {
          const idx = parseInt(e.id.replace('ical-', ''), 10);
          ce = calendarQuery.data?.events[idx];
        }
        if (!ce) return false;
        return eventOverlapsDateKey(ce, dateKey);
      });

      // Fallback logic
      const baseEvents = calendarQuery.data !== null && calendarQuery.data !== undefined
        ? dayIcalEvents
        : (dateKey === todayKey ? MOCK_CAL_EVENTS : []);

      const events: CalEvent[] = [...baseEvents];

      for (const task of schedulableCalendarTasks) {
        const calType = calendarEventTypeForTask(task);
        if (placedTaskDragPreview?.taskId === task.id) {
          if (placedTaskDragPreview.dateKey === dateKey) {
            events.push({
              id: `task-${task.id}`,
              title: task.title,
              startHour: placedTaskDragPreview.startHour,
              duration: placedTaskDragPreview.duration,
              type: calType,
              allDay: placedTaskDragPreview.allDay,
              investmentName: investments.find(i => i.id === task.investmentId)?.name,
            });
          }
          continue;
        }
        if (task.placement && task.placement.date === dateKey) {
          events.push({
            id: `task-${task.id}`,
            title: task.title,
            startHour: task.placement.startHour,
            duration: task.placement.duration,
            type: calType,
            investmentName: investments.find(i => i.id === task.investmentId)?.name,
          });
        } else if (!task.placement && dateKey === todayKey && isOverdueOrDueToday(task.deadline)) {
          events.push({
            id: `task-${task.id}`,
            title: task.title,
            startHour: 0,
            duration: 24,
            type: calType,
            allDay: true,
            investmentName: investments.find(i => i.id === task.investmentId)?.name,
          });
        }
      }

      return events;
    });
  }, [dateKeys, calendarQuery.data, visibleFeedIds, schedulableCalendarTasks, todayKey, placedTaskDragPreview]);

  const maxAllDayCount = useMemo(() => {
    return Math.max(...eventsPerDay.map(dayEvents => dayEvents.filter(e => e.allDay).length), 0);
  }, [eventsPerDay]);

  const registerDayGrid = useCallback((dk: string, el: HTMLDivElement | null) => {
    const m = dayGridElementsRef.current;
    if (el) m.set(dk, el);
    else m.delete(dk);
  }, []);

  const computeTimedDragPlacement = useCallback(
    (clientX: number, clientY: number, prevDateKey: string, duration: number): { dateKey: string; startHour: number } | null => {
      const grids = dayGridElementsRef.current;
      const dateKey = resolveStickyDateKey(grids, dateKeys, prevDateKey, clientX);
      const grid = grids.get(dateKey);
      if (!grid) return null;
      const rect = grid.getBoundingClientRect();
      const y = clientY - rect.top;
      let hour = wakeUpHour + y / PX_PER_HOUR;
      hour = snapToGrid(Math.max(wakeUpHour, Math.min(hour, bedTimeHour)));
      const startHour = Math.max(wakeUpHour, Math.min(hour, bedTimeHour - duration));
      return { dateKey, startHour };
    },
    [dateKeys, wakeUpHour, bedTimeHour],
  );

  const computeTimedDragPlacementIfInside = useCallback(
    (clientX: number, clientY: number, prevDateKey: string, duration: number): { dateKey: string; startHour: number } | null => {
      const grids = dayGridElementsRef.current;
      const dateKey = resolveStickyDateKey(grids, dateKeys, prevDateKey, clientX);
      const grid = grids.get(dateKey);
      if (!grid) return null;
      const rect = grid.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;
      const y = clientY - rect.top;
      let hour = wakeUpHour + y / PX_PER_HOUR;
      hour = snapToGrid(Math.max(wakeUpHour, Math.min(hour, bedTimeHour)));
      const startHour = Math.max(wakeUpHour, Math.min(hour, bedTimeHour - duration));
      return { dateKey, startHour };
    },
    [dateKeys, wakeUpHour, bedTimeHour],
  );

  const computeAllDayDragDateKey = useCallback(
    (clientX: number, prevDateKey: string) =>
      resolveStickyDateKey(dayGridElementsRef.current, dateKeys, prevDateKey, clientX),
    [dateKeys],
  );

  const focusPlacedTaskInList = useCallback(
    (taskId: string) => {
      const task = [...allSizedTasks, ...dueSoonTasks].find((t) => t.id === taskId);
      if (!task) return;

      skipClearExpandedOnNextSidebarMode.current = true;
      setSidebarMode(task.vital ? 'vital' : 'other');

      setExpandedTaskId(taskId);
      if (isMobile) setDrawerOpen(true);

      requestAnimationFrame(() => {
        document.querySelector(`[data-task-row-id="${taskId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    [allSizedTasks, dueSoonTasks, isMobile],
  );

  const handleTaskDrop = useCallback((taskId: string, startHour: number, dateKey: string) => {
    const task = [...allSizedTasks, ...dueSoonTasks].find(t => t.id === taskId);
    if (!task) return;
    updateTask.mutate({
      id: taskId,
      data: {
        placement: {
          date: dateKey,
          startHour,
          duration: task.placement?.duration ?? 2,
        },
      },
    });
  }, [allSizedTasks, dueSoonTasks, updateTask]);

  const handleTaskMove = useCallback((taskId: string, startHour: number, dateKey: string) => {
    const task = [...allSizedTasks, ...dueSoonTasks].find(t => t.id === taskId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: taskId,
      data: {
        placement: { ...task.placement, startHour, date: dateKey },
      },
    });
  }, [allSizedTasks, dueSoonTasks, updateTask]);

  const handleTaskAllDayMove = useCallback((taskId: string, dateKey: string) => {
    const task = [...allSizedTasks, ...dueSoonTasks].find(t => t.id === taskId);
    if (!task) return;
    const base = task.placement ?? { date: dateKey, startHour: 0, duration: 24 };
    updateTask.mutate({
      id: taskId,
      data: {
        placement: { ...base, date: dateKey },
      },
    });
  }, [allSizedTasks, dueSoonTasks, updateTask]);

  const handleTaskResize = useCallback((taskId: string, duration: number) => {
    const task = [...allSizedTasks, ...dueSoonTasks].find(t => t.id === taskId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: taskId,
      data: {
        placement: { ...task.placement, duration },
      },
    });
  }, [allSizedTasks, dueSoonTasks, updateTask]);

  const handleTaskRemove = useCallback((taskId: string) => {
    updateTask.mutate({
      id: taskId,
      data: { placement: null },
    });
  }, [updateTask]);

  const handleCapture = () => {
    if (!captureValue.trim()) return;
    createTask.mutate({ title: captureValue.trim() });
    setCaptureValue('');
  };

  const navigateBack = () =>
    setStartDate((prev) => clampStartDateForCalendarScroll(addDays(prev, -1), visibleDayCount));
  const navigateForward = () =>
    setStartDate((prev) => clampStartDateForCalendarScroll(addDays(prev, 1), visibleDayCount));
  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setStartDate(clampStartDateForCalendarScroll(d, visibleDayCount));
  };

  const sidebarContent = (
    <>
      {dueSoonTasks.length > 0 && (
        <DueSoonSidebar
          tasks={dueSoonTasks}
          placedTasks={placedTasksMap}
          expandedTaskId={expandedTaskId}
          onExpandedTaskIdChange={setExpandedTaskId}
        />
      )}

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
            border: '1px solid #E7E3DF',
            borderRadius: '12px',
            fontSize: '14px',
            background: '#fff',
            color: '#1D212B',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s ease',
          }}
        />

        {inboxTasks.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {scopedInboxTasks.map(task => (
              <div key={task.id} style={listCardStyle}>
                <div style={{ ...listCardInnerStyle, alignItems: 'center', flexWrap: 'wrap', rowGap: '8px' }}>
                  <div
                    style={{
                      ...listCardTitleStyle,
                      flex: 1,
                      minWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {(['S', 'M', 'L'] as const).map(s => (
                      <button key={s} type="button" onClick={() => handleTriage(task.id, s, false)} style={triageBtnStyle}>
                        {s}
                      </button>
                    ))}
                    <button type="button" onClick={() => handleTriage(task.id, 'M', true)} style={triageVitalBtnStyle}>
                      Vital
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        border: '1px solid #E7E3DF',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '12px',
        background: '#F2F0ED',
      }}>
        {(['vital', 'other'] as const).map(mode => (
          <div
            key={mode}
            onClick={() => setSidebarMode(mode)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: sidebarMode === mode ? '#fff' : '#1D212B',
              background: sidebarMode === mode ? '#EA6657' : 'transparent',
              fontWeight: sidebarMode === mode ? 700 : 500,
              userSelect: 'none',
              textTransform: 'capitalize',
              transition: 'all 0.2s ease',
              borderRadius: '12px',
            }}
          >
            {mode === 'vital' ? 'Vital' : 'Other'}
          </div>
        ))}
      </div>

      <TaskSidebar
        tasks={sidebarMode === 'vital' ? scopedVitalTasks : scopedOtherTasks}
        placedTasks={placedTasksMap}
        investments={investments}
        expandedTaskId={expandedTaskId}
        onExpandedTaskIdChange={setExpandedTaskId}
        reorderContext={plannerScope}
      />
    </>
  );

  return (
    <div style={{ maxWidth: '1700px', margin: '0 auto' }}>
      {syncWarnings.length > 0 && (
        <div style={{
          background: '#FFF4E5',
          border: '1px solid #FFD5AD',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#663C00', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠️ Calendar Sync Warnings
          </div>
          {syncWarnings.map((w, idx) => (
            <div key={idx} style={{ fontSize: '12px', color: '#663C00' }}>• {w}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
        {/* Day Calendars — off-white panel (nav + grid) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: '#FBFAF9',
            padding: '12px 0',
            borderRight: '1px solid #E7E3DF',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <button onClick={goToToday} style={{ ...navBtn, fontSize: '12px', padding: '4px 12px' }}>
              Today
            </button>
            <button
              type="button"
              onClick={navigateBack}
              disabled={calendarAtPastLimit}
              style={{
                ...navBtn,
                ...(calendarAtPastLimit ? navBtnDisabled : {}),
              }}
              title={calendarAtPastLimit ? 'At earliest date in range' : 'Previous day'}
              aria-label={calendarAtPastLimit ? 'Previous day (disabled, at range start)' : 'Previous day'}
            >
              ←
            </button>
            <button
              type="button"
              onClick={navigateForward}
              disabled={calendarAtFutureLimit}
              style={{
                ...navBtn,
                ...(calendarAtFutureLimit ? navBtnDisabled : {}),
              }}
              title={calendarAtFutureLimit ? 'At latest date in range' : 'Next day'}
              aria-label={calendarAtFutureLimit ? 'Next day (disabled, at range end)' : 'Next day'}
            >
              →
            </button>
            
            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                onClick={handleRefresh}
                disabled={calendarQuery.isFetching}
                style={{ ...navBtn, padding: '4px 8px', fontSize: '14px', opacity: calendarQuery.isFetching ? 0.5 : 1 }}
                title="Refresh Calendar"
              >
                {calendarQuery.isFetching ? '⏳' : '🔄'}
              </button>

              {!isMobile && (
                <>
                  <select
                    value={dayCount}
                    onChange={(e) => setDayCount(parseInt(e.target.value, 10))}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #E7E3DF',
                      borderRadius: '8px',
                      background: '#fff',
                      fontSize: '12px',
                      color: '#1D212B',
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
                </>
              )}
            </div>
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
                maxAllDayCount={maxAllDayCount}
                startHour={wakeUpHour}
                endHour={bedTimeHour}
                compact
                showLabels={i === 0}
                isToday={dateKeys[i] === todayKey}
                registerDayGrid={registerDayGrid}
                onPlacedTaskInList={focusPlacedTaskInList}
                computeTimedDragPlacement={computeTimedDragPlacement}
                computeTimedDragPlacementIfInside={computeTimedDragPlacementIfInside}
                computeAllDayDragDateKey={computeAllDayDragDateKey}
                onTaskDrop={handleTaskDrop}
                onTaskMove={handleTaskMove}
                onTaskAllDayMove={handleTaskAllDayMove}
                onTaskResize={handleTaskResize}
                onTaskRemove={handleTaskRemove}
                onPlacedTaskDragPreviewChange={setPlacedTaskDragPreview}
                activePlacedDragTaskId={placedTaskDragPreview?.taskId ?? null}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        {!isMobile && (
          <div style={{ width: '600px', flexShrink: 0, padding: '12px 16px' }}>
            {sidebarContent}
          </div>
        )}
      </div>

      {isMobile && (
        <SideDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={plannerScope === 'family' ? 'Family tasks' : 'Me'}
        >
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
          {plannerScope === 'me' && (
            <div style={{ borderTop: '1px solid #E7E3DF', paddingTop: '16px' }}>
              <CalendarFeedSettings />
            </div>
          )}
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
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '16px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};

const navBtnDisabled: React.CSSProperties = {
  opacity: 0.35,
  cursor: 'not-allowed',
};

const triageBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};

const triageVitalBtnStyle: React.CSSProperties = {
  ...triageBtnStyle,
  background: '#E14747',
  borderColor: '#E14747',
  color: '#fff',
};

const settingLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  color: '#1D212B',
  marginBottom: '6px',
};

const settingInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
