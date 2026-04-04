import type { Project, Task } from './types';

/** Whether the task should appear on the Family planner (derived from task + linked project). */
export function isTaskVisibleOnFamily(task: Task, project: Project | undefined): boolean {
  if (task.excludeFromFamily) return false;
  if (task.familyPinned) return true;
  if (project?.familyVisible) return true;
  return false;
}
