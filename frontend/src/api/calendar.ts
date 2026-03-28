import type { CalendarEvent, CalendarFeed } from '../types';
import { auth } from '../firebase';

// Cloud Functions base URL — update after deploying
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
export async function fetchTodayEvents(): Promise<CalendarEvent[] | null> {
  return fetchEventsForDate();
}

/** Fetch calendar events for a specific date (YYYY-MM-DD). Omit date for today. */
export async function fetchEventsForDate(date?: string): Promise<CalendarEvent[] | null> {
  if (!API_BASE) {
    return null;
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let url = `${API_BASE}/calendar/today?tz=${encodeURIComponent(tz)}`;
  if (date) {
    url += `&date=${encodeURIComponent(date)}`;
  }
  const res = await fetch(url, {
    headers: await getAuthHeaders(),
  });
  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) throw new Error('Failed to fetch calendar events');
  const data = await res.json();
  return data.events || [];
}

export async function getCalendarFeeds(): Promise<Array<{ name: string; color: string; hasUrl: boolean }>> {
  if (!API_BASE) return [];

  const res = await fetch(`${API_BASE}/calendar/feeds`, {
    headers: await getAuthHeaders(),
  });
  if (res.status === 401 || res.status === 403) {
    return [];
  }
  if (!res.ok) throw new Error('Failed to fetch feeds');
  const data = await res.json();
  return data.feeds || [];
}

export async function updateCalendarFeeds(feeds: CalendarFeed[]): Promise<void> {
  if (!API_BASE) throw new Error('API not configured');

  const res = await fetch(`${API_BASE}/calendar/feeds`, {
    method: 'PUT',
    headers: await getAuthHeaders('application/json'),
    body: JSON.stringify({ feeds }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Admin access required');
  }
  if (!res.ok) throw new Error('Failed to update feeds');
}
