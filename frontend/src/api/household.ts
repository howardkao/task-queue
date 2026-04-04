import {
  collection,
  doc,
  getDoc,
  writeBatch,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const usersRef = collection(db, 'users');
const householdsRef = collection(db, 'households');
const tasksRef = collection(db, 'tasks');
const projectsRef = collection(db, 'projects');

const BATCH_SIZE = 400;

/**
 * Returns the signed-in user's household id, creating a solo household and
 * backfilling tasks/projects with householdId + assigneeUids when needed.
 */
export async function ensureUserHousehold(uid: string): Promise<string> {
  const userSnap = await getDoc(doc(usersRef, uid));
  const existing = userSnap.exists() ? (userSnap.data().householdId as string | undefined) : undefined;
  if (existing) return existing;

  const householdRef = doc(householdsRef);
  const householdId = householdRef.id;

  const batch1 = writeBatch(db);
  batch1.set(householdRef, {
    memberUids: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch1.set(
    doc(usersRef, uid),
    { householdId, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch1.commit();

  const [legacyTasks, legacyProjects] = await Promise.all([
    getDocs(query(tasksRef, where('ownerUid', '==', uid))),
    getDocs(query(projectsRef, where('ownerUid', '==', uid))),
  ]);

  const taskDocs = legacyTasks.docs.filter((d) => !d.data().householdId);
  for (let i = 0; i < taskDocs.length; i += BATCH_SIZE) {
    const chunk = taskDocs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const d of chunk) {
      const data = d.data();
      const assignees = Array.isArray(data.assigneeUids) && data.assigneeUids.length > 0
        ? data.assigneeUids
        : [uid];
      batch.update(d.ref, {
        householdId,
        assigneeUids: assignees,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  const projectDocs = legacyProjects.docs.filter((d) => !d.data().householdId);
  for (let i = 0; i < projectDocs.length; i += BATCH_SIZE) {
    const chunk = projectDocs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const d of chunk) {
      const data = d.data();
      const assignees = Array.isArray(data.assigneeUids) && data.assigneeUids.length > 0
        ? data.assigneeUids
        : [uid];
      const familyVisible =
        data.familyVisible === true ||
        data.visibility === 'shared';
      batch.update(d.ref, {
        householdId,
        assigneeUids: assignees,
        familyVisible,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return householdId;
}

export async function getUserHouseholdId(uid: string): Promise<string | null> {
  const userSnap = await getDoc(doc(usersRef, uid));
  if (!userSnap.exists()) return null;
  return (userSnap.data().householdId as string) ?? null;
}

export async function getHouseholdMemberUids(householdId: string): Promise<string[]> {
  const h = await getDoc(doc(householdsRef, householdId));
  if (!h.exists()) return [];
  const members = h.data().memberUids;
  return Array.isArray(members) ? [...members] : [];
}
