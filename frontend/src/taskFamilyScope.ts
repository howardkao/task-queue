import type { Investment, Project, Task } from './types';

/** Whether the task should appear on the Family planner (derived from task + linked project). */
export function isTaskVisibleOnFamily(task: Task, project: Project | undefined): boolean {
  if (task.excludeFromFamily) return false;
  if (task.familyPinned) return true;
  if (project?.familyVisible) return true;
  return false;
}

/** v2: Whether the task should appear on the Family planner (derived from task + linked investment). */
export function isTaskVisibleOnFamilyV2(task: Task, investment: Investment | undefined): boolean {
  if (task.excludeFromFamily) return false;
  if (task.familyPinned) return true;
  if (investment?.familyVisible) return true;
  return false;
}
