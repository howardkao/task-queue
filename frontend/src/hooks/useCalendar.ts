import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getCalendarFeeds,
  createCalendarFeed,
  updateCalendarFeed,
  deleteCalendarFeed,
} from '../api/calendar';
import {
  deleteCalendarMirrorForFeed,
  filterMirrorEventsForVisibleRange,
  patchMirrorEventsForFeedMetadata,
  runCalendarSync,
  subscribeCalendarMirror,
} from '../api/calendarMirror';
import type { CalendarFeedInput, CalendarResponse } from '../types';
import { useAuth } from './useAuth';
import { auth } from '../firebase';

const apiBase = import.meta.env.VITE_API_BASE || '';

/** Limits Firestore churn from calendar auto-sync (diff-based mirror + narrower date window still benefit from spacing). */
const lastCalendarAutoSyncByUid = new Map<string, number>();
const CALENDAR_AUTO_SYNC_MIN_INTERVAL_MS = 4 * 60 * 1000;

/** Worker fetch + mirror write; respects throttle when `bust` is false. */
function tryCalendarAutoSync(uid: string, bust: boolean): void {
  const now = Date.now();
  if (!bust) {
    const last = lastCalendarAutoSyncByUid.get(uid) ?? 0;
    if (now - last < CALENDAR_AUTO_SYNC_MIN_INTERVAL_MS) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- intentional diagnostics
        console.debug('[calendarFirestore] runCalendarSync skipped (throttle)', {
          msSinceLast: now - last,
          minIntervalMs: CALENDAR_AUTO_SYNC_MIN_INTERVAL_MS,
        });
      }
      return;
    }
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional diagnostics
    console.debug('[calendarFirestore] runCalendarSync invoking', { bust });
  }
  void runCalendarSync(uid, bust)
    .then(() => {
      lastCalendarAutoSyncByUid.set(uid, Date.now());
    })
    .catch(console.error);
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar day; bumps after midnight / resume so the mirror window listener can realign with sync. */
function useLocalCalendarYmd(): string {
  const [ymd, setYmd] = useState(() => localYmd(new Date()));
  useEffect(() => {
    const refresh = () => {
      const next = localYmd(new Date());
      setYmd((prev) => (prev === next ? prev : next));
    };
    const id = setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return ymd;
}

function useEventsForRangeImpl(
  syncAnchorYmd: string,
  startDate: string,
  days: number,
  bust: boolean,
) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const mirrorQueryKey = ['calendar', 'mirror', user?.uid ?? ''] as const;

  const query = useQuery<CalendarResponse>({
    queryKey: mirrorQueryKey,
    queryFn: async () => ({ events: [], syncWarnings: [] }),
    enabled: !!user && !!apiBase,
    staleTime: Infinity,
    placeholderData: user && apiBase ? { events: [], syncWarnings: [] } : undefined,
  });

  useEffect(() => {
    if (!user || !apiBase) return;
    return subscribeCalendarMirror(user.uid, (data) => {
      qc.setQueryData(mirrorQueryKey, data);
    });
  }, [user?.uid, apiBase, syncAnchorYmd, qc]);

  useEffect(() => {
    if (!user || !apiBase) return;
    tryCalendarAutoSync(user.uid, bust);
  }, [user?.uid, apiBase, bust]);

  /** Background tabs never re-ran the mount effect; refetch iCal when the user comes back. */
  useEffect(() => {
    if (!user || !apiBase) return;
    const uid = user.uid;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      tryCalendarAutoSync(uid, false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.uid, apiBase]);

  const dataForRange = useMemo((): CalendarResponse | null | undefined => {
    if (!apiBase) return null;
    const raw = query.data;
    if (!raw) return raw;
    return {
      events: filterMirrorEventsForVisibleRange(raw.events, startDate, days),
      syncWarnings: raw.syncWarnings,
    };
  }, [apiBase, query.data, startDate, days]);

  const isConfigured = !!apiBase;

  return { ...query, data: dataForRange, isConfigured };
}

export function useTodayEvents() {
  const ymd = useLocalCalendarYmd();
  return useEventsForRangeImpl(ymd, ymd, 1, false);
}

export function useEventsForRange(startDate: string, days: number, bust = false) {
  const syncAnchorYmd = useLocalCalendarYmd();
  return useEventsForRangeImpl(syncAnchorYmd, startDate, days, bust);
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
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CalendarFeedInput & { enabled: boolean; sharedWithFamily: boolean; hiddenByUser: boolean }> }) =>
      updateCalendarFeed(id, updates),
    onSuccess: async (_, { id, updates }) => {
      // hiddenByUser and sharedWithFamily don't touch the mirror — skip sync
      const mirrorRelevant = updates.url !== undefined || updates.enabled !== undefined ||
        updates.color !== undefined || updates.name !== undefined;

      if (mirrorRelevant) {
        if (updates.enabled === false) {
          const u = auth.currentUser;
          if (u) await deleteCalendarMirrorForFeed(u.uid, id);
        } else {
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
