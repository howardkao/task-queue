import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Initiative } from '../types';
import { ensureUserHousehold } from './household';

const initiativesRef = collection(db, 'initiatives');
const tasksRef = collection(db, 'tasks');

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  return user;
}

function toInitiative(id: string, data: DocumentData): Initiative {
  const ownerUid = data.ownerUid as string | undefined;
  const assigneeUids =
    Array.isArray(data.assigneeUids) && data.assigneeUids.length > 0
      ? [...data.assigneeUids]
      : ownerUid
        ? [ownerUid]
        : [];

  return {
    id,
    name: data.name || '',
    markdown: data.markdown || '',
    investmentId: data.investmentId || '',
    rank: typeof data.rank === 'number' ? data.rank : 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
  };
}

export async function createInitiative(data: {
  name: string;
  investmentId: string;
  markdown?: string;
}): Promise<Initiative> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  // Place at the end of the list within this investment
  const existing = await listInitiatives(data.investmentId);
  const maxRank = existing.reduce((max, init) => Math.max(max, init.rank), 0);

  const docData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    investmentId: data.investmentId,
    rank: maxRank + 1000,
    ownerUid: user.uid,
    householdId,
    assigneeUids: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(initiativesRef, docData);
  return toInitiative(ref.id, { ...docData, createdAt: new Date(), updatedAt: new Date() });
}

export async function listInitiatives(investmentId?: string): Promise<Initiative[]> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const constraints = [where('householdId', '==', householdId)];
  if (investmentId) {
    constraints.push(where('investmentId', '==', investmentId));
  }

  const q = query(initiativesRef, ...constraints);
  const snapshot = await getDocs(q);
  const initiatives = snapshot.docs.map((d) => toInitiative(d.id, d.data()));

  initiatives.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return initiatives;
}

export async function getInitiative(id: string): Promise<Initiative> {
  requireUser();
  const d = await getDoc(doc(initiativesRef, id));
  if (!d.exists()) throw new Error('Initiative not found');
  return toInitiative(d.id, d.data());
}

export async function updateInitiative(id: string, data: Partial<Initiative>): Promise<Initiative> {
  requireUser();
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id' || k === 'createdAt') continue;
    if (v !== undefined) payload[k] = v;
  }

  await updateDoc(doc(initiativesRef, id), payload as any);
  const updated = await getDoc(doc(initiativesRef, id));
  if (!updated.exists()) throw new Error('Initiative not found after update');
  return toInitiative(updated.id, updated.data());
}

export async function reorderInitiatives(
  order: Array<{ id: string; rank: number }>,
): Promise<void> {
  const batch = writeBatch(db);
  for (const item of order) {
    batch.update(doc(initiativesRef, item.id), {
      rank: item.rank,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function deleteInitiative(id: string): Promise<void> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const batch = writeBatch(db);

  // Unlink tasks from this initiative (don't delete them — they stay in the investment)
  const taskSnapshot = await getDocs(
    query(tasksRef, where('householdId', '==', householdId), where('initiativeId', '==', id)),
  );
  taskSnapshot.docs.forEach((d) =>
    batch.update(d.ref, { initiativeId: null, updatedAt: serverTimestamp() }),
  );

  batch.delete(doc(initiativesRef, id));
  await batch.commit();
}
