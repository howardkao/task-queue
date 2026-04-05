import { db, OWNER_UID, FieldValue } from './firestore.js';

const projectsRef = db.collection('projects');
const logRef = db.collection('activityLog');

export interface Project {
  id: string;
  name: string;
  markdown: string;
  status: 'active' | 'on_hold';
  visibility: 'personal' | 'shared';
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

function toProject(id: string, data: any): Project {
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
    visibility: data.visibility || 'personal',
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

async function assertProjectInOwnerHousehold(id: string, data: FirebaseFirestore.DocumentData): Promise<void> {
  const householdId = await getOwnerHouseholdId();
  if (data.householdId !== householdId) {
    throw new Error(`Project ${id} is outside owner household ${householdId}`);
  }
}

export async function listProjects(filters?: { status?: string }): Promise<Project[]> {
  const householdId = await getOwnerHouseholdId();
  let q: FirebaseFirestore.Query = projectsRef.where('householdId', '==', householdId);

  if (filters?.status) {
    q = q.where('status', '==', filters.status);
  }

  const snapshot = await q.get();
  const projects = snapshot.docs.map(d => toProject(d.id, d.data()));

  projects.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return projects;
}

export async function getProject(id: string): Promise<Project> {
  const d = await projectsRef.doc(id).get();
  if (!d.exists) throw new Error('Project not found');
  const data = d.data();
  if (!data) throw new Error('Project data missing');
  await assertProjectInOwnerHousehold(d.id, data);
  return toProject(d.id, data);
}

export async function createProject(data: {
  name: string;
  markdown?: string;
  status?: string;
  familyVisible?: boolean;
}): Promise<Project> {
  const householdId = await getOwnerHouseholdId();
  const projectData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    visibility: 'personal',
    ownerUid: OWNER_UID,
    householdId,
    assigneeUids: [OWNER_UID],
    familyVisible: data.familyVisible === true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await projectsRef.add(projectData);

  logRef.add({
    projectId: ref.id,
    action: 'project_created',
    description: `Project "${data.name}" created`,
    ownerUid: OWNER_UID,
    householdId,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return getProject(ref.id);
}

export async function updateProject(id: string, data: {
  name?: string;
  markdown?: string;
  status?: string;
  familyVisible?: boolean;
}): Promise<Project> {
  const updates: any = { updatedAt: FieldValue.serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.markdown !== undefined) updates.markdown = data.markdown;
  if (data.status !== undefined) updates.status = data.status;
  if (data.familyVisible !== undefined) updates.familyVisible = data.familyVisible;

  await projectsRef.doc(id).update(updates);
  return getProject(id);
}

export async function toggleProjectStatus(id: string): Promise<Project> {
  const project = await getProject(id);
  const newStatus = project.status === 'active' ? 'on_hold' : 'active';
  const result = await updateProject(id, { status: newStatus });
  const householdId = await getOwnerHouseholdId();

  logRef.add({
    projectId: id,
    action: 'project_status_changed',
    description: `Project ${newStatus === 'active' ? 'reactivated' : 'put on hold'}`,
    ownerUid: OWNER_UID,
    householdId,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return result;
}
