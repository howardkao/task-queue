import { useMemo, useRef, useCallback, useState } from 'react';

export interface CalEvent {
  id: string;
  title: string;
  startHour: number;  // e.g. 9.5 = 9:30am
  duration: number;    // in hours, e.g. 1.5
  type: 'meeting' | 'personal' | 'boulder' | 'rock';
  busy?: boolean;
  projectName?: string;
  color?: string;
}

interface DayCalendarProps {
  date: string;
  dateKey: string; // ISO date string (YYYY-MM-DD) identifying this day
  events: CalEvent[];
  startHour?: number;
  endHour?: number;
  compact?: boolean; // narrower layout for multi-day view
  showLabels?: boolean; // show hour labels on the left
  isToday?: boolean; // show current time indicator
  onBoulderDrop?: (boulderId: string, startHour: number, dateKey: string) => void;
  onBoulderMove?: (boulderId: string, startHour: number) => void;
  onBoulderResize?: (boulderId: string, duration: number) => void;
  onBoulderRemove?: (boulderId: string) => void;
}

const SLOT_HEIGHT = 33; // px per half hour
const SNAP = 0.25; // 15 minutes
const PX_PER_HOUR = SLOT_HEIGHT * 2; // 66px per hour

function snapToGrid(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

export function DayCalendar({
  date, dateKey, events, startHour = 7, endHour = 22, compact = false,
  showLabels = true, isToday = false,
  onBoulderDrop, onBoulderMove, onBoulderResize, onBoulderRemove,
}: DayCalendarProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());

  // Update current time every minute if it's today
  useMemo(() => {
    if (!isToday) return;
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [isToday]);

  const currentHour = useMemo(() => {
    return now.getHours() + now.getMinutes() / 60;
  }, [now]);

  const [interacting, setInteracting] = useState<{
    type: 'move' | 'resize';
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

  const formatTime = (h: number) => {
    const hour = Math.floor(h);
    const isHalf = h % 1 !== 0;
    if (isHalf) return '';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${displayHour}:00${ampm}`;
  };

  // Convert a pixel Y offset within the grid to an hour value
  const yToHour = useCallback((clientY: number): number => {
    if (!gridRef.current) return startHour;
    const rect = gridRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const hour = startHour + y / PX_PER_HOUR;
    return snapToGrid(Math.max(startHour, Math.min(hour, endHour)));
  }, [startHour, endHour]);

  // HTML5 drag: boulder dropped from sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('boulder-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverHour(yToHour(e.clientY));
  }, [yToHour]);

  const handleDragLeave = useCallback(() => {
    setDragOverHour(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverHour(null);
    const boulderId = e.dataTransfer.getData('boulder-id');
    if (!boulderId || !onBoulderDrop) return;
    const hour = yToHour(e.clientY);
    onBoulderDrop(boulderId, hour, dateKey);
  }, [yToHour, onBoulderDrop, dateKey]);

  const handlePlacedBoulderDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    const boulderId = eventId.replace('boulder-', '');
    e.dataTransfer.setData('boulder-id', boulderId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Mouse-based: move or resize a placed boulder
  const handleMouseDown = useCallback((e: React.MouseEvent, eventId: string, action: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const event = events.find(ev => ev.id === eventId);
    if (!event) return;

    // Track state in a ref to be accessible in handleMouseUp without closure staleness
    const stateRef = {
      currentStartHour: event.startHour,
      currentDuration: event.duration
    };

    setInteracting({
      type: action,
      eventId,
      startY: e.clientY,
      currentStartHour: event.startHour,
      currentDuration: event.duration,
    });

    const handleMouseMove = (me: MouseEvent) => {
      const deltaY = me.clientY - e.clientY;
      const deltaHours = deltaY / PX_PER_HOUR;

      if (action === 'move') {
        const newStart = snapToGrid(event.startHour + deltaHours);
        const clamped = Math.max(startHour, Math.min(newStart, endHour - event.duration));
        stateRef.currentStartHour = clamped;
        setInteracting(prev => prev ? { ...prev, currentStartHour: clamped } : null);
      } else {
        const newDuration = snapToGrid(event.duration + deltaHours);
        const clamped = Math.max(SNAP, Math.min(newDuration, endHour - event.startHour));
        stateRef.currentDuration = clamped;
        setInteracting(prev => prev ? { ...prev, currentDuration: clamped } : null);
      }
    };

    const handleMouseUp = () => {
      if (action === 'move') {
        onBoulderMove?.(eventId.replace('boulder-', ''), stateRef.currentStartHour);
      } else {
        onBoulderResize?.(eventId.replace('boulder-', ''), stateRef.currentDuration);
      }
      setInteracting(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [events, startHour, endHour, onBoulderMove, onBoulderResize]);

  const timeColWidth = showLabels ? (compact ? 40 : 60) : 0;

  const getEventStyle = (event: CalEvent): React.CSSProperties => {
    const isInteracting = interacting?.eventId === event.id;
    const displayStartHour = isInteracting ? interacting.currentStartHour : event.startHour;
    const displayDuration = isInteracting ? interacting.currentDuration : event.duration;

    const top = (displayStartHour - startHour) * PX_PER_HOUR;
    const height = displayDuration * PX_PER_HOUR - 4;

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: `${top}px`,
      left: `${timeColWidth + 8}px`,
      right: '4px',
      height: `${Math.max(height, 24)}px`,
      borderRadius: '12px',
      padding: '4px 8px',
      fontSize: compact ? '10px' : '13px',
      overflow: 'hidden',
      zIndex: interacting?.eventId === event.id ? 10 : 1,
      boxSizing: 'border-box',
      userSelect: 'none',
    };

    if (event.type === 'boulder' || event.type === 'rock') {
      return {
        ...baseStyle,
        border: event.type === 'rock' ? '2px dashed #c08457' : '2px dashed #EA6657',
        background: event.type === 'rock' ? '#fff7ed' : '#FCEDED',
        borderLeft: event.type === 'rock' ? '4px solid #c08457' : '4px solid #EA6657',
        padding: '8px',
        cursor: 'grab',
      };
    }

    if (event.type === 'meeting') {
      const bgColor = event.color || '#60a5fa';
      return {
        ...baseStyle,
        background: event.busy !== false ? `${bgColor}33` : `${bgColor}11`, // 20% or 6.6% opacity
        borderLeft: `4px solid ${bgColor}`,
        color: '#4b5563',
      };
    }

    const bgColor = event.color || '#86efac';
    return {
      ...baseStyle,
      background: event.busy !== false ? `${bgColor}33` : `${bgColor}11`,
      borderLeft: `4px solid ${bgColor}`,
      color: '#1D212B',
    };
  };

  // Format hour for tooltip / drop indicator
  const formatHourMinute = (h: number): string => {
    const hour = Math.floor(h);
    const min = Math.round((h - hour) * 60);
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${displayHour}:${min.toString().padStart(2, '0')}${ampm}`;
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: compact ? '12px' : '16px',
        fontWeight: 600,
        color: '#1D212B',
        padding: compact ? '8px 10px' : '12px 16px',
        border: '1px solid #E7E3DF',
        borderRadius: '12px 12px 0 0',
        background: '#fff',
      }}>
        {date}
      </div>
      <div
        ref={gridRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: '1px solid #E7E3DF',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          background: '#fff',
          position: 'relative',
          borderLeft: showLabels ? '1px solid #E7E3DF' : 'none',
        }}
      >
        {/* Time grid */}
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
                {formatTime(time)}
              </div>
            )}
          </div>
        ))}

        {/* Current time indicator */}
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

        {/* Drop indicator line */}
        {dragOverHour !== null && (
          <>
            <div style={{
              position: 'absolute',
              top: `${(dragOverHour - startHour) * PX_PER_HOUR}px`,
              left: `${timeColWidth}px`,
              right: '0',
              height: '2px',
              background: '#EA6657',
              zIndex: 20,
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute',
              top: `${(dragOverHour - startHour) * PX_PER_HOUR - 10}px`,
              left: '2px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#EA6657',
              zIndex: 20,
              pointerEvents: 'none',
              background: '#fff',
              padding: '1px 4px',
              borderRadius: '4px',
            }}>
              {formatHourMinute(dragOverHour)}
            </div>
          </>
        )}

        {/* Events overlaid */}
        {events.map((event) => (
          <div
            key={event.id}
            style={getEventStyle(event)}
            onMouseDown={(event.type === 'boulder' || event.type === 'rock') ? (e) => handleMouseDown(e, event.id, 'move') : undefined}
          >
            {(event.type === 'boulder' || event.type === 'rock') ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px', color: '#1D212B' }}>{event.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <div
                      draggable
                      onDragStart={(e) => handlePlacedBoulderDragStart(e, event.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid #E7E3DF',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'grab',
                        fontSize: '12px',
                        color: event.type === 'rock' ? '#c08457' : '#EA6657',
                        lineHeight: '1',
                        flexShrink: 0,
                      }}
                      title="Drag to another day or time"
                    >
                      ⠿
                    </div>
                  {onBoulderRemove && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onBoulderRemove(event.id.replace('boulder-', '')); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid #E7E3DF',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: 'inherit',
                        color: '#9ca3af',
                        lineHeight: '1',
                        flexShrink: 0,
                      }}
                      title="Remove from calendar"
                    >
                      →
                    </button>
                  )}
                  </div>
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => handleMouseDown(e, event.id, 'resize')}
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
                    background: event.type === 'rock' ? '#d6a46c' : '#EA6657',
                  }} />
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: event.busy !== false ? 500 : 400, color: '#1D212B' }}>{event.title}</div>
                {event.busy === false && (
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>available</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * Find the first free slot of given duration in hours.
 */
export function findFreeSlot(events: CalEvent[], durationHours: number = 2, startHour: number = 8, endHour: number = 22): number {
  const busyEvents = events.filter(e => e.busy !== false && e.type !== 'boulder' && e.type !== 'rock');
  const busy = new Set<number>();
  for (const ev of busyEvents) {
    for (let t = ev.startHour; t < ev.startHour + ev.duration; t += 0.25) {
      busy.add(Math.round(t * 4) / 4);
    }
  }

  const slotsNeeded = durationHours * 4;
  for (let t = startHour; t <= endHour - durationHours; t += 0.25) {
    let free = true;
    for (let i = 0; i < slotsNeeded; i++) {
      if (busy.has(Math.round((t + i * 0.25) * 4) / 4)) { free = false; break; }
    }
    if (free) return t;
  }

  return 13;
}
