import { useMemo, useRef, useCallback, useState } from 'react';
import { calendarEventCardChrome, calendarEventTitleStyle } from '../shared/listCardStyles';

export interface CalEvent {
  id: string;
  title: string;
  startHour: number;  // e.g. 9.5 = 9:30am
  duration: number;    // in hours, e.g. 1.5
  type: 'meeting' | 'personal' | 'boulder' | 'rock' | 'pebble';
  allDay?: boolean;
  busy?: boolean;
  projectName?: string;
  color?: string;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
}

interface DayCalendarProps {
  date: string;
  dateKey: string; // ISO date string (YYYY-MM-DD) identifying this day
  events: CalEvent[];
  maxAllDayCount?: number;
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
const ALL_DAY_ROW_HEIGHT = 24; // px per all-day row (11px title + padding)

function snapToGrid(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

function isPlacedTaskEventType(type: CalEvent['type']): boolean {
  return type === 'boulder' || type === 'rock' || type === 'pebble';
}

export function DayCalendar({
  date, dateKey, events, maxAllDayCount = 0, startHour = 7, endHour = 22, compact = false,
  showLabels = true, isToday = false,
  onBoulderDrop, onBoulderMove, onBoulderResize, onBoulderRemove,
}: DayCalendarProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

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
    const rawHeight = displayDuration * PX_PER_HOUR - 4;
    const heightPx = Math.max(rawHeight, 24);
    const paddingY = heightPx >= 38 ? 10 : 4;

    return {
      position: 'absolute',
      top: `${top}px`,
      left: `${timeColWidth + 8}px`,
      right: '4px',
      height: `${heightPx}px`,
      ...calendarEventCardChrome,
      padding: `${paddingY}px 12px`,
      overflow: 'hidden',
      zIndex: interacting?.eventId === event.id ? 10 : 1,
      userSelect: 'none',
      cursor: isPlacedTaskEventType(event.type) ? 'grab' : 'pointer',
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

  const { allDayEvents, timedEvents } = useMemo(() => {
    return {
      allDayEvents: events.filter(e => e.allDay),
      timedEvents: events.filter(e => !e.allDay),
    };
  }, [events]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: compact ? '12px' : '16px',
        fontWeight: 600,
        color: '#1D212B',
        padding: compact ? '8px 10px' : '12px 16px',
        border: '1px solid #E7E3DF',
        borderRadius: '8px 8px 0 0',
        background: '#fff',
      }}>
        {date}
      </div>

      {maxAllDayCount > 0 && (
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('boulder-id')) {
              e.dataTransfer.dropEffect = 'none';
            }
          }}
          onDrop={(e) => {
            if (e.dataTransfer.types.includes('boulder-id')) {
              e.preventDefault();
            }
          }}
          style={{
          padding: '4px 4px',
          border: '1px solid #E7E3DF',
          borderTop: 'none',
          background: '#f9fafa',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minHeight: `${maxAllDayCount * (ALL_DAY_ROW_HEIGHT + 4) + 8}px`,
        }}
        >
          {allDayEvents.map(event => {
            const isUserTask = isPlacedTaskEventType(event.type);

            return (
              <div key={event.id} style={{ display: 'flex' }}>
                <div style={{ width: `${timeColWidth + 8}px`, flexShrink: 0 }} />
                <div
                  draggable={isUserTask}
                  onDragStart={isUserTask ? (e) => handlePlacedBoulderDragStart(e, event.id) : undefined}
                  onClick={() => setSelectedEvent(event)}
                  style={{
                    flex: 1,
                    minHeight: `${ALL_DAY_ROW_HEIGHT}px`,
                    ...calendarEventTitleStyle,
                    padding: '4px 12px',
                    ...calendarEventCardChrome,
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '4px',
                    marginBottom: '4px',
                    cursor: isUserTask ? 'grab' : 'pointer',
                    userSelect: 'none',
                  }}
                  title={event.title}
                >
                  {isUserTask && (
                    <span style={{ marginRight: '6px', color: '#9ca3af' }}>
                      {event.type === 'rock' ? '●' : event.type === 'pebble' ? '◇' : '■'}
                    </span>
                  )}
                  {event.title}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        ref={gridRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: '1px solid #E7E3DF',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
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
        {timedEvents.map((event) => (
          <div
            key={event.id}
            style={getEventStyle(event)}
            onMouseDown={isPlacedTaskEventType(event.type) ? (e) => handleMouseDown(e, event.id, 'move') : undefined}
            onClick={(event.type === 'meeting' || event.type === 'personal') ? () => setSelectedEvent(event) : undefined}
          >
            {isPlacedTaskEventType(event.type) ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={calendarEventTitleStyle}>{event.title}</div>
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
                        color: '#9ca3af',
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
                    background: '#E7E3DF',
                  }} />
                </div>
              </>
            ) : (
              <>
                <div style={calendarEventTitleStyle}>{event.title}</div>
                {event.busy === false && (
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>available</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div 
          onClick={() => setSelectedEvent(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1D212B' }}>{selectedEvent.title}</h3>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#4b5563' }}>
                  <span style={{ fontSize: '18px' }}>🕒</span>
                  <div style={{ fontSize: '14px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {selectedEvent.allDay ? 'All Day' : `${formatHourMinute(selectedEvent.startHour)} – ${formatHourMinute(selectedEvent.startHour + selectedEvent.duration)}`}
                    </div>
                    {selectedEvent.rrule && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        🔄 {selectedEvent.rrule}
                      </div>
                    )}
                  </div>
                </div>

                {selectedEvent.location && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', color: '#4b5563' }}>
                    <span style={{ fontSize: '18px' }}>📍</span>
                    <div style={{ fontSize: '14px', wordBreak: 'break-word' }}>{selectedEvent.location}</div>
                  </div>
                )}

                {selectedEvent.description && (
                  <div style={{ borderTop: '1px solid #EFEDEB', paddingTop: '16px', marginTop: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
                      Description
                    </div>
                    <div 
                      style={{ 
                        fontSize: '14px', 
                        color: '#1D212B', 
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                      dangerouslySetInnerHTML={{ __html: selectedEvent.description }}
                    />
                  </div>
                )}

                {/* Debug Info Section */}
                <div style={{ borderTop: '1px solid #EFEDEB', paddingTop: '16px', marginTop: '4px' }}>
                  <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
                    Debug Info
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#6b7280', 
                    fontFamily: 'var(--font-mono)',
                    background: '#F9F7F6', 
                    padding: '8px', 
                    borderRadius: '8px',
                    display: 'grid',
                    gap: '4px'
                  }}>
                    <div><span style={{ fontWeight: 600 }}>UID:</span> {selectedEvent.uid || 'N/A'}</div>
                    <div><span style={{ fontWeight: 600 }}>DTSTART:</span> {selectedEvent.rawStart || 'N/A'}</div>
                    <div><span style={{ fontWeight: 600 }}>DTEND:</span> {selectedEvent.rawEnd || 'N/A'}</div>
                    <div><span style={{ fontWeight: 600 }}>RRULE:</span> {selectedEvent.rrule || 'N/A'}</div>
                    <div><span style={{ fontWeight: 600 }}>ID:</span> {selectedEvent.id}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ padding: '16px 24px', background: '#F9F7F6', borderRadius: '0 0 8px 8px', borderTop: '1px solid #EFEDEB', textAlign: 'right' }}>
              <button 
                onClick={() => setSelectedEvent(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '10px',
                  border: '1px solid #E7E3DF',
                  background: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#1D212B',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Find the first free slot of given duration in hours.
 */
export function findFreeSlot(events: CalEvent[], durationHours: number = 2, startHour: number = 8, endHour: number = 22): number {
  const busyEvents = events.filter(e => e.busy !== false && !isPlacedTaskEventType(e.type));
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
