import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Task } from '../../types';
import { useUpdateTask } from '../../hooks/useTasks';
import { useToast } from './Toast';
import { getTaskCreatorUid, getTaskResponsibleUids, isSharedTask } from '../../taskPolicy';

const FAMILY_CTX = { familyVisible: true as const };

export interface TaskSharingStateModalProps {
  task: Task;
  onClose: () => void;
  familyVisibleParent: boolean;
  viewerUid: string;
}

export function TaskSharingStateModal({
  task,
  onClose,
  familyVisibleParent,
  viewerUid,
}: TaskSharingStateModalProps) {
  const updateTask = useUpdateTask();
  const { showToast } = useToast();

  const shared = familyVisibleParent && isSharedTask(task, FAMILY_CTX);
  const creatorUid = getTaskCreatorUid(task);
  const iAmCreator = !!viewerUid && creatorUid === viewerUid;
  const responsible = getTaskResponsibleUids(task);
  const iAmResponsible = !!viewerUid && responsible.includes(viewerUid);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not update task';
    showToast(msg, 'error');
  };

  const handleExcludeToggle = (exclude: boolean) => {
    updateTask.mutate(
      {
        id: task.id,
        data: {
          excludeFromFamily: exclude,
          familyPinned: false,
        },
      },
      { onError },
    );
  };

  const toggleResponsible = () => {
    if (!viewerUid) return;
    const next = iAmResponsible
      ? responsible.filter((uid) => uid !== viewerUid)
      : [...responsible, viewerUid];
    updateTask.mutate(
      { id: task.id, data: { responsibleUids: next, assigneeUids: next } },
      { onError },
    );
  };

  const modal = (
    <div
      role="presentation"
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-sharing-modal-title"
        className={cn(
          'w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-lg',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 flex items-start justify-between gap-3">
          <h2 id="task-sharing-modal-title" className="text-base font-semibold m-0">
            Sharing & responsibility
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 text-[13px]">
          <p className="text-muted-foreground m-0 leading-relaxed">
            {shared
              ? 'This task is visible in family planning. You can say whether you are responsible for doing it.'
              : 'This task is private to its creator. It does not appear in the family list.'}
          </p>

          {iAmCreator && familyVisibleParent && (
            <label
              className={cn(
                'flex items-center gap-2 min-h-9 px-3 py-2 rounded-lg cursor-pointer',
                'bg-secondary',
              )}
            >
              <input
                type="checkbox"
                checked={task.excludeFromFamily === true}
                onChange={(e) => handleExcludeToggle(e.target.checked)}
                disabled={updateTask.isPending}
                className="rounded border-input"
              />
              <span className="font-medium">Don&apos;t share with family</span>
            </label>
          )}

          {!iAmCreator && familyVisibleParent && (
            <p className="text-muted-foreground m-0 text-[12px] leading-relaxed">
              Only the task creator can change whether this task is shared with the family.
            </p>
          )}

          {shared && (
            <div className="rounded-lg border border-input bg-background px-3 py-3 space-y-2">
              <div className="text-[11px] font-medium text-foreground">Responsible</div>
              <p className="text-muted-foreground m-0 text-[12px] leading-relaxed">
                {responsible.length === 0
                  ? 'Unclaimed — anyone in the family can take it.'
                  : iAmResponsible
                    ? responsible.length === 1
                      ? 'You are responsible.'
                      : 'You are among those responsible.'
                    : 'Someone else has claimed responsibility. You can still add yourself if you are helping.'}
              </p>
              <button
                type="button"
                onClick={toggleResponsible}
                disabled={!viewerUid || updateTask.isPending}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
                  'text-[12px] font-medium text-foreground hover:bg-secondary transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                {iAmResponsible ? 'I am no longer responsible' : 'I am responsible'}
              </button>
            </div>
          )}

          {!shared && (
            <p className="text-muted-foreground m-0 text-[12px] leading-relaxed">
              For private tasks, the creator is implicitly responsible; there is no separate claim step.
            </p>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'w-full h-9 rounded-md text-[13px] font-medium',
                'bg-secondary text-foreground hover:bg-secondary/80',
              )}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
