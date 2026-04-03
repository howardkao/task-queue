import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { ActivityLogEntry } from '../types';
import { firestoreTimeToMs } from '../lib/firestoreTime';

const logRef = collection(db, 'activityLog');

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

function toEntry(id: string, data: DocumentData): ActivityLogEntry {
  return {
    id,
    projectId: data.projectId,
    action: data.action,
    description: data.description,
    taskId: data.taskId || undefined,
    timestamp: data.timestamp,
  };
}

export async function addLogEntry(entry: {
  projectId: string;
  action: ActivityLogEntry['action'];
  description: string;
  taskId?: string;
}): Promise<void> {
  const user = requireUser();
  await addDoc(logRef, {
    ...entry,
    ownerUid: user.uid,
    timestamp: serverTimestamp(),
  });
}

export async function getProjectLog(projectId: string): Promise<ActivityLogEntry[]> {
  const user = requireUser();
  try {
    const q = query(
      logRef,
      where('ownerUid', '==', user.uid),
      where('projectId', '==', projectId),
      orderBy('timestamp', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => toEntry(d.id, d.data()));
  } catch {
    // Fallback if composite index doesn't exist — fetch without ordering
    const q = query(
      logRef,
      where('ownerUid', '==', user.uid),
      where('projectId', '==', projectId),
    );
    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map(d => toEntry(d.id, d.data()));
    entries.sort((a, b) => firestoreTimeToMs(b.timestamp) - firestoreTimeToMs(a.timestamp));
    return entries;
  }
}
