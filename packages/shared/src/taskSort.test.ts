import { describe, expect, it } from 'vitest';
import { ORDERED_CLASSIFICATIONS, sortTasksForList } from './taskSort.js';

describe('ORDERED_CLASSIFICATIONS', () => {
  it('includes unclassified for MCP parity', () => {
    expect(ORDERED_CLASSIFICATIONS.has('unclassified')).toBe(true);
  });
});

describe('sortTasksForList', () => {
  it('orders by sortOrder within same ordered classification', () => {
    const tasks = [
      { id: 'a', classification: 'pebble', sortOrder: 2, createdAt: '2026-01-01' },
      { id: 'b', classification: 'pebble', sortOrder: 0, createdAt: '2026-01-02' },
      { id: 'c', classification: 'pebble', sortOrder: 1, createdAt: '2026-01-03' },
    ];
    const sorted = sortTasksForList(tasks, (t) => new Date(t.createdAt).getTime());
    expect(sorted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to created time when classification differs or is not ordered', () => {
    const tasks = [
      { id: 'old', classification: 'boulder', sortOrder: 0, createdAt: '2026-01-01' },
      { id: 'new', classification: 'meeting', sortOrder: 0, createdAt: '2026-06-01' },
    ];
    const sorted = sortTasksForList(tasks, (t) => new Date(t.createdAt).getTime());
    expect(sorted.map((t) => t.id)).toEqual(['old', 'new']);
  });
});
