/**
 * Calendar mirror — Firestore writes for `calendarMirrorEvents` / `calendarMirrorFeedMeta`.
 *
 * **Revision contract:** Any mutation that changes mirror events or per-feed meta must call
 * `bumpCalendarMirrorRevision` (or go through `runCalendarSync` / `deleteCalendarMirrorForFeed` /
 * `patchMirrorEventsForFeedMetadata`, which bump for you). Clients listen to
 * `calendarMirrorRevision/{ownerUid}` and only run a fat `getDocs` when `rev` changes, so idle
 * reconnects bill ~1 document read instead of the full mirror. If you add mirror writes elsewhere
 * (Worker, scripts, MCP), bump the same doc. See SPEC.md (calendar mirror) and ADR-011.
 */
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CalendarEvent, CalendarFeed, CalendarResponse } from '../types';
import { fetchCalendarSync, getCalendarFeeds } from './calendar';
import { CALENDAR_RANGE_DAYS } from '../calendar/calendarLimits';
import { addDaysToYmd, getTimezoneDate } from '../calendar/getTimezoneDate';
import { parseICal } from '../calendar/parseICal';

const EVENTS = 'calendarMirrorEvents';
const META = 'calendarMirrorFeedMeta';

/** Single doc per `ownerUid`; `rev` increments when mirror events or feed meta change. */
const REVISION = 'calendarMirrorRevision';

/**
 * Call after any successful write to `EVENTS` or `META` for this owner (once per logical batch of work).
 * Keeps realtime clients aligned without holding a query listener on every mirror row.
 */
async function bumpCalendarMirrorRevision(ownerUid: string): Promise<void> {
  await setDoc(
    doc(db, REVISION, ownerUid),
    { ownerUid, rev: increment(1) },
    { merge: true },
  );
}

function logCalendarFirestore(message: string, data?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional diagnostics for Firestore churn
    console.debug(`[calendarFirestore] ${message}`, data ?? '');
  }
}

function getClientSyncWindowBounds(): { start: Date; end: Date } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;
  const startKey = addDaysToYmd(todayKey, -CALENDAR_RANGE_DAYS);
  const endKey = addDaysToYmd(todayKey, CALENDAR_RANGE_DAYS);
  return {
    start: getTimezoneDate(startKey, '00:00:00', tz),
    end: getTimezoneDate(endKey, '00:00:00', tz),
  };
}

async function mirrorEventDocId(feedId: string, ev: Pick<CalendarEvent, 'uid' | 'start' | 'end' | 'title'>): Promise<string> {
  const basis = `${ev.uid || ''}|${ev.start}|${ev.end}|${ev.title}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
  const hex = [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${feedId}_${hex}`;
}

async function deleteMirrorEventsForFeed(ownerUid: string, feedId: string): Promise<void> {
  const q = query(
    collection(db, EVENTS),
    where('ownerUid', '==', ownerUid),
    where('feedId', '==', feedId),
  );
  for (;;) {
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(0, 450)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

const MIRROR_COMPARE_KEYS = [
  'ownerUid',
  'feedId',
  'title',
  'start',
  'end',
  'busy',
  'calendarName',
  'color',
  'allDay',
  'description',
  'location',
  'uid',
  'rrule',
  'rawStart',
  'rawEnd',
] as const;

function buildMirrorBody(ownerUid: string, feedId: string, ev: CalendarEvent): Record<string, unknown> {
  return {
    ownerUid,
    feedId,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    busy: ev.busy,
    calendarName: ev.calendarName,
    color: ev.color,
    allDay: ev.allDay ?? false,
    description: ev.description ?? null,
    location: ev.location ?? null,
    uid: ev.uid ?? null,
    rrule: ev.rrule ?? null,
    rawStart: ev.rawStart ?? null,
    rawEnd: ev.rawEnd ?? null,
  };
}

function mirrorFieldsEqual(existing: DocumentData, body: Record<string, unknown>): boolean {
  for (const k of MIRROR_COMPARE_KEYS) {
    const a = existing[k];
    const b = body[k];
    if (a === b) continue;
    const an = a === undefined ? null : a;
    const bn = b === undefined ? null : b;
    if (an !== bn) return false;
  }
  return true;
}

async function fetchExistingMirrorDocsById(
  ownerUid: string,
  feedId: string,
): Promise<Map<string, DocumentData>> {
  const base = [
    where('ownerUid', '==', ownerUid),
    where('feedId', '==', feedId),
    orderBy(documentId()),
  ];
  const map = new Map<string, DocumentData>();
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const q = last
      ? query(collection(db, EVENTS), ...base, startAfter(last), limit(450))
      : query(collection(db, EVENTS), ...base, limit(450));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      map.set(d.id, d.data());
    }
    if (snap.docs.length < 450) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return map;
}

async function setMirrorFeedMeta(ownerUid: string, feedId: string, syncWarnings: string[]): Promise<void> {
  await setDoc(
    doc(db, META, `${ownerUid}_${feedId}`),
    {
      ownerUid,
      feedId,
      syncWarnings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Upsert/delete only what changed vs existing mirror rows (same doc id scheme as before). */
async function syncFeedMirrorEvents(
  ownerUid: string,
  feedId: string,
  events: CalendarEvent[],
  warnings: string[],
): Promise<void> {
  const existing = await fetchExistingMirrorDocsById(ownerUid, feedId);

  const idList = await Promise.all(
    events.map(async (ev) => ({ id: await mirrorEventDocId(feedId, ev), ev })),
  );
  const desiredById = new Map<string, CalendarEvent>();
  for (const { id, ev } of idList) {
    desiredById.set(id, ev);
  }
  const desiredIds = new Set(desiredById.keys());

  type MirrorOp =
    | { kind: 'delete'; ref: ReturnType<typeof doc> }
    | { kind: 'set'; ref: ReturnType<typeof doc>; data: Record<string, unknown> };

  const ops: MirrorOp[] = [];

  for (const id of existing.keys()) {
    if (!desiredIds.has(id)) {
      ops.push({ kind: 'delete', ref: doc(db, EVENTS, id) });
    }
  }

  for (const [id, ev] of desiredById) {
    const body = buildMirrorBody(ownerUid, feedId, ev);
    const prev = existing.get(id);
    if (!prev || !mirrorFieldsEqual(prev, body)) {
      ops.push({
        kind: 'set',
        ref: doc(db, EVENTS, id),
        data: { ...body, updatedAt: serverTimestamp() },
      });
    }
  }

  const MAX_OPS = 450;
  let batch = writeBatch(db);
  let count = 0;
  const flush = async () => {
    if (count === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    count = 0;
  };

  for (const op of ops) {
    if (count >= MAX_OPS) await flush();
    if (op.kind === 'delete') {
      batch.delete(op.ref);
    } else {
      batch.set(op.ref, op.data);
    }
    count++;
  }
  await flush();

  await setMirrorFeedMeta(ownerUid, feedId, warnings);
}

async function cleanupDisabledMirrorFeeds(ownerUid: string, feedsList: CalendarFeed[]): Promise<boolean> {
  let didMutate = false;
  const q = query(collection(db, META), where('ownerUid', '==', ownerUid));
  const snap = await getDocs(q);
  for (const docSnap of snap.docs) {
    const fid = docSnap.data().feedId as string;
    const feed = feedsList.find((f) => f.id === fid);
    if (!feed || !feed.enabled) {
      await deleteMirrorEventsForFeed(ownerUid, fid);
      await deleteDoc(docSnap.ref);
      didMutate = true;
    }
  }
  return didMutate;
}

export async function runCalendarSync(ownerUid: string, bust: boolean): Promise<void> {
  const data = await fetchCalendarSync(bust);
  const feedsList = await getCalendarFeeds();
  const feedById = new Map(feedsList.map((f) => [f.id, f]));

  let mirrorMutated = false;

  for (const item of data.feeds) {
    const feed = feedById.get(item.id);
    if (!feed) continue;

    if (item.status === 'error') {
      await setMirrorFeedMeta(ownerUid, item.id, [item.message || 'Sync error']);
      mirrorMutated = true;
      continue;
    }
    if (item.status === 'unchanged') continue;
    if (item.status === 'updated' && item.ical) {
      const { start, end } = getClientSyncWindowBounds();
      const { events: rawEvents, warnings } = parseICal(item.ical, start, end);
      const calendarEvents: CalendarEvent[] = rawEvents.map((e) => ({
        title: e.summary,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        busy: e.transparency !== 'TRANSPARENT',
        calendarName: feed.name,
        color: feed.color,
        allDay: e.isAllDay,
        description: e.description,
        location: e.location,
        uid: e.uid,
        rrule: e.rrule,
        rawStart: e.rawStart,
        rawEnd: e.rawEnd,
      }));
      await syncFeedMirrorEvents(ownerUid, item.id, calendarEvents, warnings);
      mirrorMutated = true;
    }
  }

  if (await cleanupDisabledMirrorFeeds(ownerUid, feedsList)) mirrorMutated = true;

  if (mirrorMutated) await bumpCalendarMirrorRevision(ownerUid);
}

export async function deleteCalendarMirrorForFeed(ownerUid: string, feedId: string): Promise<void> {
  await deleteMirrorEventsForFeed(ownerUid, feedId);
  try {
    await deleteDoc(doc(db, META, `${ownerUid}_${feedId}`));
  } catch {
    /* missing meta */
  }
  await bumpCalendarMirrorRevision(ownerUid);
}

/** Update stored mirror rows when only feed display fields change (avoids full iCal re-fetch). */
export async function patchMirrorEventsForFeedMetadata(
  ownerUid: string,
  feedId: string,
  patch: { color?: string; calendarName?: string },
): Promise<void> {
  if (patch.color === undefined && patch.calendarName === undefined) return;

  const base = [
    where('ownerUid', '==', ownerUid),
    where('feedId', '==', feedId),
    orderBy(documentId()),
  ];

  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  let wroteAny = false;
  for (;;) {
    const q = last
      ? query(collection(db, EVENTS), ...base, startAfter(last), limit(450))
      : query(collection(db, EVENTS), ...base, limit(450));
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    for (const d of snap.docs) {
      const fields: {
        updatedAt: ReturnType<typeof serverTimestamp>;
        color?: string;
        calendarName?: string;
      } = { updatedAt: serverTimestamp() };
      if (patch.color !== undefined) fields.color = patch.color;
      if (patch.calendarName !== undefined) fields.calendarName = patch.calendarName;
      batch.update(d.ref, fields);
    }
    await batch.commit();
    wroteAny = true;

    if (snap.docs.length < 450) break;
    last = snap.docs[snap.docs.length - 1];
  }

  if (wroteAny) await bumpCalendarMirrorRevision(ownerUid);
}

/** Client-side slice of the mirror for the visible calendar strip (same bounds the old per-range query used). */
export function filterMirrorEventsForVisibleRange(
  events: CalendarEvent[],
  startDate: string,
  days: number,
): CalendarEvent[] {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rangeStart = getTimezoneDate(startDate, '00:00:00', tz);
  const endKey = addDaysToYmd(startDate, days);
  const rangeEnd = getTimezoneDate(endKey, '00:00:00', tz);
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();
  return events.filter((e) => e.start >= startISO && e.start < endISO);
}

function revisionFromSignalSnap(snap: DocumentSnapshot): number {
  if (!snap.exists()) return -1;
  const v = snap.data()?.rev;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Listens to `calendarMirrorRevision/{ownerUid}`; on each new `rev`, runs `getDocs` for the mirror
 * sync window (today ± CALENDAR_RANGE_DAYS) and feed meta. Idle reconnects re-read one doc, not the
 * full event set. TodayView still filters client-side when scrolling days.
 */
export function subscribeCalendarMirror(ownerUid: string, onUpdate: (data: CalendarResponse) => void): () => void {
  const { start: rangeStart, end: rangeEnd } = getClientSyncWindowBounds();
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();

  let lastEvents: CalendarEvent[] = [];
  let lastWarnings: string[] = [];
  let lastFetchedRev: number | null = null;
  let loadGen = 0;

  const emit = () => {
    const sorted = [...lastEvents].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    onUpdate({
      events: sorted,
      syncWarnings: [...new Set(lastWarnings)],
    });
  };

  const qEvents = query(
    collection(db, EVENTS),
    where('ownerUid', '==', ownerUid),
    where('start', '>=', startISO),
    where('start', '<', endISO),
    orderBy('start'),
  );

  const qMeta = query(collection(db, META), where('ownerUid', '==', ownerUid));

  const signalRef = doc(db, REVISION, ownerUid);

  const applyFatSnapshot = (evSnap: Awaited<ReturnType<typeof getDocs>>, metaSnap: Awaited<ReturnType<typeof getDocs>>) => {
    lastEvents = evSnap.docs.map((d) => {
      const x = d.data() as DocumentData;
      return {
        mirrorDocId: d.id,
        title: x.title,
        start: x.start,
        end: x.end,
        busy: x.busy,
        calendarName: x.calendarName,
        color: x.color,
        allDay: x.allDay,
        description: x.description ?? undefined,
        location: x.location ?? undefined,
        uid: x.uid ?? undefined,
        rrule: x.rrule ?? undefined,
        rawStart: x.rawStart ?? undefined,
        rawEnd: x.rawEnd ?? undefined,
      } as CalendarEvent;
    });
    lastWarnings = metaSnap.docs.flatMap((d) => ((d.data() as DocumentData).syncWarnings as string[]) || []);
    emit();
  };

  const scheduleFatFetch = (currentRev: number) => {
    const g = ++loadGen;
    logCalendarFirestore('fat fetch mirror (rev changed or initial)', {
      startISO,
      endISO,
      currentRev,
      loadGen: g,
    });
    void (async () => {
      try {
        const [evSnap, metaSnap] = await Promise.all([getDocs(qEvents), getDocs(qMeta)]);
        if (g !== loadGen) return;
        lastFetchedRev = currentRev;
        await applyFatSnapshot(evSnap, metaSnap);
        logCalendarFirestore('fat fetch mirror done', {
          eventDocs: evSnap.size,
          metaDocs: metaSnap.size,
          fromCacheEvents: evSnap.metadata.fromCache,
          fromCacheMeta: metaSnap.metadata.fromCache,
        });
      } catch (e) {
        if (g !== loadGen) return;
        console.error('[calendarFirestore] fat fetch failed', e);
      }
    })();
  };

  logCalendarFirestore('subscribe revision listener + fat fetch on rev change', {
    startISO,
    endISO,
  });

  const unsubSignal = onSnapshot(signalRef, (snap) => {
    const currentRev = revisionFromSignalSnap(snap);
    if (lastFetchedRev === null || currentRev !== lastFetchedRev) {
      scheduleFatFetch(currentRev);
    }
  });

  return () => {
    logCalendarFirestore('unsubscribe calendar mirror subscription', { startISO, endISO });
    loadGen += 1;
    unsubSignal();
  };
}
