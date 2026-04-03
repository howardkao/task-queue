import type { CalEvent } from './dayCalendarTypes';
import { formatHourMinute } from './dayCalendarUtils';

interface DayCalendarEventModalProps {
  event: CalEvent;
  onClose: () => void;
}

export function DayCalendarEventModal({ event, onClose }: DayCalendarEventModalProps) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        cursor: 'pointer',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          cursor: 'default',
        }}
      >
        <div style={{ padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1D212B' }}>{event.title}</h3>
            <button
              type="button"
              onClick={onClose}
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
                  {event.allDay
                    ? 'All Day'
                    : `${formatHourMinute(event.startHour)} – ${formatHourMinute(event.startHour + event.duration)}`}
                </div>
                {event.rrule && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>🔄 {event.rrule}</div>
                )}
              </div>
            </div>

            {event.location && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', color: '#4b5563' }}>
                <span style={{ fontSize: '18px' }}>📍</span>
                <div style={{ fontSize: '14px', wordBreak: 'break-word' }}>{event.location}</div>
              </div>
            )}

            {event.description && (
              <div style={{ borderTop: '1px solid #EFEDEB', paddingTop: '16px', marginTop: '4px' }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                    fontWeight: 600,
                  }}
                >
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
                  dangerouslySetInnerHTML={{ __html: event.description }}
                />
              </div>
            )}

            <div style={{ borderTop: '1px solid #EFEDEB', paddingTop: '16px', marginTop: '4px' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px',
                  fontWeight: 600,
                }}
              >
                Debug Info
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  fontFamily: 'var(--font-mono)',
                  background: '#F9F7F6',
                  padding: '8px',
                  borderRadius: '8px',
                  display: 'grid',
                  gap: '4px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>UID:</span> {event.uid || 'N/A'}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>DTSTART:</span> {event.rawStart || 'N/A'}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>DTEND:</span> {event.rawEnd || 'N/A'}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>RRULE:</span> {event.rrule || 'N/A'}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>ID:</span> {event.id}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '16px 24px',
            background: '#F9F7F6',
            borderRadius: '0 0 8px 8px',
            borderTop: '1px solid #EFEDEB',
            textAlign: 'right',
          }}
        >
          <button
            type="button"
            onClick={onClose}
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
  );
}
