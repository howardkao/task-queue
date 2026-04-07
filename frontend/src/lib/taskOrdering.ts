import { getMeSortOrder } from '../api/tasks';
import { firestoreTimeToMs } from './firestoreTime';
import type { Investment, PlannerScope, Task } from '../types';

export function getTaskOrderForScope(task: Task, scope: PlannerScope, uid: string): number {
  if (scope === 'family') return task.sortOrderFamily || 0;
  return uid ? getMeSortOrder(task, uid) : (task.sortOrder || 0);
}

export function sortTasksForScope(tasks: Task[], scope: PlannerScope, uid: string): Task[] {
  return [...tasks].sort((a, b) => {
    const orderDiff = getTaskOrderForScope(a, scope, uid) - getTaskOrderForScope(b, scope, uid);
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
  const investmentRanks = new Map(investments.map((investment, index) => [investment.id, investment.rank ?? (index + 1) * 1000]));

  return [...tasks].sort((a, b) => {
    const aRank = a.investmentId ? (investmentRanks.get(a.investmentId) ?? Number.MAX_SAFE_INTEGER) : -1;
    const bRank = b.investmentId ? (investmentRanks.get(b.investmentId) ?? Number.MAX_SAFE_INTEGER) : -1;
    if (aRank !== bRank) return aRank - bRank;

    const orderDiff = getTaskOrderForScope(a, scope, uid) - getTaskOrderForScope(b, scope, uid);
    if (orderDiff !== 0) return orderDiff;

    return firestoreTimeToMs(a.createdAt) - firestoreTimeToMs(b.createdAt);
  });
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
