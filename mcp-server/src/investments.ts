import { db, OWNER_UID, FieldValue } from './firestore.js';

const investmentsRef = db.collection('investments');
const logRef = db.collection('activityLog');

export type InvestmentStatus = 'active' | 'on_hold' | 'completed';

export interface Investment {
  id: string;
  name: string;
  markdown: string;
  status: InvestmentStatus;
  rank: number;
  createdAt: string | null;
  updatedAt: string | null;
  ownerUid?: string;
  householdId?: string | null;
  assigneeUids: string[];
  familyVisible: boolean;
}

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function toInvestment(id: string, data: any): Investment {
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
    status: data.status || 'active',
    rank: typeof data.rank === 'number' ? data.rank : 0,
    createdAt: tsToISO(data.createdAt),
    updatedAt: tsToISO(data.updatedAt),
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
    familyVisible: data.familyVisible === true || data.visibility === 'shared',
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

export async function listInvestments(filters?: { status?: string }): Promise<Investment[]> {
  const householdId = await getOwnerHouseholdId();
  let q: FirebaseFirestore.Query = investmentsRef.where('householdId', '==', householdId);

  if (filters?.status) {
    q = q.where('status', '==', filters.status);
  }

  const snapshot = await q.get();
  const investments = snapshot.docs.map(d => toInvestment(d.id, d.data()));
  investments.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return investments;
}

export async function getInvestment(id: string): Promise<Investment> {
  const d = await investmentsRef.doc(id).get();
  if (!d.exists) throw new Error('Investment not found');
  return toInvestment(d.id, d.data()!);
}

export async function createInvestment(data: {
  name: string;
  markdown?: string;
  status?: string;
  familyVisible?: boolean;
}): Promise<Investment> {
  const householdId = await getOwnerHouseholdId();

  // Place at end
  const existing = await listInvestments();
  const maxRank = existing.reduce((max, inv) => Math.max(max, inv.rank), 0);

  const investmentData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    rank: maxRank + 1000,
    ownerUid: OWNER_UID,
    householdId,
    assigneeUids: [OWNER_UID],
    familyVisible: data.familyVisible === true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await investmentsRef.add(investmentData);

  logRef.add({
    investmentId: ref.id,
    action: 'investment_created',
    description: `Investment "${data.name}" created`,
    ownerUid: OWNER_UID,
    householdId,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return getInvestment(ref.id);
}

export async function updateInvestment(id: string, data: {
  name?: string;
  markdown?: string;
  status?: string;
  familyVisible?: boolean;
  rank?: number;
}): Promise<Investment> {
  const updates: any = { updatedAt: FieldValue.serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.markdown !== undefined) updates.markdown = data.markdown;
  if (data.status !== undefined) updates.status = data.status;
  if (data.familyVisible !== undefined) updates.familyVisible = data.familyVisible;
  if (data.rank !== undefined) updates.rank = data.rank;

  await investmentsRef.doc(id).update(updates);
  return getInvestment(id);
}

export async function setInvestmentStatus(id: string, status: InvestmentStatus): Promise<Investment> {
  const result = await updateInvestment(id, { status });
  const householdId = await getOwnerHouseholdId();

  logRef.add({
    investmentId: id,
    action: 'investment_status_changed',
    description: `Investment ${status === 'active' ? 'activated' : status === 'on_hold' ? 'put on hold' : 'completed'}`,
    ownerUid: OWNER_UID,
    householdId,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return result;
}
