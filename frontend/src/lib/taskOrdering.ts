import { getMeSortOrder } from '../api/tasks';
import { firestoreTimeToMs } from './firestoreTime';
import type { Investment, PlannerScope, Task } from '../types';
import { getTaskCreatorUid, isFamilyInvestment, isSharedTask } from '../taskPolicy';

type PrivatePlacement = Task['privatePlacementByUser'][string];

export function getTaskOrderForScope(
  task: Task,
  scope: PlannerScope,
  uid: string,
  investment?: Investment,
): number {
  if (scope === 'family') return task.sortOrderFamily || 0;
  if (isSharedTask(task, investment)) return task.sortOrderFamily || 0;
  return uid ? getMeSortOrder(task, uid) : (task.sortOrder || 0);
}

export function sortTasksForScope(tasks: Task[], scope: PlannerScope, uid: string, investment?: Investment): Task[] {
  if (scope === 'me' && investment && isFamilyInvestment(investment)) {
    return mergeFamilyInvestmentTasks(tasks, uid, investment);
  }
  return [...tasks].sort((a, b) => {
    const orderDiff = getTaskOrderForScope(a, scope, uid, investment) - getTaskOrderForScope(b, scope, uid, investment);
    if (orderDiff !== 0) return orderDiff;
    return firestoreTimeToMs(a.createdAt) - firestoreTimeToMs(b.createdAt);
  });
}

export function sortTasksWithinInvestments(
  tasks: Task[],
  investments: Investment[],
  scope: PlannerScope,
  uid: string,
): Task[] {
  const investmentById = new Map(investments.map((investment) => [investment.id, investment]));
  const investmentRanks = new Map(investments.map((investment, index) => [investment.id, investment.rank ?? (index + 1) * 1000]));
  const byInvestment = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const key = task.investmentId;
    if (!byInvestment.has(key)) byInvestment.set(key, []);
    byInvestment.get(key)!.push(task);
  }

  const orderedKeys = [...byInvestment.keys()].sort((a, b) => {
    const aRank = a ? (investmentRanks.get(a) ?? Number.MAX_SAFE_INTEGER) : -1;
    const bRank = b ? (investmentRanks.get(b) ?? Number.MAX_SAFE_INTEGER) : -1;
    return aRank - bRank;
  });

  const result: Task[] = [];
  for (const key of orderedKeys) {
    const group = byInvestment.get(key) ?? [];
    const investment = key ? investmentById.get(key) : undefined;
    result.push(...sortTasksForScope(group, scope, uid, investment));
  }
  return result;
}

export function getPrivatePlacementForUser(task: Task, uid: string): PrivatePlacement | null {
  if (!uid) return null;
  return task.privatePlacementByUser[uid] ?? null;
}

function comparePrivateTasksInSameGap(a: Task, b: Task, uid: string): number {
  const aPlacement = getPrivatePlacementForUser(a, uid);
  const bPlacement = getPrivatePlacementForUser(b, uid);
  const orderDiff = (aPlacement?.order ?? getMeSortOrder(a, uid)) - (bPlacement?.order ?? getMeSortOrder(b, uid));
  if (orderDiff !== 0) return orderDiff;
  return firestoreTimeToMs(a.createdAt) - firestoreTimeToMs(b.createdAt);
}

function getGapKey(afterSharedTaskId: string | null, beforeSharedTaskId: string | null): string {
  return `${afterSharedTaskId ?? '__start'}|${beforeSharedTaskId ?? '__end'}`;
}

function resolvePrivateGap(
  task: Task,
  sharedOrder: Task[],
  uid: string,
): { afterSharedTaskId: string | null; beforeSharedTaskId: string | null } {
  const placement = getPrivatePlacementForUser(task, uid);
  if (!placement) {
    return {
      afterSharedTaskId: sharedOrder.length > 0 ? sharedOrder[sharedOrder.length - 1]!.id : null,
      beforeSharedTaskId: null,
    };
  }

  const sharedIds = sharedOrder.map((sharedTask) => sharedTask.id);
  const afterIndex = placement.afterSharedTaskId ? sharedIds.indexOf(placement.afterSharedTaskId) : -1;
  const beforeIndex = placement.beforeSharedTaskId ? sharedIds.indexOf(placement.beforeSharedTaskId) : sharedIds.length;

  if (placement.afterSharedTaskId && afterIndex >= 0 && (!placement.beforeSharedTaskId || beforeIndex < 0 || afterIndex < beforeIndex)) {
    return {
      afterSharedTaskId: placement.afterSharedTaskId,
      beforeSharedTaskId: placement.beforeSharedTaskId && beforeIndex >= 0 ? placement.beforeSharedTaskId : null,
    };
  }

  if (placement.beforeSharedTaskId && beforeIndex >= 0) {
    return {
      afterSharedTaskId: beforeIndex > 0 ? sharedIds[beforeIndex - 1]! : null,
      beforeSharedTaskId: placement.beforeSharedTaskId,
    };
  }

  return {
    afterSharedTaskId: sharedOrder.length > 0 ? sharedOrder[sharedOrder.length - 1]!.id : null,
    beforeSharedTaskId: null,
  };
}

export function mergeFamilyInvestmentTasks(tasks: Task[], uid: string, investment: Investment): Task[] {
  if (!isFamilyInvestment(investment)) return sortTasksForScope(tasks, 'me', uid);

  const sharedTasks = tasks
    .filter((task) => isSharedTask(task, investment))
    .sort((a, b) => {
      const orderDiff = (a.sortOrderFamily || 0) - (b.sortOrderFamily || 0);
      if (orderDiff !== 0) return orderDiff;
      return firestoreTimeToMs(a.createdAt) - firestoreTimeToMs(b.createdAt);
    });

  const privateTasks = tasks
    .filter((task) => !isSharedTask(task, investment) && getTaskCreatorUid(task) === uid);

  if (sharedTasks.length === 0) {
    return [...privateTasks].sort((a, b) => comparePrivateTasksInSameGap(a, b, uid));
  }

  const privateByGap = new Map<string, Task[]>();
  for (const task of privateTasks) {
    const gap = resolvePrivateGap(task, sharedTasks, uid);
    const key = getGapKey(gap.afterSharedTaskId, gap.beforeSharedTaskId);
    if (!privateByGap.has(key)) privateByGap.set(key, []);
    privateByGap.get(key)!.push(task);
  }
  for (const [, group] of privateByGap) {
    group.sort((a, b) => comparePrivateTasksInSameGap(a, b, uid));
  }

  const merged: Task[] = [];
  const firstSharedId = sharedTasks[0]!.id;
  merged.push(...(privateByGap.get(getGapKey(null, firstSharedId)) ?? []));

  for (let i = 0; i < sharedTasks.length; i++) {
    const sharedTask = sharedTasks[i]!;
    merged.push(sharedTask);
    const nextSharedId = sharedTasks[i + 1]?.id ?? null;
    merged.push(...(privateByGap.get(getGapKey(sharedTask.id, nextSharedId)) ?? []));
  }

  return merged;
}

export function computeSharedOrderUpdates(tasks: Task[], investment: Investment): Array<{ id: string; sortOrder: number }> {
  return tasks
    .filter((task) => isSharedTask(task, investment))
    .map((task, index) => ({ id: task.id, sortOrder: (index + 1) * 1000 }));
}

export function computePrivatePlacementUpdates(
  tasks: Task[],
  uid: string,
  investment: Investment,
): Array<{
  id: string;
  afterSharedTaskId: string | null;
  beforeSharedTaskId: string | null;
  order: number;
}> {
  if (!isFamilyInvestment(investment)) return [];

  const nextSharedIdByIndex = new Array<string | null>(tasks.length).fill(null);
  let nextSharedId: string | null = null;
  for (let i = tasks.length - 1; i >= 0; i--) {
    nextSharedIdByIndex[i] = nextSharedId;
    if (isSharedTask(tasks[i]!, investment)) {
      nextSharedId = tasks[i]!.id;
    }
  }

  let previousSharedId: string | null = null;
  const privateByGap = new Map<string, Task[]>();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    if (isSharedTask(task, investment)) {
      previousSharedId = task.id;
      continue;
    }
    if (getTaskCreatorUid(task) !== uid) continue;
    const beforeSharedTaskId = nextSharedIdByIndex[i];
    const key = getGapKey(previousSharedId, beforeSharedTaskId);
    if (!privateByGap.has(key)) privateByGap.set(key, []);
    privateByGap.get(key)!.push(task);
  }

  const updates: Array<{
    id: string;
    afterSharedTaskId: string | null;
    beforeSharedTaskId: string | null;
    order: number;
  }> = [];

  for (const [key, group] of privateByGap) {
    const [afterSharedTaskIdRaw, beforeSharedTaskIdRaw] = key.split('|');
    const afterSharedTaskId = afterSharedTaskIdRaw === '__start' ? null : afterSharedTaskIdRaw;
    const beforeSharedTaskId = beforeSharedTaskIdRaw === '__end' ? null : beforeSharedTaskIdRaw;
    group.forEach((task, index) => {
      updates.push({
        id: task.id,
        afterSharedTaskId,
        beforeSharedTaskId,
        order: (index + 1) * 1000,
      });
    });
  }

  return updates;
}

export function haveSameTaskIds(source: Task[], ordered: Task[]): boolean {
  if (source.length !== ordered.length) return false;
  const sourceIds = new Set(source.map((task) => task.id));
  return ordered.every((task) => sourceIds.has(task.id));
}

export function mergeTasksPreservingOrder(source: Task[], ordered: Task[]): Task[] {
  const latestById = new Map(source.map((task) => [task.id, task]));
  return ordered.map((task) => latestById.get(task.id) ?? task);
}
