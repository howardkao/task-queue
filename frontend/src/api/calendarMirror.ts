import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CalendarEvent, CalendarFeed, CalendarResponse } from '../types';
import { fetchCalendarSync, getCalendarFeeds } from './calendar';
import { addDaysToYmd, getTimezoneDate } from '../calendar/getTimezoneDate';
import { parseICal } from '../calendar/parseICal';

const EVENTS = 'calendarMirrorEvents';
const META = 'calendarMirrorFeedMeta';

const SYNC_BACK_DAYS = 30;
const SYNC_FORWARD_DAYS = 180;

function getClientSyncWindowBounds(): { start: Date; end: Date } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;
  const startKey = addDaysToYmd(todayKey, -SYNC_BACK_DAYS);
  const endKey = addDaysToYmd(todayKey, SYNC_FORWARD_DAYS);
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

async function replaceFeedMirrorEvents(
  ownerUid: string,
  feedId: string,
  events: CalendarEvent[],
  warnings: string[],
): Promise<void> {
  await deleteMirrorEventsForFeed(ownerUid, feedId);

  const withIds = await Promise.all(
    events.map(async (ev) => ({ ev, id: await mirrorEventDocId(feedId, ev) })),
  );

  for (let i = 0; i < withIds.length; i += 450) {
    const batch = writeBatch(db);
    const chunk = withIds.slice(i, i + 450);
    for (const { ev, id } of chunk) {
      const ref = doc(db, EVENTS, id);
      batch.set(ref, {
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
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  await setMirrorFeedMeta(ownerUid, feedId, warnings);
}

async function cleanupDisabledMirrorFeeds(ownerUid: string, feedsList: CalendarFeed[]): Promise<void> {
  const q = query(collection(db, META), where('ownerUid', '==', ownerUid));
  const snap = await getDocs(q);
  for (const docSnap of snap.docs) {
    const fid = docSnap.data().feedId as string;
    const feed = feedsList.find((f) => f.id === fid);
    if (!feed || !feed.enabled) {
      await deleteMirrorEventsForFeed(ownerUid, fid);
      await deleteDoc(docSnap.ref);
    }
  }
}

export async function runCalendarSync(ownerUid: string, bust: boolean): Promise<void> {
  const data = await fetchCalendarSync(bust);
  const feedsList = await getCalendarFeeds();
  const feedById = new Map(feedsList.map((f) => [f.id, f]));

  for (const item of data.feeds) {
    const feed = feedById.get(item.id);
    if (!feed) continue;

    if (item.status === 'error') {
      await setMirrorFeedMeta(ownerUid, item.id, [item.message || 'Sync error']);
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
      await replaceFeedMirrorEvents(ownerUid, item.id, calendarEvents, warnings);
    }
  }

  await cleanupDisabledMirrorFeeds(ownerUid, feedsList);
}

export async function deleteCalendarMirrorForFeed(ownerUid: string, feedId: string): Promise<void> {
  await deleteMirrorEventsForFeed(ownerUid, feedId);
  try {
    await deleteDoc(doc(db, META, `${ownerUid}_${feedId}`));
  } catch {
    /* missing meta */
  }
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

    if (snap.docs.length < 450) break;
    last = snap.docs[snap.docs.length - 1];
  }
}

export function subscribeCalendarMirror(
  ownerUid: string,
  startDate: string,
  days: number,
  onUpdate: (data: CalendarResponse) => void,
): () => void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rangeStart = getTimezoneDate(startDate, '00:00:00', tz);
  const endKey = addDaysToYmd(startDate, days);
  const rangeEnd = getTimezoneDate(endKey, '00:00:00', tz);
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();

  let lastEvents: CalendarEvent[] = [];
  let lastWarnings: string[] = [];

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

  const unsubE = onSnapshot(qEvents, (snap) => {
    lastEvents = snap.docs.map((d) => {
      const x = d.data();
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
    emit();
  });

  const unsubM = onSnapshot(qMeta, (snap) => {
    lastWarnings = snap.docs.flatMap((d) => (d.data().syncWarnings as string[]) || []);
    emit();
  });

  return () => {
    unsubE();
    unsubM();
  };
}
