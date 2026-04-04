import type { PlannerScope } from './types';

function prefix(scope: PlannerScope): string {
  return scope === 'me' ? 'me' : 'family';
}

export function plannerStorageKey(scope: PlannerScope, key: string): string {
  return `${prefix(scope)}_${key}`;
}

/** Read planner localStorage; migrates legacy `today_*` keys into `me_*` once. */
export function readPlannerStorage(scope: PlannerScope, key: string): string | null {
  const k = plannerStorageKey(scope, key);
  let v = localStorage.getItem(k);
  if (v === null && scope === 'me') {
    const legacy = localStorage.getItem(`today_${key}`);
    if (legacy !== null) {
      localStorage.setItem(k, legacy);
      v = legacy;
    }
  }
  return v;
}

export function writePlannerStorage(scope: PlannerScope, key: string, value: string): void {
  localStorage.setItem(plannerStorageKey(scope, key), value);
}
