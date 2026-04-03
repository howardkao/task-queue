import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateNextOccurrence } from './recurrence.js';

describe('calculateNextOccurrence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when recurrence is missing', () => {
    expect(calculateNextOccurrence(null, null)).toBeNull();
    expect(calculateNextOccurrence(undefined, '2026-01-01')).toBeNull();
  });

  it('advances daily from current deadline', () => {
    const next = calculateNextOccurrence({ freq: 'daily', interval: 1 }, '2026-04-01T00:00:00.000Z');
    expect(next).toBe(new Date('2026-04-02T00:00:00.000Z').toISOString());
  });

  it('advances monthly from deadline', () => {
    const next = calculateNextOccurrence({ freq: 'monthly', interval: 1 }, '2026-01-15T00:00:00.000Z');
    expect(next).toBe(new Date('2026-02-15T00:00:00.000Z').toISOString());
  });

  it('adds hours for periodic hourly recurrence', () => {
    const next = calculateNextOccurrence(
      { freq: 'periodically', interval: 3, periodUnit: 'hours' },
      null,
    );
    expect(next).toBe(new Date('2026-04-02T15:00:00.000Z').toISOString());
  });
});
