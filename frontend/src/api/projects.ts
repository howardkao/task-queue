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
import type { Project, ProjectStatus } from '../types';
import { addLogEntry } from './activityLog';
import { ensureUserHousehold } from './household';

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

function toProject(id: string, data: DocumentData): Project {
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
    visibility: data.visibility || 'personal',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
    familyVisible,
  };
}

export async function createProject(data: {
  name: string;
  markdown?: string;
  status?: ProjectStatus;
  familyVisible?: boolean;
}): Promise<Project> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const docData = {
    name: data.name,
    markdown: data.markdown || `# ${data.name}\n\n`,
    status: data.status || 'active',
    visibility: 'personal' as const,
    ownerUid: user.uid,
    householdId,
    assigneeUids: [user.uid],
    familyVisible: data.familyVisible === true,
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
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const constraints: QueryConstraint[] = [where('householdId', '==', householdId)];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(projectsRef, ...constraints);
  const snapshot = await getDocs(q);

  const projects = snapshot.docs.map((d) => toProject(d.id, d.data()));

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
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id' || k === 'createdAt') continue;
    if (v !== undefined) payload[k] = v;
  }
  if (data.visibility !== undefined && data.familyVisible === undefined && data.visibility === 'shared') {
    payload.familyVisible = true;
  }

  await updateDoc(doc(projectsRef, id), payload as any);

  const updated = await getDoc(doc(projectsRef, id));
  if (!updated.exists()) throw new Error('Project not found after update');
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
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const batch = writeBatch(db);

  const [taskSnapshot, logSnapshot] = await Promise.all([
    getDocs(query(tasksRef, where('householdId', '==', householdId), where('projectId', '==', id))),
    getDocs(query(activityLogRef, where('householdId', '==', householdId), where('projectId', '==', id))),
  ]);

  batch.delete(doc(projectsRef, id));
  taskSnapshot.docs.forEach((taskDoc) => batch.delete(taskDoc.ref));
  logSnapshot.docs.forEach((logDoc) => batch.delete(logDoc.ref));

  await batch.commit();
}
