import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getCalendarFeeds,
  createCalendarFeed,
  updateCalendarFeed,
  deleteCalendarFeed,
} from '../api/calendar';
import {
  deleteCalendarMirrorForFeed,
  patchMirrorEventsForFeedMetadata,
  runCalendarSync,
  subscribeCalendarMirror,
} from '../api/calendarMirror';
import type { CalendarFeedInput, CalendarResponse } from '../types';
import { useAuth } from './useAuth';
import { auth } from '../firebase';

const apiBase = import.meta.env.VITE_API_BASE || '';

/** Limits Firestore writes/deletes from calendar mirror: each sync can delete+rewrite hundreds of docs per feed. */
const lastCalendarAutoSyncByUid = new Map<string, number>();
const CALENDAR_AUTO_SYNC_MIN_INTERVAL_MS = 4 * 60 * 1000;

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useTodayEvents() {
  const today = useMemo(() => localYmd(new Date()), []);
  return useEventsForRange(today, 1, false);
}

export function useEventsForRange(startDate: string, days: number, bust = false) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const queryKey = ['calendar', 'range', user?.uid ?? '', startDate, days] as const;

  const query = useQuery<CalendarResponse>({
    queryKey,
    queryFn: async () => ({ events: [], syncWarnings: [] }),
    enabled: !!user && !!apiBase,
    staleTime: Infinity,
    placeholderData: user && apiBase ? { events: [], syncWarnings: [] } : undefined,
  });

  useEffect(() => {
    if (!user || !apiBase) return;
    return subscribeCalendarMirror(user.uid, startDate, days, (data) => {
      qc.setQueryData(queryKey, data);
    });
  }, [user?.uid, apiBase, startDate, days, qc]);

  useEffect(() => {
    if (!user || !apiBase) return;
    const uid = user.uid;
    const now = Date.now();
    if (!bust) {
      const last = lastCalendarAutoSyncByUid.get(uid) ?? 0;
      if (now - last < CALENDAR_AUTO_SYNC_MIN_INTERVAL_MS) return;
    }
    void runCalendarSync(uid, bust)
      .then(() => {
        lastCalendarAutoSyncByUid.set(uid, Date.now());
      })
      .catch(console.error);
  }, [user?.uid, apiBase, bust]);

  const data: CalendarResponse | null | undefined = !apiBase ? null : query.data;
  const isConfigured = !!apiBase;

  return { ...query, data, isConfigured };
}

// ── Feed management hooks ────────────────────────────────────────────────────

export function useCalendarFeeds() {
  return useQuery({
    queryKey: ['calendar', 'feeds'],
    queryFn: getCalendarFeeds,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useCreateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarFeedInput) => createCalendarFeed(input),
    onSuccess: async () => {
      const u = auth.currentUser;
      if (u && apiBase) await runCalendarSync(u.uid, true).catch(console.error);
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useUpdateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CalendarFeedInput & { enabled: boolean }> }) =>
      updateCalendarFeed(id, updates),
    onSuccess: async (_, { id, updates }) => {
      if (updates.enabled === false) {
        const u = auth.currentUser;
        if (u) await deleteCalendarMirrorForFeed(u.uid, id);
      }
      const u = auth.currentUser;
      if (u && apiBase) {
        const urlChanged = typeof updates.url === 'string' && updates.url.length > 0;
        const enabling = updates.enabled === true;
        const metadataOnly =
          !urlChanged &&
          !enabling &&
          (updates.color !== undefined || updates.name !== undefined);

        if (metadataOnly) {
          await patchMirrorEventsForFeedMetadata(u.uid, id, {
            ...(updates.color !== undefined && { color: updates.color }),
            ...(updates.name !== undefined && { calendarName: updates.name }),
          }).catch(console.error);
        } else {
          await runCalendarSync(u.uid, true).catch(console.error);
        }
      }
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useDeleteFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const u = auth.currentUser;
      if (u) await deleteCalendarMirrorForFeed(u.uid, id);
      await deleteCalendarFeed(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
