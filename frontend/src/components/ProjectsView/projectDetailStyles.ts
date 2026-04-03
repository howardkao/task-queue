import type { CSSProperties } from 'react';
import type { Task } from '../../types';

export const btnSmStyle: CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #E7E3DF',
  borderRadius: '12px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'opacity 0.2s ease',
};

export const projectNameInputStyle: CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  lineHeight: 1.2,
  color: '#1D212B',
  border: '1px solid transparent',
  borderRadius: '10px',
  background: 'transparent',
  padding: '4px 8px',
  marginLeft: '-8px',
  fontFamily: 'inherit',
  outline: 'none',
  minWidth: '280px',
};

export const sectionHeaderStyle: CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '8px',
  fontWeight: 500,
};

export const emptyTaskStyle: CSSProperties = {
  padding: '8px 4px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '13px',
};

export const taskDragHandleStyle: CSSProperties = {
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};

export const taskRowCardStyle: CSSProperties = {
  border: '2px dashed #E7E3DF',
  borderRadius: '8px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
};

export const completedTaskStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderBottom: '1px solid #EFEDEB',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  marginBottom: '6px',
};

export const editorStyle: CSSProperties = {
  width: '100%',
  minHeight: '400px',
  padding: '16px 20px',
  border: '2px solid #E7E3DF',
  borderRadius: '16px',
  background: '#fff',
  fontFamily: 'var(--font-mono)',
  fontSize: '14px',
  lineHeight: '1.7',
  color: '#1D212B',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

export function getTaskTypeStyles(classification: Task['classification']) {
  if (classification === 'boulder') {
    return { border: '#EA6657', bg: '#fff', handle: '#EA6657' };
  }
  if (classification === 'rock') {
    return { border: '#d7b27a', bg: '#fff', handle: '#d7b27a' };
  }
  return { border: '#E7E3DF', bg: '#fff', handle: '#d1d5db' };
}
