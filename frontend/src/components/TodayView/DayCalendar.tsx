import type { MutableRefObject } from 'react';
import { useMemo, useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { calendarEventCardChrome, calendarEventTitleStyle } from '../shared/listCardStyles';
import { getPlacedTaskCalendarChrome } from '../../theme/calendarFeedPalette';
import type { CalEvent, PlacedTaskDragPreview } from './dayCalendarTypes';
import { DayCalendarEventModal } from './DayCalendarEventModal';
import { ALL_DAY_ROW_HEIGHT, PX_PER_HOUR, SLOT_HEIGHT, SNAP, PLACED_TASK_PRE_DRAG_MOVE_PX } from './dayCalendarConstants';
import {
  externalCalendarChrome,
  formatHourMinute,
  formatTimeLabel,
  isPlacedTaskEventType,
  snapToGrid,
} from './dayCalendarUtils';
import { computeTimedEventOverlapLayout } from './dayCalendarOverlapLayout';

/** Horizontal overlap between adjacent lane columns: step = (1 − this) × card width. */
const OVERLAP_LANE_OVERLAP_FRACTION = 0.3;
/** Gap between time labels and timed-event cards (must match timed track `left` below). */
const TIMED_TRACK_LEFT_GUTTER_PX = 8;
const TIMED_TRACK_RIGHT_MARGIN_PX = 4;
const PRE_DRAG_THRESHOLD_SQ = PLACED_TASK_PRE_DRAG_MOVE_PX * PLACED_TASK_PRE_DRAG_MOVE_PX;

export type { CalEvent } from './dayCalendarTypes';

interface DayCalendarProps {
  date: string;
  dateKey: string;
  events: CalEvent[];
  maxAllDayCount?: number;
  /** Measured pixel height all columns should use for the all-day section. */
  allDayHeight?: number;
  /** Changes when the set of visible calendar days changes; forces a fresh all-day height measure. */
  allDayLayoutSyncKey: string;
  /** Report this column's natural all-day content height to the parent. */
  onAllDayHeightMeasured?: (dateKey: string, height: number) => void;
  startHour?: number;
  endHour?: number;
  compact?: boolean;
  showLabels?: boolean;
  isToday?: boolean;
  registerDayGrid?: (dateKey: string, el: HTMLDivElement | null) => void;
  onPlacedTaskInList?: (taskId: string) => void;
  computeTimedDragPlacement?: (
    clientX: number,
    clientY: number,
    prevDateKey: string,
    duration: number,
  ) => { dateKey: string; startHour: number } | null;
  computeTimedDragPlacementIfInside?: (
    clientX: number,
    clientY: number,
    prevDateKey: string,
    duration: number,
  ) => { dateKey: string; startHour: number } | null;
  computeAllDayDragDateKey?: (clientX: number, prevDateKey: string) => string;
  onPlacedTaskDragPreviewChange?: (preview: PlacedTaskDragPreview | null) => void;
  activePlacedDragTaskId?: string | null;
  onTaskDrop?: (taskId: string, startHour: number, dateKey: string) => void;
  onTaskMove?: (taskId: string, startHour: number, dateKey: string) => void;
  onTaskAllDayMove?: (taskId: string, dateKey: string) => void;
  onTaskResize?: (taskId: string, duration: number) => void;
  onTaskRemove?: (taskId: string) => void;
  /** Hours for sidebar→calendar drag preview and drop clamping; defaults to 2 when unset. */
  sidebarDropDurationHoursRef?: MutableRefObject<number>;
}

export function DayCalendar({
  date, dateKey, events, maxAllDayCount = 0, allDayHeight, allDayLayoutSyncKey, onAllDayHeightMeasured,
  startHour = 7, endHour = 22, compact = false,
  showLabels = true, isToday = false,
  registerDayGrid,
  onPlacedTaskInList,
  computeTimedDragPlacement,
  computeTimedDragPlacementIfInside,
  computeAllDayDragDateKey,
  onPlacedTaskDragPreviewChange,
  activePlacedDragTaskId = null,
  onTaskDrop, onTaskMove, onTaskAllDayMove, onTaskResize, onTaskRemove,
  sidebarDropDurationHoursRef,
}: DayCalendarProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const allDaySectionRef = useRef<HTMLDivElement | null>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [openTimedOverflow, setOpenTimedOverflow] = useState<'before' | 'after' | null>(null);
  const timedOverflowRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    dateKey,
    computeTimedDragPlacement,
    computeTimedDragPlacementIfInside,
    computeAllDayDragDateKey,
    onPlacedTaskInList,
    onPlacedTaskDragPreviewChange,
    onTaskDrop,
    onTaskMove,
    onTaskAllDayMove,
  });
  propsRef.current = {
    dateKey,
    computeTimedDragPlacement,
    computeTimedDragPlacementIfInside,
    computeAllDayDragDateKey,
    onPlacedTaskInList,
    onPlacedTaskDragPreviewChange,
    onTaskDrop,
    onTaskMove,
    onTaskAllDayMove,
  };

  useEffect(() => {
    if (!isToday) return;
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [isToday]);

  useEffect(() => {
    if (!openTimedOverflow) return;
    const close = (e: MouseEvent) => {
      const el = timedOverflowRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpenTimedOverflow(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openTimedOverflow]);

  const currentHour = useMemo(() => {
    return now.getHours() + now.getMinutes() / 60;
  }, [now]);

  const [interacting, setInteracting] = useState<{
    type: 'resize';
    eventId: string;
    startY: number;
    currentStartHour: number;
    currentDuration: number;
  } | null>(null);

  const slots = useMemo(() => {
    const result: number[] = [];
    for (let h = startHour; h < endHour; h += 0.5) {
      result.push(h);
    }
    return result;
  }, [startHour, endHour]);

  const yToHour = useCallback((clientY: number): number => {
    if (!gridRef.current) return startHour;
    const rect = gridRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const hour = startHour + y / PX_PER_HOUR;
    return snapToGrid(Math.max(startHour, Math.min(hour, endHour)));
  }, [startHour, endHour]);

  const dropDurationHours = () => sidebarDropDurationHoursRef?.current ?? 2;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('task-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const duration = dropDurationHours();
    let hour = yToHour(e.clientY);
    hour = Math.max(startHour, Math.min(hour, endHour - duration));
    setDragOverHour(hour);
  }, [yToHour, startHour, endHour, sidebarDropDurationHoursRef]);

  const handleDragLeave = useCallback(() => {
    setDragOverHour(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverHour(null);
    const taskId = e.dataTransfer.getData('task-id');
    if (!taskId || !onTaskDrop) return;
    const duration = dropDurationHours();
    let hour = yToHour(e.clientY);
    hour = Math.max(startHour, Math.min(hour, endHour - duration));
    onTaskDrop(taskId, hour, dateKey);
  }, [yToHour, onTaskDrop, dateKey, startHour, endHour, sidebarDropDurationHoursRef]);

  const setGridEl = useCallback((el: HTMLDivElement | null) => {
    gridRef.current = el;
    registerDayGrid?.(dateKey, el);
  }, [dateKey, registerDayGrid]);

  const lastPreviewDuringDragRef = useRef<PlacedTaskDragPreview | null>(null);
  const dragDateKeyRef = useRef(dateKey);

  const attachPlacedTimedPointerSession = useCallback((e: React.PointerEvent, eventId: string, ev: CalEvent) => {
    if (e.button !== 0) return;
    const taskId = eventId.replace('task-', '');
    const startX = e.clientX;
    const startY = e.clientY;
    let dragStarted = false;

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== e.pointerId) return;
      const dx = pe.clientX - startX;
      const dy = pe.clientY - startY;
      if (!dragStarted && dx * dx + dy * dy > PRE_DRAG_THRESHOLD_SQ) {
        dragStarted = true;
        const pr = propsRef.current;
        dragDateKeyRef.current = pr.dateKey;
        const init: PlacedTaskDragPreview = {
          taskId,
          dateKey: pr.dateKey,
          startHour: ev.startHour,
          duration: ev.duration,
          allDay: false,
        };
        lastPreviewDuringDragRef.current = init;
        pr.onPlacedTaskDragPreviewChange?.(init);
      }
      if (dragStarted) {
        const pr = propsRef.current;
        if (!pr.computeTimedDragPlacement) return;
        const next = pr.computeTimedDragPlacement(
          pe.clientX,
          pe.clientY,
          dragDateKeyRef.current,
          ev.duration,
        );
        if (next) {
          dragDateKeyRef.current = next.dateKey;
          const preview: PlacedTaskDragPreview = {
            taskId: taskId,
            dateKey: next.dateKey,
            startHour: next.startHour,
            duration: ev.duration,
            allDay: false,
          };
          lastPreviewDuringDragRef.current = preview;
          pr.onPlacedTaskDragPreviewChange?.(preview);
        }
      }
    };

    const onUp = (pe: PointerEvent) => {
      if (pe.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const pr = propsRef.current;
      const dx = pe.clientX - startX;
      const dy = pe.clientY - startY;
      if (!dragStarted) {
        if (dx * dx + dy * dy <= PRE_DRAG_THRESHOLD_SQ) {
          pr.onPlacedTaskInList?.(taskId);
        }
      } else {
        const p = lastPreviewDuringDragRef.current;
        lastPreviewDuringDragRef.current = null;
        pr.onPlacedTaskDragPreviewChange?.(null);
        if (p) pr.onTaskMove?.(p.taskId, p.startHour, p.dateKey);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const attachPlacedAllDayPointerSession = useCallback((e: React.PointerEvent, eventId: string, ev: CalEvent) => {
    if (e.button !== 0) return;
    const taskId = eventId.replace('task-', '');
    const startX = e.clientX;
    const startY = e.clientY;
    let dragStarted = false;

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== e.pointerId) return;
      const dx = pe.clientX - startX;
      const dy = pe.clientY - startY;
      if (!dragStarted && dx * dx + dy * dy > PRE_DRAG_THRESHOLD_SQ) {
        dragStarted = true;
        const pr = propsRef.current;
        dragDateKeyRef.current = pr.dateKey;
        const init: PlacedTaskDragPreview = {
          taskId,
          dateKey: pr.dateKey,
          startHour: 0,
          duration: 24,
          allDay: true,
        };
        lastPreviewDuringDragRef.current = init;
        pr.onPlacedTaskDragPreviewChange?.(init);
      }
      if (dragStarted) {
        const pr = propsRef.current;
        const timedDuration = ev.duration >= 23.9 ? 2 : ev.duration;
        const timedPlacement = pr.computeTimedDragPlacementIfInside?.(
          pe.clientX,
          pe.clientY,
          dragDateKeyRef.current,
          timedDuration,
        );
        if (timedPlacement) {
          dragDateKeyRef.current = timedPlacement.dateKey;
          const preview: PlacedTaskDragPreview = {
            taskId,
            dateKey: timedPlacement.dateKey,
            startHour: timedPlacement.startHour,
            duration: timedDuration,
            allDay: false,
          };
          lastPreviewDuringDragRef.current = preview;
          pr.onPlacedTaskDragPreviewChange?.(preview);
          return;
        }
        if (!pr.computeAllDayDragDateKey) return;
        const nextKey = pr.computeAllDayDragDateKey(pe.clientX, dragDateKeyRef.current);
        dragDateKeyRef.current = nextKey;
        const preview: PlacedTaskDragPreview = {
          taskId,
          dateKey: nextKey,
          startHour: 0,
          duration: 24,
          allDay: true,
        };
        lastPreviewDuringDragRef.current = preview;
        pr.onPlacedTaskDragPreviewChange?.(preview);
      }
    };

    const onUp = (pe: PointerEvent) => {
      if (pe.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const pr = propsRef.current;
      const dx = pe.clientX - startX;
      const dy = pe.clientY - startY;
      if (!dragStarted) {
        if (dx * dx + dy * dy <= PRE_DRAG_THRESHOLD_SQ) {
          pr.onPlacedTaskInList?.(taskId);
        }
      } else {
        const p = lastPreviewDuringDragRef.current;
        lastPreviewDuringDragRef.current = null;
        pr.onPlacedTaskDragPreviewChange?.(null);
        if (!p) return;
        if (p.allDay) return;
        pr.onTaskDrop?.(p.taskId, p.startHour, p.dateKey);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const event = events.find(ev => ev.id === eventId);
    if (!event) return;

    const stateRef = {
      currentStartHour: event.startHour,
      currentDuration: event.duration,
    };

    setInteracting({
      type: 'resize',
      eventId,
      startY: e.clientY,
      currentStartHour: event.startHour,
      currentDuration: event.duration,
    });

    const handleMouseMove = (me: MouseEvent) => {
      const deltaY = me.clientY - e.clientY;
      const deltaHours = deltaY / PX_PER_HOUR;
      const newDuration = snapToGrid(event.duration + deltaHours);
      const clamped = Math.max(SNAP, Math.min(newDuration, endHour - event.startHour));
      stateRef.currentDuration = clamped;
      setInteracting(prev => prev ? { ...prev, currentDuration: clamped } : null);
    };

    const handleMouseUp = () => {
      onTaskResize?.(eventId.replace('task-', ''), stateRef.currentDuration);
      setInteracting(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [events, endHour, onTaskResize]);

  const timeColWidth = showLabels ? (compact ? 40 : 60) : 0;

  const { allDayEvents, timedEvents } = useMemo(() => {
    return {
      allDayEvents: events.filter(e => e.allDay),
      timedEvents: events.filter(e => !e.allDay),
    };
  }, [events]);

  // Measure all-day content height after layout; re-run when visible range, events, or column width change.
  useLayoutEffect(() => {
    if (!onAllDayHeightMeasured || !allDaySectionRef.current) return;
    const el = allDaySectionRef.current;
    const report = () => onAllDayHeightMeasured(dateKey, el.scrollHeight);
    report();
    const ro = new ResizeObserver(() => report());
    ro.observe(el);
    return () => ro.disconnect();
  }, [dateKey, allDayEvents.length, allDayLayoutSyncKey, onAllDayHeightMeasured]);

  const timedEventsForLayout = useMemo(() => {
    if (!interacting) return timedEvents;
    return timedEvents.map((ev) =>
      ev.id === interacting.eventId
        ? { ...ev, startHour: interacting.currentStartHour, duration: interacting.currentDuration }
        : ev,
    );
  }, [timedEvents, interacting]);

  const overlapLayout = useMemo(
    () => computeTimedEventOverlapLayout(timedEventsForLayout),
    [timedEventsForLayout],
  );

  const { timedOverflowBefore, timedOverflowAfter } = useMemo(() => {
    const before = timedEventsForLayout
      .filter((e) => e.startHour < startHour)
      .slice()
      .sort((a, b) => a.startHour - b.startHour);
    const after = timedEventsForLayout
      .filter((e) => e.startHour + e.duration > endHour)
      .slice()
      .sort((a, b) => a.startHour - b.startHour);
    return { timedOverflowBefore: before, timedOverflowAfter: after };
  }, [timedEventsForLayout, startHour, endHour]);

  const getEventStyle = (event: CalEvent): React.CSSProperties => {
    const isInteractingResize = interacting?.eventId === event.id;
    const displayStartHour = isInteractingResize ? interacting.currentStartHour : event.startHour;
    const displayDuration = isInteractingResize ? interacting.currentDuration : event.duration;

    const top = (displayStartHour - startHour) * PX_PER_HOUR;
    const rawHeight = displayDuration * PX_PER_HOUR - 4;
    const heightPx = Math.max(rawHeight, 24);
    const paddingY = heightPx >= 38 ? 10 : 4;

    const placed = isPlacedTaskEventType(event.type);
    const taskChrome = placed ? getPlacedTaskCalendarChrome() : null;
    const extChrome = externalCalendarChrome(event);

    const lane = overlapLayout.get(event.id) ?? { column: 0, columnCount: 1 };
    const { column: laneCol, columnCount: laneCount } = lane;
    const stepFraction = 1 - OVERLAP_LANE_OVERLAP_FRACTION;
    const widthDenom = 1 + stepFraction * Math.max(0, laneCount - 1);
    const stepScaled = laneCol * stepFraction;
    const cardWidthCalc = `calc(100% / ${widthDenom})`;
    const leftExpr =
      laneCol === 0
        ? '0'
        : `calc(${stepScaled} * (100% / ${widthDenom}))`;

    const taskId = event.id.replace('task-', '');
    const isActiveDrag = placed && activePlacedDragTaskId === taskId;

    return {
      position: 'absolute',
      top: `${top}px`,
      left: leftExpr,
      width: cardWidthCalc,
      right: 'auto',
      height: `${heightPx}px`,
      ...calendarEventCardChrome,
      ...(taskChrome
        ? { background: taskChrome.background, border: taskChrome.border }
        : extChrome
          ? { background: extChrome.background, border: extChrome.border }
          : {}),
      padding: `${paddingY}px ${laneCount > 1 ? 6 : 12}px`,
      overflow: 'hidden',
      pointerEvents: 'auto',
      zIndex: isActiveDrag
        ? 100
        : (placed ? 40 : 20) + laneCol,
      userSelect: 'none',
      touchAction: isActiveDrag ? 'none' : undefined,
      cursor: placed ? 'default' : 'pointer',
    };
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: compact ? '12px' : '16px',
        fontWeight: 600,
        color: '#1D212B',
        padding: compact ? '8px 10px' : '12px 16px',
        border: '1px solid #E7E3DF',
        background: 'transparent',
      }}>
        {date}
      </div>

      {maxAllDayCount > 0 && (
        <div
          ref={allDaySectionRef}
          onDragOver={(ev) => {
            if (ev.dataTransfer.types.includes('task-id')) {
              ev.dataTransfer.dropEffect = 'none';
            }
          }}
          onDrop={(ev) => {
            if (ev.dataTransfer.types.includes('task-id')) {
              ev.preventDefault();
            }
          }}
          style={{
          padding: '4px 4px',
          border: '1px solid #E7E3DF',
          borderTop: 'none',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          ...(allDayHeight != null ? { height: `${allDayHeight}px` } : {}),
        }}
        >
          {allDayEvents.map(event => {
            const isUserTask = isPlacedTaskEventType(event.type);
            const taskChrome = isUserTask ? getPlacedTaskCalendarChrome() : null;
            const extChrome = !isUserTask ? externalCalendarChrome(event) : null;
            const taskId = event.id.replace('task-', '');
            const isActiveAllDayDrag = isUserTask && activePlacedDragTaskId === taskId;

            return (
              <div key={event.id} style={{ display: 'flex' }}>
                <div style={{ width: `${timeColWidth + 8}px`, flexShrink: 0 }} />
                <div
                  onClick={!isUserTask ? () => setSelectedEvent(event) : undefined}
                  onPointerDown={isUserTask ? (ev) => attachPlacedAllDayPointerSession(ev, event.id, event) : undefined}
                  onContextMenu={isUserTask ? (ev) => ev.preventDefault() : undefined}
                  style={{
                    flex: 1,
                    minHeight: `${ALL_DAY_ROW_HEIGHT}px`,
                    ...calendarEventTitleStyle,
                    ...(taskChrome ? { color: taskChrome.titleColor } : extChrome ? { color: extChrome.titleColor } : {}),
                    padding: '4px 12px',
                    ...calendarEventCardChrome,
                    ...(taskChrome
                      ? { background: taskChrome.background, border: taskChrome.border }
                      : extChrome
                        ? { background: extChrome.background, border: extChrome.border }
                        : {}),
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '4px',
                    marginBottom: '4px',
                    cursor: isUserTask ? 'default' : 'pointer',
                    userSelect: 'none',
                    touchAction: isUserTask ? 'manipulation' : undefined,
                    zIndex: isActiveAllDayDrag ? 12 : undefined,
                    position: 'relative',
                  }}
                  title={event.title}
                >
                  {isUserTask && taskChrome && (
                    <span style={{ marginRight: '6px', color: taskChrome.metaColor, flexShrink: 0 }}>
                      {event.type === 'vital' ? '★' : '●'}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {event.title}
                  </span>
                  {isUserTask && onTaskRemove && (
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onTaskRemove(taskId); }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      style={{
                        marginLeft: '8px',
                        padding: '0 6px',
                        border: '1px solid #E7E3DF',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        color: '#9ca3af',
                        lineHeight: '1.2',
                        flexShrink: 0,
                      }}
                      title="Remove from calendar"
                      aria-label="Remove from calendar"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        ref={setGridEl}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: '1px solid #E7E3DF',
          borderTop: 'none',
          background: 'transparent',
          position: 'relative',
          borderLeft: showLabels ? '1px solid #E7E3DF' : 'none',
        }}
      >
        {slots.map((time) => (
          <div key={time} style={{
            display: 'flex',
            minHeight: `${SLOT_HEIGHT}px`,
            borderBottom: '1px dashed #EFEDEB',
          }}>
            {showLabels && (
              <div style={{
                width: compact ? '40px' : '60px',
                padding: compact ? '4px 4px' : '4px 8px',
                fontSize: compact ? '10px' : '12px',
                color: '#9ca3af',
                textAlign: 'right',
                flexShrink: 0,
                borderRight: '1px solid #EFEDEB',
              }}>
                {formatTimeLabel(time)}
              </div>
            )}
          </div>
        ))}

        {isToday && currentHour >= startHour && currentHour <= endHour && (
          <div style={{
            position: 'absolute',
            top: `${(currentHour - startHour) * PX_PER_HOUR}px`,
            left: `${timeColWidth}px`,
            right: '0',
            height: '2px',
            background: '#E14747',
            zIndex: 15,
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute',
              left: '-4px',
              top: '-3px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#E14747',
            }} />
          </div>
        )}

        {dragOverHour !== null && (() => {
          const duration = sidebarDropDurationHoursRef?.current ?? 2;
          const top = (dragOverHour - startHour) * PX_PER_HOUR;
          const rawHeight = duration * PX_PER_HOUR - 4;
          const gridHeight = (endHour - startHour) * PX_PER_HOUR;
          const heightPx = Math.max(Math.min(rawHeight, gridHeight - top), 24);
          return (
            <>
              <div style={{
                position: 'absolute',
                top: `${top}px`,
                left: `${timeColWidth + TIMED_TRACK_LEFT_GUTTER_PX}px`,
                right: `${TIMED_TRACK_RIGHT_MARGIN_PX}px`,
                height: `${heightPx}px`,
                background: 'rgba(234, 102, 87, 0.2)',
                borderRadius: '6px',
                border: '1px dashed rgba(234, 102, 87, 0.5)',
                zIndex: 20,
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }} />
              <div style={{
                position: 'absolute',
                top: `${top - 10}px`,
                left: `${Math.max(2, timeColWidth - 48)}px`,
                fontSize: '10px',
                fontWeight: 500,
                color: '#EA6657',
                zIndex: 21,
                pointerEvents: 'none',
                background: 'rgba(255,255,255,0.92)',
                padding: '1px 4px',
                borderRadius: '4px',
              }}>
                {formatHourMinute(dragOverHour)}
              </div>
            </>
          );
        })()}

        <div
          style={{
            position: 'absolute',
            left: `${timeColWidth + TIMED_TRACK_LEFT_GUTTER_PX}px`,
            right: `${TIMED_TRACK_RIGHT_MARGIN_PX}px`,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
        {timedEvents.map((event) => {
          const extChrome = externalCalendarChrome(event);
          const taskChrome = isPlacedTaskEventType(event.type) ? getPlacedTaskCalendarChrome() : null;
          const taskId = event.id.replace('task-', '');
          return (
          <div
            key={event.id}
            style={getEventStyle(event)}
            onPointerDown={isPlacedTaskEventType(event.type)
              ? (ev) => attachPlacedTimedPointerSession(ev, event.id, event)
              : undefined}
            onContextMenu={isPlacedTaskEventType(event.type) ? (ev) => ev.preventDefault() : undefined}
            onClick={(event.type === 'meeting' || event.type === 'personal') ? () => setSelectedEvent(event) : undefined}
          >
            {isPlacedTaskEventType(event.type) ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      ...calendarEventTitleStyle,
                      ...(taskChrome ? { color: taskChrome.titleColor } : {}),
                    }}>{event.title}</div>
                  </div>
                  {onTaskRemove && (
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onTaskRemove(taskId); }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      style={{
                        padding: '0 6px',
                        border: '1px solid #E7E3DF',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        color: '#9ca3af',
                        lineHeight: '1.2',
                        flexShrink: 0,
                      }}
                      title="Remove from calendar"
                      aria-label="Remove from calendar"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onMouseDown={(ev) => handleResizeMouseDown(ev, event.id)}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '8px',
                    cursor: 'ns-resize',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <div style={{
                    width: '30px',
                    height: '3px',
                    borderRadius: '2px',
                    background: '#E7E3DF',
                  }} />
                </div>
              </>
            ) : (
              <>
                <div style={{
                  ...calendarEventTitleStyle,
                  ...(extChrome ? { color: extChrome.titleColor } : {}),
                }}>{event.title}</div>
                {event.busy === false && (
                  <div style={{
                    fontSize: '10px',
                    color: extChrome?.metaColor ?? '#9ca3af',
                  }}>available</div>
                )}
              </>
            )}
          </div>
          );
        })}
        </div>

        <div
          ref={timedOverflowRef}
          style={{
            position: 'absolute',
            left: `${timeColWidth + TIMED_TRACK_LEFT_GUTTER_PX}px`,
            right: `${TIMED_TRACK_RIGHT_MARGIN_PX}px`,
            top: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 45,
          }}
        >
          {timedOverflowBefore.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                pointerEvents: 'auto',
              }}
            >
              <button
                type="button"
                aria-expanded={openTimedOverflow === 'before'}
                onClick={() =>
                  setOpenTimedOverflow((v) => (v === 'before' ? null : 'before'))
                }
                style={{
                  padding: '3px 8px',
                  borderRadius: '8px',
                  border: '1px solid #E7E3DF',
                  background: 'rgba(255, 255, 255, 0.96)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  lineHeight: 1.3,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                {timedOverflowBefore.length} before {formatHourMinute(startHour)}
              </button>
              {openTimedOverflow === 'before' && (
                <div
                  role="listbox"
                  style={{
                    maxHeight: 'min(200px, 40vh)',
                    overflowY: 'auto',
                    border: '1px solid #E7E3DF',
                    borderRadius: '8px',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    minWidth: 'min(100%, 220px)',
                    maxWidth: '100%',
                  }}
                >
                  {timedOverflowBefore.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      role="option"
                      onClick={() => {
                        setOpenTimedOverflow(null);
                        if (ev.type === 'meeting' || ev.type === 'personal') {
                          setSelectedEvent(ev);
                        } else if (isPlacedTaskEventType(ev.type)) {
                          onPlacedTaskInList?.(ev.id.replace('task-', ''));
                        }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: 'none',
                        borderBottom: '1px solid #EFEDEB',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        color: '#1D212B',
                      }}
                    >
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                        {formatHourMinute(ev.startHour)} – {formatHourMinute(ev.startHour + ev.duration)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {timedOverflowAfter.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                pointerEvents: 'auto',
              }}
            >
              {openTimedOverflow === 'after' && (
                <div
                  role="listbox"
                  style={{
                    maxHeight: 'min(200px, 40vh)',
                    overflowY: 'auto',
                    border: '1px solid #E7E3DF',
                    borderRadius: '8px',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    minWidth: 'min(100%, 220px)',
                    maxWidth: '100%',
                    order: -1,
                  }}
                >
                  {timedOverflowAfter.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      role="option"
                      onClick={() => {
                        setOpenTimedOverflow(null);
                        if (ev.type === 'meeting' || ev.type === 'personal') {
                          setSelectedEvent(ev);
                        } else if (isPlacedTaskEventType(ev.type)) {
                          onPlacedTaskInList?.(ev.id.replace('task-', ''));
                        }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: 'none',
                        borderBottom: '1px solid #EFEDEB',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        color: '#1D212B',
                      }}
                    >
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                        {formatHourMinute(ev.startHour)} – {formatHourMinute(ev.startHour + ev.duration)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                aria-expanded={openTimedOverflow === 'after'}
                onClick={() =>
                  setOpenTimedOverflow((v) => (v === 'after' ? null : 'after'))
                }
                style={{
                  padding: '3px 8px',
                  borderRadius: '8px',
                  border: '1px solid #E7E3DF',
                  background: 'rgba(255, 255, 255, 0.96)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  lineHeight: 1.3,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                {timedOverflowAfter.length} after {formatHourMinute(endHour)}
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedEvent && (
        <DayCalendarEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

export { findFreeSlot } from './dayCalendarUtils';
