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
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Project, ProjectStatus } from '../types';
import { addLogEntry } from './activityLog';

const projectsRef = collection(db, 'projects');
const tasksRef = collection(db, 'tasks');
const activityLogRef = collection(db, 'activityLog');

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

function toProject(id: string, data: any): Project {
  return {
    id,
    name: data.name || '',
    markdown: data.markdown || '',
    status: data.status || 'active',
    visibility: data.visibility || 'personal',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function createProject(data: {
  name: string;
  markdown?: string;
  status?: ProjectStatus;
}): Promise<Project> {
  const user = requireUser();
  const docData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    visibility: 'personal',
    ownerUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(projectsRef, docData);
  return toProject(ref.id, { ...docData, createdAt: new Date(), updatedAt: new Date() });
}

export async function listProjects(filters?: {
  status?: ProjectStatus;
}): Promise<Project[]> {
  const user = requireUser();
  const constraints: any[] = [where('ownerUid', '==', user.uid)];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(projectsRef, ...constraints);
  const snapshot = await getDocs(q);

  const projects = snapshot.docs.map(d => toProject(d.id, d.data()));

  // Sort: active first, then by name
  projects.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return projects;
}

export async function getProject(id: string): Promise<Project> {
  requireUser();
  const d = await getDoc(doc(projectsRef, id));
  if (!d.exists()) throw new Error('Project not found');
  return toProject(d.id, d.data());
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  requireUser();
  const updateData: any = { ...data, updatedAt: serverTimestamp() };
  delete updateData.id;
  delete updateData.createdAt;

  await updateDoc(doc(projectsRef, id), updateData);

  const updated = await getDoc(doc(projectsRef, id));
  return toProject(updated.id, updated.data());
}

export async function toggleProjectStatus(id: string): Promise<Project> {
  requireUser();
  const project = await getProject(id);
  const newStatus: ProjectStatus = project.status === 'active' ? 'on_hold' : 'active';
  const result = await updateProject(id, { status: newStatus });

  addLogEntry({
    projectId: id,
    action: 'project_status_changed',
    description: `Project ${newStatus === 'active' ? 'reactivated' : 'put on hold'}`,
  }).catch(() => {});

  return result;
}

export async function deleteProject(id: string): Promise<void> {
  const user = requireUser();
  const batch = writeBatch(db);

  const [taskSnapshot, logSnapshot] = await Promise.all([
    getDocs(query(
      tasksRef,
      where('ownerUid', '==', user.uid),
      where('projectId', '==', id),
    )),
    getDocs(query(
      activityLogRef,
      where('ownerUid', '==', user.uid),
      where('projectId', '==', id),
    )),
  ]);

  batch.delete(doc(projectsRef, id));
  taskSnapshot.docs.forEach(taskDoc => batch.delete(taskDoc.ref));
  logSnapshot.docs.forEach(logDoc => batch.delete(logDoc.ref));

  await batch.commit();
}
