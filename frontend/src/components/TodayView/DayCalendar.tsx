import { useMemo, useRef, useCallback, useState } from 'react';

export interface CalEvent {
  id: string;
  title: string;
  startHour: number;  // e.g. 9.5 = 9:30am
  duration: number;    // in hours, e.g. 1.5
  type: 'meeting' | 'personal' | 'boulder';
  busy?: boolean;
  projectName?: string;
}

interface DayCalendarProps {
  date: string;
  dateKey: string; // ISO date string (YYYY-MM-DD) identifying this day
  events: CalEvent[];
  startHour?: number;
  endHour?: number;
  compact?: boolean; // narrower layout for multi-day view
  onBoulderDrop?: (boulderId: string, startHour: number, dateKey: string) => void;
  onBoulderMove?: (boulderId: string, startHour: number) => void;
  onBoulderResize?: (boulderId: string, duration: number) => void;
  onBoulderRemove?: (boulderId: string) => void;
}

const SLOT_HEIGHT = 44; // px per half hour
const SNAP = 0.25; // 15 minutes
const PX_PER_HOUR = SLOT_HEIGHT * 2; // 88px per hour

function snapToGrid(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

export function DayCalendar({
  date, dateKey, events, startHour = 7, endHour = 22, compact = false,
  onBoulderDrop, onBoulderMove, onBoulderResize, onBoulderRemove,
}: DayCalendarProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [interacting, setInteracting] = useState<{
    type: 'move' | 'resize';
    eventId: string;
    startY: number;
    originalStartHour: number;
    originalDuration: number;
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

    setInteracting({
      type: action,
      eventId,
      startY: e.clientY,
      originalStartHour: event.startHour,
      originalDuration: event.duration,
    });

    const handleMouseMove = (me: MouseEvent) => {
      const deltaY = me.clientY - e.clientY;
      const deltaHours = deltaY / PX_PER_HOUR;

      if (action === 'move') {
        const newStart = snapToGrid(event.startHour + deltaHours);
        const clamped = Math.max(startHour, Math.min(newStart, endHour - event.duration));
        onBoulderMove?.(eventId.replace('boulder-', ''), clamped);
      } else {
        const newDuration = snapToGrid(event.duration + deltaHours);
        const clamped = Math.max(SNAP, Math.min(newDuration, endHour - event.startHour));
        onBoulderResize?.(eventId.replace('boulder-', ''), clamped);
      }
    };

    const handleMouseUp = () => {
      setInteracting(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [events, startHour, endHour, onBoulderMove, onBoulderResize]);

  const timeColWidth = compact ? 40 : 60;

  const getEventStyle = (event: CalEvent): React.CSSProperties => {
    const top = (event.startHour - startHour) * PX_PER_HOUR;
    const height = event.duration * PX_PER_HOUR - 4;

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: `${top}px`,
      left: `${timeColWidth + 8}px`,
      right: '4px',
      height: `${Math.max(height, 24)}px`,
      borderRadius: '12px',
      padding: '4px 8px',
      fontSize: compact ? '11px' : '13px',
      overflow: 'hidden',
      zIndex: interacting?.eventId === event.id ? 10 : 1,
      boxSizing: 'border-box',
      userSelect: 'none',
    };

    if (event.type === 'boulder') {
      return {
        ...baseStyle,
        border: '2px dashed #FF7A7A',
        background: '#fff5f5',
        borderLeft: '4px solid #FF7A7A',
        padding: '8px',
        cursor: 'grab',
      };
    }

    if (event.type === 'meeting') {
      return {
        ...baseStyle,
        background: event.busy !== false ? '#dbeafe' : 'rgba(219, 234, 254, 0.4)',
        borderLeft: '4px solid #60a5fa',
        color: '#4b5563',
      };
    }

    return {
      ...baseStyle,
      background: event.busy !== false ? '#dcfce7' : 'rgba(220, 252, 231, 0.4)',
      borderLeft: '4px solid #86efac',
      color: '#4b5563',
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
        fontSize: compact ? '13px' : '16px',
        fontWeight: 700,
        color: '#1f2937',
        padding: compact ? '8px 10px' : '12px 16px',
        border: '1px solid #e5e7eb',
        borderRadius: '16px 16px 0 0',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {date}
      </div>
      <div
        ref={gridRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          borderRadius: '0 0 16px 16px',
          background: '#fff',
          position: 'relative',
        }}
      >
        {/* Time grid */}
        {slots.map((time) => (
          <div key={time} style={{
            display: 'flex',
            minHeight: `${SLOT_HEIGHT}px`,
            borderBottom: '1px dashed #f3f4f6',
          }}>
            <div style={{
              width: compact ? '40px' : '60px',
              padding: compact ? '4px 4px' : '4px 8px',
              fontSize: compact ? '10px' : '12px',
              color: '#9ca3af',
              textAlign: 'right',
              flexShrink: 0,
              borderRight: '1px solid #f3f4f6',
            }}>
              {formatTime(time)}
            </div>
          </div>
        ))}

        {/* Drop indicator line */}
        {dragOverHour !== null && (
          <>
            <div style={{
              position: 'absolute',
              top: `${(dragOverHour - startHour) * PX_PER_HOUR}px`,
              left: `${timeColWidth}px`,
              right: '0',
              height: '2px',
              background: '#FF7A7A',
              zIndex: 20,
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute',
              top: `${(dragOverHour - startHour) * PX_PER_HOUR - 10}px`,
              left: '2px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#FF7A7A',
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
            onMouseDown={event.type === 'boulder' ? (e) => handleMouseDown(e, event.id, 'move') : undefined}
          >
            {event.type === 'boulder' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#FF6B6B', fontWeight: 700 }}>
                      🪨 {formatHourMinute(event.startHour)}–{formatHourMinute(event.startHour + event.duration)}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1f2937' }}>{event.title}</div>
                    {event.projectName && (
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{event.projectName}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <div
                      draggable
                      onDragStart={(e) => handlePlacedBoulderDragStart(e, event.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: 'grab',
                        fontSize: '12px',
                        color: '#FF6B6B',
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
                        border: '1px solid #e5e7eb',
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
                    background: '#FFB3B3',
                  }} />
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: event.busy !== false ? 500 : 400, color: '#4b5563' }}>{event.title}</div>
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
export function findFreeSlot(events: CalEvent[], durationHours: number = 2, startHour: number = 7, endHour: number = 22): number {
  const busyEvents = events.filter(e => e.busy !== false && e.type !== 'boulder');
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
