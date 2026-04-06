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
  type QueryConstraint,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Investment, InvestmentStatus } from '../types';
import { addLogEntry } from './activityLog';
import { ensureUserHousehold } from './household';

const investmentsRef = collection(db, 'investments');
const tasksRef = collection(db, 'tasks');
const initiativesRef = collection(db, 'initiatives');
const activityLogRef = collection(db, 'activityLog');

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  return user;
}

function toInvestment(id: string, data: DocumentData): Investment {
  const ownerUid = data.ownerUid as string | undefined;
  const assigneeUids =
    Array.isArray(data.assigneeUids) && data.assigneeUids.length > 0
      ? [...data.assigneeUids]
      : ownerUid
        ? [ownerUid]
        : [];
  const familyVisible =
    data.familyVisible === true || data.visibility === 'shared';

  return {
    id,
    name: data.name || '',
    markdown: data.markdown || '',
    status: data.status || 'active',
    rank: typeof data.rank === 'number' ? data.rank : 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
    familyVisible,
  };
}

export async function createInvestment(data: {
  name: string;
  markdown?: string;
  status?: InvestmentStatus;
  familyVisible?: boolean;
}): Promise<Investment> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  // Place at the end of the list
  const existing = await listInvestments();
  const maxRank = existing.reduce((max, inv) => Math.max(max, inv.rank), 0);

  const docData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    rank: maxRank + 1000,
    ownerUid: user.uid,
    householdId,
    assigneeUids: [user.uid],
    familyVisible: data.familyVisible === true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(investmentsRef, docData);
  return toInvestment(ref.id, { ...docData, createdAt: new Date(), updatedAt: new Date() });
}

export async function listInvestments(filters?: {
  status?: InvestmentStatus;
}): Promise<Investment[]> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const constraints: QueryConstraint[] = [where('householdId', '==', householdId)];
  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(investmentsRef, ...constraints);
  const snapshot = await getDocs(q);
  const investments = snapshot.docs.map((d) => toInvestment(d.id, d.data()));

  // Sort by rank (primary), then name (tiebreaker)
  investments.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return investments;
}

export async function getInvestment(id: string): Promise<Investment> {
  requireUser();
  const d = await getDoc(doc(investmentsRef, id));
  if (!d.exists()) throw new Error('Investment not found');
  return toInvestment(d.id, d.data());
}

export async function updateInvestment(id: string, data: Partial<Investment>): Promise<Investment> {
  requireUser();
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id' || k === 'createdAt') continue;
    if (v !== undefined) payload[k] = v;
  }

  await updateDoc(doc(investmentsRef, id), payload as any);
  const updated = await getDoc(doc(investmentsRef, id));
  if (!updated.exists()) throw new Error('Investment not found after update');
  return toInvestment(updated.id, updated.data());
}

export async function setInvestmentStatus(id: string, status: InvestmentStatus): Promise<Investment> {
  requireUser();
  const result = await updateInvestment(id, { status });

  addLogEntry({
    investmentId: id,
    action: 'investment_status_changed',
    description: `Investment ${status === 'active' ? 'activated' : status === 'on_hold' ? 'put on hold' : 'completed'}`,
  }).catch(() => {});

  return result;
}

export async function reorderInvestments(
  order: Array<{ id: string; rank: number }>,
): Promise<void> {
  const batch = writeBatch(db);
  for (const item of order) {
    batch.update(doc(investmentsRef, item.id), {
      rank: item.rank,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function deleteInvestment(id: string): Promise<void> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const batch = writeBatch(db);

  const [taskSnapshot, initiativeSnapshot, logSnapshot] = await Promise.all([
    getDocs(query(tasksRef, where('householdId', '==', householdId), where('investmentId', '==', id))),
    getDocs(query(initiativesRef, where('householdId', '==', householdId), where('investmentId', '==', id))),
    getDocs(query(activityLogRef, where('householdId', '==', householdId), where('projectId', '==', id))),
  ]);

  batch.delete(doc(investmentsRef, id));
  taskSnapshot.docs.forEach((d) => batch.delete(d.ref));
  initiativeSnapshot.docs.forEach((d) => batch.delete(d.ref));
  logSnapshot.docs.forEach((d) => batch.delete(d.ref));

  await batch.commit();
}
