import type { CalendarFeed, CalendarFeedInput } from '../types';
import { auth } from '../firebase';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function getAuthHeaders(contentType?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }

  headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

export interface CalendarSyncFeedResult {
  id: string;
  status: 'unchanged' | 'updated' | 'error';
  ical?: string;
  message?: string;
}

export async function fetchCalendarSync(bust: boolean): Promise<{ feeds: CalendarSyncFeedResult[] }> {
  if (!API_BASE) throw new Error('API not configured');

  const res = await fetch(`${API_BASE}/calendar/sync?bust=${bust}`, {
    headers: await getAuthHeaders(),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Calendar sync failed');
  return res.json();
}

// ── Feed CRUD ────────────────────────────────────────────────────────────────

export async function getCalendarFeeds(): Promise<CalendarFeed[]> {
  if (!API_BASE) return [];

  const res = await fetch(`${API_BASE}/calendar/feeds`, {
    headers: await getAuthHeaders(),
  });
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error('Failed to fetch feeds');
  const data = await res.json();
  return data.feeds || [];
}

export async function createCalendarFeed(input: CalendarFeedInput): Promise<CalendarFeed> {
  if (!API_BASE) throw new Error('API not configured');

  const res = await fetch(`${API_BASE}/calendar/feeds`, {
    method: 'POST',
    headers: await getAuthHeaders('application/json'),
    body: JSON.stringify(input),
  });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create feed');
  }
  const data = await res.json();
  return data.feed;
}

export async function updateCalendarFeed(
  id: string,
  updates: Partial<CalendarFeedInput & { enabled: boolean }>,
): Promise<CalendarFeed> {
  if (!API_BASE) throw new Error('API not configured');

  const res = await fetch(`${API_BASE}/calendar/feeds/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: await getAuthHeaders('application/json'),
    body: JSON.stringify(updates),
  });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update feed');
  }
  const data = await res.json();
  return data.feed;
}

export async function deleteCalendarFeed(id: string): Promise<void> {
  if (!API_BASE) throw new Error('API not configured');

  const res = await fetch(`${API_BASE}/calendar/feeds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete feed');
  }
}
