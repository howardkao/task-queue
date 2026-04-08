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

/** Checkmark complete control on list task cards (Today sidebar, etc.). */
export const listCardCompleteButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  background: 'transparent',
  color: '#9ca3af',
  fontSize: '12px',
  cursor: 'pointer',
  lineHeight: 1,
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
