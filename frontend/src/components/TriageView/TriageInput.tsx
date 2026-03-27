import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface TriageInputProps {
  onSubmit: (title: string) => void;
}

export function TriageInput({ onSubmit }: TriageInputProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="+ Add a task..."
      style={{
        width: '100%',
        padding: '12px 16px',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        fontSize: '15px',
        background: '#fff',
        color: '#1f2937',
        outline: 'none',
        marginBottom: '20px',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s ease',
      }}
      onFocus={e => {
        e.currentTarget.style.borderColor = '#d1d5db';
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = '#e5e7eb';
      }}
    />
  );
}
