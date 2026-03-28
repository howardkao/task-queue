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
}

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function toProject(id: string, data: any): Project {
  return {
    id,
    name: data.name || '',
    markdown: data.markdown || '',
    status: data.status || 'active',
    visibility: data.visibility || 'personal',
    createdAt: tsToISO(data.createdAt),
    updatedAt: tsToISO(data.updatedAt),
  };
}

export async function listProjects(filters?: { status?: string }): Promise<Project[]> {
  let q: FirebaseFirestore.Query = projectsRef.where('ownerUid', '==', OWNER_UID);

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
  return toProject(d.id, d.data());
}

export async function createProject(data: {
  name: string;
  markdown?: string;
  status?: string;
}): Promise<Project> {
  const projectData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    visibility: 'personal',
    ownerUid: OWNER_UID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await projectsRef.add(projectData);

  logRef.add({
    projectId: ref.id,
    action: 'project_created',
    description: `Project "${data.name}" created`,
    ownerUid: OWNER_UID,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return getProject(ref.id);
}

export async function updateProject(id: string, data: {
  name?: string;
  markdown?: string;
  status?: string;
}): Promise<Project> {
  const updates: any = { updatedAt: FieldValue.serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.markdown !== undefined) updates.markdown = data.markdown;
  if (data.status !== undefined) updates.status = data.status;

  await projectsRef.doc(id).update(updates);
  return getProject(id);
}

export async function toggleProjectStatus(id: string): Promise<Project> {
  const project = await getProject(id);
  const newStatus = project.status === 'active' ? 'on_hold' : 'active';
  const result = await updateProject(id, { status: newStatus });

  logRef.add({
    projectId: id,
    action: 'project_status_changed',
    description: `Project ${newStatus === 'active' ? 'reactivated' : 'put on hold'}`,
    ownerUid: OWNER_UID,
    timestamp: FieldValue.serverTimestamp(),
  }).catch(() => {});

  return result;
}
