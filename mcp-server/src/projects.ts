import {
  db,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from './firestore.js';

const projectsRef = collection(db, 'projects');
const logRef = collection(db, 'activityLog');

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
  const constraints: any[] = [];
  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(projectsRef, ...constraints);
  const snapshot = await getDocs(q);
  const projects = snapshot.docs.map(d => toProject(d.id, d.data()));

  projects.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return projects;
}

export async function getProject(id: string): Promise<Project> {
  const d = await getDoc(doc(projectsRef, id));
  if (!d.exists()) throw new Error('Project not found');
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(projectsRef, projectData);

  addDoc(logRef, {
    projectId: ref.id,
    action: 'project_created',
    description: `Project "${data.name}" created`,
    timestamp: serverTimestamp(),
  }).catch(() => {});

  return getProject(ref.id);
}

export async function updateProject(id: string, data: {
  name?: string;
  markdown?: string;
  status?: string;
}): Promise<Project> {
  const updates: any = { updatedAt: serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.markdown !== undefined) updates.markdown = data.markdown;
  if (data.status !== undefined) updates.status = data.status;

  await updateDoc(doc(projectsRef, id), updates);
  return getProject(id);
}

export async function toggleProjectStatus(id: string): Promise<Project> {
  const project = await getProject(id);
  const newStatus = project.status === 'active' ? 'on_hold' : 'active';
  const result = await updateProject(id, { status: newStatus });

  addDoc(logRef, {
    projectId: id,
    action: 'project_status_changed',
    description: `Project ${newStatus === 'active' ? 'reactivated' : 'put on hold'}`,
    timestamp: serverTimestamp(),
  }).catch(() => {});

  return result;
}
