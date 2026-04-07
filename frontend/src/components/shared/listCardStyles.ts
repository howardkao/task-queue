import type { CSSProperties } from 'react';

/** Task list card chrome (Boulder / Today sidebars). */
export const listCardStyle: CSSProperties = {
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  marginBottom: '6px',
  background: '#fff',
  overflow: 'hidden',
  transition: 'all 0.15s',
};

export const listPlacedCardStyle: CSSProperties = {
  border: '1px solid #E7E3DF',
  background: '#F9F7F6',
  opacity: 0.7,
};

export const listCardInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
};

export const listCardTitleStyle: CSSProperties = {
  fontSize: '13px',
  color: '#1D212B',
  fontWeight: 500,
};

/** Titles on the day grid (tasks + external events), smaller than list cards. */
export const calendarEventTitleStyle: CSSProperties = {
  ...listCardTitleStyle,
  fontSize: '11px',
};

/** Shared surface for calendar blocks (timed + all-day): border, radius, background. */
export const calendarEventCardChrome: CSSProperties = {
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: 'rgb(255 255 255 / 0.82)',
  backdropFilter: 'blur(1px)',
  WebkitBackdropFilter: 'blur(1px)',
  boxSizing: 'border-box',
};
