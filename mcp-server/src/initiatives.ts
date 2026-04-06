import { db, OWNER_UID, FieldValue } from './firestore.js';

const initiativesRef = db.collection('initiatives');

export interface Initiative {
  id: string;
  name: string;
  markdown: string;
  investmentId: string;
  rank: number;
  createdAt: string | null;
  updatedAt: string | null;
  ownerUid?: string;
  householdId?: string | null;
  assigneeUids: string[];
}

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function toInitiative(id: string, data: any): Initiative {
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
    createdAt: tsToISO(data.createdAt),
    updatedAt: tsToISO(data.updatedAt),
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
  };
}

async function getOwnerHouseholdId(): Promise<string> {
  const userSnap = await db.collection('users').doc(OWNER_UID).get();
  const householdId = userSnap.data()?.householdId;
  if (typeof householdId !== 'string' || householdId.length === 0) {
    throw new Error(`Owner ${OWNER_UID} is missing householdId`);
  }
  return householdId;
}

export async function listInitiatives(investmentId?: string): Promise<Initiative[]> {
  const householdId = await getOwnerHouseholdId();
  let q: FirebaseFirestore.Query = initiativesRef.where('householdId', '==', householdId);

  if (investmentId) {
    q = q.where('investmentId', '==', investmentId);
  }

  const snapshot = await q.get();
  const initiatives = snapshot.docs.map(d => toInitiative(d.id, d.data()));
  initiatives.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return initiatives;
}

export async function getInitiative(id: string): Promise<Initiative> {
  const d = await initiativesRef.doc(id).get();
  if (!d.exists) throw new Error('Initiative not found');
  return toInitiative(d.id, d.data()!);
}

export async function createInitiative(data: {
  name: string;
  investmentId: string;
  markdown?: string;
}): Promise<Initiative> {
  const householdId = await getOwnerHouseholdId();

  const existing = await listInitiatives(data.investmentId);
  const maxRank = existing.reduce((max, init) => Math.max(max, init.rank), 0);

  const initiativeData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    investmentId: data.investmentId,
    rank: maxRank + 1000,
    ownerUid: OWNER_UID,
    householdId,
    assigneeUids: [OWNER_UID],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await initiativesRef.add(initiativeData);
  return getInitiative(ref.id);
}

export async function updateInitiative(id: string, data: {
  name?: string;
  markdown?: string;
  rank?: number;
}): Promise<Initiative> {
  const updates: any = { updatedAt: FieldValue.serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.markdown !== undefined) updates.markdown = data.markdown;
  if (data.rank !== undefined) updates.rank = data.rank;

  await initiativesRef.doc(id).update(updates);
  return getInitiative(id);
}

export async function deleteInitiative(id: string): Promise<void> {
  const householdId = await getOwnerHouseholdId();

  // Unlink tasks from this initiative (don't delete — they stay in the investment)
  const tasksRef = db.collection('tasks');
  const taskSnapshot = await tasksRef
    .where('householdId', '==', householdId)
    .where('initiativeId', '==', id)
    .get();

  const batch = db.batch();
  taskSnapshot.docs.forEach(d =>
    batch.update(d.ref, { initiativeId: null, updatedAt: FieldValue.serverTimestamp() }),
  );
  batch.delete(initiativesRef.doc(id));
  await batch.commit();
}
