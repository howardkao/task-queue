import type { Investment, Task } from './types';

export function getTaskCreatorUid(task: Pick<Task, 'creatorUid' | 'ownerUid'>): string {
  return task.creatorUid || task.ownerUid || '';
}

export function getTaskResponsibleUids(task: Pick<Task, 'responsibleUids' | 'assigneeUids'>): string[] {
  if (Array.isArray(task.responsibleUids)) return task.responsibleUids;
  if (Array.isArray(task.assigneeUids)) return task.assigneeUids;
  return [];
}

export function isFamilyInvestment(investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  return investment?.familyVisible === true;
}

export function isIndividualInvestment(investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  return !isFamilyInvestment(investment);
}

export function isSharedTask(task: Pick<Task, 'excludeFromFamily' | 'familyPinned'>, investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  if (task.excludeFromFamily) return false;
  if (isFamilyInvestment(investment)) return true;
  return task.familyPinned === true;
}

export function isPrivateTask(task: Pick<Task, 'excludeFromFamily' | 'familyPinned'>, investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  return !isSharedTask(task, investment);
}

export function isUnassignedSharedTask(task: Pick<Task, 'excludeFromFamily' | 'familyPinned' | 'responsibleUids' | 'assigneeUids'>, investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  return isSharedTask(task, investment) && getTaskResponsibleUids(task).length === 0;
}

export function isTaskVisibleInFamily(task: Pick<Task, 'excludeFromFamily' | 'familyPinned'>, investment: Pick<Investment, 'familyVisible'> | undefined): boolean {
  return isSharedTask(task, investment);
}

export function isTaskVisibleInMe(
  task: Pick<Task, 'creatorUid' | 'ownerUid' | 'responsibleUids' | 'assigneeUids' | 'excludeFromFamily' | 'familyPinned'>,
  investment: Pick<Investment, 'familyVisible'> | undefined,
  uid: string,
): boolean {
  if (!uid) return false;
  if (isPrivateTask(task, investment)) {
    return getTaskCreatorUid(task) === uid;
  }
  const responsible = getTaskResponsibleUids(task);
  return responsible.length === 0 || responsible.includes(uid);
}
