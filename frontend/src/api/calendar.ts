import type { CalendarFeed, CalendarFeedInput, CalendarResponse } from '../types';
import { auth } from '../firebase';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function getAuthHeaders(contentType?: string): Promise<Record<string, string>> {
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

/** Returns null when API is not configured, empty array when configured but no events */
export async function fetchTodayEvents(): Promise<CalendarResponse | null> {
  const today = new Date().toISOString().split('T')[0];
  return fetchEventsForRange(today, 1);
}

/** Fetch calendar events for a specific date range. */
export async function fetchEventsForRange(startDate: string, days: number): Promise<CalendarResponse | null> {
  if (!API_BASE) return null;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const url = `${API_BASE}/calendar/events?start=${encodeURIComponent(startDate)}&days=${days}&tz=${encodeURIComponent(tz)}`;
  
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error('Failed to fetch calendar events');
  const data = await res.json();
  return {
    events: data.events || [],
    syncWarnings: data.syncWarnings || [],
  };
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
