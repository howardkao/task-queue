import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DayCalendar } from './DayCalendar';
import { BoulderSidebar } from './BoulderSidebar';
import { RockSidebar } from './RockSidebar';
import { PebbleSidebar } from './PebbleSidebar';
import {
  useTodayBoulders,
  useTodayRocks,
  useTodayPebbles,
  useTodayInboxTasks,
  useCreateTask,
  useClassifyTask,
  useUpdateTask,
  useDueSoonTasks,
  isOverdueOrDueToday,
  STANDALONE_PROJECT_FILTER,
  type PlannerScope,
} from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';
import { readPlannerStorage, writePlannerStorage } from '../../plannerStorage';
import { useIsMobile } from '../../hooks/useViewport';
import { useCalendarFeeds, useEventsForRange } from '../../hooks/useCalendar';
import type { CalEvent, PlacedTaskDragPreview } from './dayCalendarTypes';
import type { CalendarEvent, Classification, Priority, Task } from '../../types';
import type { TodayProjectFilter } from '../../hooks/useTasks';
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

type SidebarMode = 'boulders' | 'rocks' | 'pebbles';

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

export interface TodayViewProps {
  plannerScope?: PlannerScope;
}

export function TodayView({ plannerScope = 'me' }: TodayViewProps) {
  const isMobile = useIsMobile();
  const { data: projects = [] } = useProjects('active');
  const unfilteredProjectFilter = useMemo<TodayProjectFilter>(() => [], []);
  const [projectFilter, setProjectFilter] = useState<TodayProjectFilter>(() => {
    const saved = readPlannerStorage(plannerScope, 'projectFilter');
    return saved ? JSON.parse(saved) : [];
  });
  const { data: boulders = [] } = useTodayBoulders(projectFilter, plannerScope);
  const { data: rocks = [] } = useTodayRocks(projectFilter, plannerScope);
  const { data: allBoulders = [] } = useTodayBoulders(unfilteredProjectFilter, plannerScope);
  const { data: allRocks = [] } = useTodayRocks(unfilteredProjectFilter, plannerScope);
  const { data: allPebbles = [] } = useTodayPebbles(unfilteredProjectFilter, plannerScope);
  const { data: inboxTasks = [] } = useTodayInboxTasks(projectFilter, plannerScope);
  const createTask = useCreateTask();
  const classifyTask = useClassifyTask();
  const dueSoonTasks = useDueSoonTasks(plannerScope);

  const [priorityFilter, setPriorityFilter] = useState<Priority[]>(() => {
    const saved = readPlannerStorage(plannerScope, 'priorityFilter');
    return saved ? JSON.parse(saved) : [];
  });
  const [isFilterExpanded, setIsFilterExpanded] = useState(() => {
    const saved = readPlannerStorage(plannerScope, 'isFilterExpanded');
    return saved === 'true';
  });

  const getFilterSummary = useCallback(() => {
    const pStr = priorityFilter.length === 0 ? 'All' : priorityFilter.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
    let prjStr = 'All';
    if (projectFilter.length > 0) {
      const names = projectFilter.map(pid => {
        if (pid === STANDALONE_PROJECT_FILTER) return 'None';
        return projects.find(p => p.id === pid)?.name || 'Unknown';
      });
      if (names.length <= 2) {
        prjStr = names.join(', ');
      } else {
        prjStr = `${names.length} projects`;
      }
    }
    return `Priority: ${pStr} • Projects: ${prjStr}`;
  }, [priorityFilter, projectFilter, projects]);

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const saved = readPlannerStorage(plannerScope, 'sidebarMode');
    return (saved as SidebarMode) || 'boulders';
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
    writePlannerStorage(plannerScope, 'projectFilter', JSON.stringify(projectFilter));
  }, [plannerScope, projectFilter]);
  useEffect(() => {
    writePlannerStorage(plannerScope, 'priorityFilter', JSON.stringify(priorityFilter));
  }, [plannerScope, priorityFilter]);
  useEffect(() => {
    writePlannerStorage(plannerScope, 'isFilterExpanded', String(isFilterExpanded));
  }, [plannerScope, isFilterExpanded]);
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
    [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].forEach(t => {
      if (t.placement) {
        map[t.id] = t.placement;
      }
    });
    return map;
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks]);

  const schedulableCalendarTasks = useMemo(() => {
    const fromDueSoon = dueSoonTasks.filter(
      (t) =>
        t.classification === 'boulder' ||
        t.classification === 'rock' ||
        t.classification === 'pebble'
    );
    const byId = new Map<string, Task>();
    for (const t of [...allBoulders, ...allRocks, ...allPebbles, ...fromDueSoon]) {
      byId.set(t.id, t);
    }
    return [...byId.values()];
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks]);

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

  // Priority filtering
  const togglePriorityFilter = useCallback((value: Priority) => {
    setPriorityFilter(prev => (
      prev.includes(value)
        ? prev.filter(item => item !== value)
        : [...prev, value]
    ));
  }, []);

  const toggleProjectFilter = useCallback((value: string) => {
    setProjectFilter(prev => (
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
        return ce.start.startsWith(dateKey);
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
              id: `boulder-${task.id}`,
              title: task.title,
              startHour: placedTaskDragPreview.startHour,
              duration: placedTaskDragPreview.duration,
              type: calType,
              allDay: placedTaskDragPreview.allDay,
              projectName: task.projectId ? 'Project' : undefined,
            });
          }
          continue;
        }
        if (task.placement && task.placement.date === dateKey) {
          events.push({
            id: `boulder-${task.id}`,
            title: task.title,
            startHour: task.placement.startHour,
            duration: task.placement.duration,
            type: calType,
            projectName: task.projectId ? 'Project' : undefined,
          });
        } else if (!task.placement && dateKey === todayKey && isOverdueOrDueToday(task.deadline)) {
          events.push({
            id: `boulder-${task.id}`,
            title: task.title,
            startHour: 0,
            duration: 24,
            type: calType,
            allDay: true,
            projectName: task.projectId ? 'Project' : undefined,
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

  const computeAllDayDragDateKey = useCallback(
    (clientX: number, prevDateKey: string) =>
      resolveStickyDateKey(dayGridElementsRef.current, dateKeys, prevDateKey, clientX),
    [dateKeys],
  );

  const focusPlacedTaskInList = useCallback(
    (taskId: string) => {
      const task = [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].find((t) => t.id === taskId);
      if (!task) return;

      skipClearExpandedOnNextSidebarMode.current = true;
      if (task.classification === 'boulder') setSidebarMode('boulders');
      else if (task.classification === 'rock') setSidebarMode('rocks');
      else if (task.classification === 'pebble') setSidebarMode('pebbles');

      const p = task.priority || 'low';
      setPriorityFilter((prev) => (prev.length > 0 && !prev.includes(p) ? [...prev, p] : prev));
      if (task.classification === 'pebble') {
        const chip = task.projectId ?? STANDALONE_PROJECT_FILTER;
        setProjectFilter((prev) => (prev.length > 0 && !prev.includes(chip) ? [...prev, chip] : prev));
      }

      setExpandedTaskId(taskId);
      if (isMobile) setDrawerOpen(true);

      requestAnimationFrame(() => {
        document.querySelector(`[data-task-row-id="${taskId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    [allBoulders, allRocks, allPebbles, dueSoonTasks, isMobile],
  );

  const handleBoulderDrop = useCallback((boulderId: string, startHour: number, dateKey: string) => {
    const task = [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].find(t => t.id === boulderId);
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
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks, updateTask]);

  const handleBoulderMove = useCallback((boulderId: string, startHour: number, dateKey: string) => {
    const task = [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: { ...task.placement, startHour, date: dateKey },
      },
    });
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks, updateTask]);

  const handleBoulderAllDayMove = useCallback((boulderId: string, dateKey: string) => {
    const task = [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task) return;
    const base = task.placement ?? { date: dateKey, startHour: 0, duration: 24 };
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: { ...base, date: dateKey },
      },
    });
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks, updateTask]);

  const handleBoulderResize = useCallback((boulderId: string, duration: number) => {
    const task = [...allBoulders, ...allRocks, ...allPebbles, ...dueSoonTasks].find(t => t.id === boulderId);
    if (!task || !task.placement) return;
    updateTask.mutate({
      id: boulderId,
      data: {
        placement: { ...task.placement, duration },
      },
    });
  }, [allBoulders, allRocks, allPebbles, dueSoonTasks, updateTask]);

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

  const navigateBack = () =>
    setStartDate((prev) => clampStartDateForCalendarScroll(addDays(prev, -1), visibleDayCount));
  const navigateForward = () =>
    setStartDate((prev) => clampStartDateForCalendarScroll(addDays(prev, 1), visibleDayCount));
  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setStartDate(clampStartDateForCalendarScroll(d, visibleDayCount));
  };

  const standaloneCount = filteredBoulders.filter(b => !b.projectId).length;
  const projectBoulderIds = new Set(filteredBoulders.filter(b => b.projectId).map(b => b.projectId));
  const activeProjectCount = projectBoulderIds.size;

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

        {filteredInboxTasks.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {filteredInboxTasks.map(task => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button type="button" onClick={() => handleClassify(task.id, 'boulder')} style={classifyBtnStyle}>Boulder</button>
                    <button type="button" onClick={() => handleClassify(task.id, 'rock')} style={classifyBtnStyle}>Rock</button>
                    <button type="button" onClick={() => handleClassify(task.id, 'pebble')} style={classifyBtnStyle}>Pebble</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        background: '#F9F7F6',
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid #EFEDEB',
        marginBottom: '16px',
        transition: 'all 0.2s ease',
      }}>
        <div
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            marginRight: '12px',
          }}>
            {isFilterExpanded ? (
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '10px', fontWeight: 600 }}>Filters</span>
            ) : (
              <span>
                <strong style={{ color: '#1D212B', marginRight: '6px' }}>Filters:</strong>
                {getFilterSummary()}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#EA6657', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isFilterExpanded ? 'Collapse ▲' : 'Expand ▼'}
          </div>
        </div>

        {isFilterExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
            <div>
              <div style={filterHeaderStyle}>Priority</div>
              <div style={filterChipWrapStyle}>
                {(['high', 'med', 'low'] as const).map(p => {
                  const colors: Record<string, { bg: string; border: string }> = {
                    high: { bg: '#E14747', border: '#E14747' },
                    med: { bg: '#F59F0A', border: '#F59F0A' },
                    low: { bg: '#478CD1', border: '#478CD1' },
                  };
                  const active = priorityFilter.includes(p as Priority);
                  const label = p.charAt(0).toUpperCase() + p.slice(1);
                  return (
                    <button
                      key={p}
                      onClick={(e) => { e.stopPropagation(); togglePriorityFilter(p as Priority); }}
                      style={{
                        ...filterChipStyle,
                        ...(active ? { background: colors[p].bg, borderColor: colors[p].border, color: '#fff' } : {}),
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={filterHeaderStyle}>Projects</div>
              <div style={filterChipWrapStyle}>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleProjectFilter(STANDALONE_PROJECT_FILTER); }}
                  style={{ ...filterChipStyle, ...(projectFilter.includes(STANDALONE_PROJECT_FILTER) ? activeFilterChipStyle : {}) }}
                >
                  None
                </button>
                {projects.map(project => (
                  <button
                    key={project.id}
                    onClick={(e) => { e.stopPropagation(); toggleProjectFilter(project.id); }}
                    style={{ ...filterChipStyle, ...(projectFilter.includes(project.id) ? activeFilterChipStyle : {}) }}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            </div>
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
              color: sidebarMode === mode ? '#fff' : '#1D212B',
              background: sidebarMode === mode ? '#EA6657' : 'transparent',
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
          expandedTaskId={expandedTaskId}
          onExpandedTaskIdChange={setExpandedTaskId}
          reorderContext={plannerScope}
        />
      )}
      {sidebarMode === 'rocks' && (
        <RockSidebar
          rocks={filteredRocks}
          placedBoulders={placedTasksMap}
          expandedTaskId={expandedTaskId}
          onExpandedTaskIdChange={setExpandedTaskId}
          reorderContext={plannerScope}
        />
      )}
      {sidebarMode === 'pebbles' && (
        <PebbleSidebar
          projectFilter={projectFilter}
          priorityFilter={priorityFilter}
          expandedTaskId={expandedTaskId}
          onExpandedTaskIdChange={setExpandedTaskId}
          plannerScope={plannerScope}
        />
      )}
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
                computeAllDayDragDateKey={computeAllDayDragDateKey}
                onBoulderDrop={handleBoulderDrop}
                onBoulderMove={handleBoulderMove}
                onBoulderAllDayMove={handleBoulderAllDayMove}
                onBoulderResize={handleBoulderResize}
                onBoulderRemove={handleBoulderRemove}
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

const classifyBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
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

const filterHeaderStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#6b7280',
  fontWeight: 500,
  marginBottom: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const filterChipWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

const filterChipStyle: React.CSSProperties = {
  padding: '5px 12px',
  border: '1px solid #E7E3DF',
  borderRadius: '999px',
  fontSize: '12px',
  background: '#fff',
  color: '#1D212B',
  fontFamily: 'inherit',
  cursor: 'pointer',
  fontWeight: 500,
};

const activeFilterChipStyle: React.CSSProperties = {
  background: '#EA6657',
  borderColor: '#EA6657',
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
