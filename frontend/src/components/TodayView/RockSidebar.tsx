import { useState, useCallback, useEffect } from 'react';
import type { Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { useProjects } from '../../hooks/useProjects';
import { useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderPebbles as reorderTasksApi, type PebbleReorderContext } from '../../api/tasks';
import {
  listCardStyle as cardStyle,
  listPlacedCardStyle as placedCardStyle,
  listCardInnerStyle as cardInner,
  listCardTitleStyle as titleStyle,
} from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';
import { formatLastCompletedLabel } from '@/lib/firestoreTime';

interface PlacedTaskInfo {
  startHour: number;
  duration: number;
  date: string;
}

interface RockSidebarProps {
  rocks: Task[];
  placedBoulders: Record<string, PlacedTaskInfo>;
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
  reorderContext?: PebbleReorderContext;
}

export function RockSidebar({
  rocks,
  placedBoulders,
  expandedTaskId,
  onExpandedTaskIdChange,
  reorderContext = 'me',
}: RockSidebarProps) {
  const placedIds = Object.keys(placedBoulders);
  const { data: projects = [] } = useProjects('active');
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayRocks = localOrder || rocks;

  const persistOrder = useCallback(async (newList: Task[]) => {
    const order = newList.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 }));
    try {
      await reorderTasksApi(order, reorderContext);
    } catch (e) {
      console.error('Failed to persist rock order:', e);
    }
  }, [reorderContext]);

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayRocks];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayRocks, persistOrder]);


  const handleDragStart = (e: React.DragEvent, rock: Task, index: number) => {
    e.dataTransfer.setData('boulder-id', rock.id);
    e.dataTransfer.setData('boulder-reorder', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragFromIndex(index);
  };

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes('boulder-reorder')) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropGapIndex(e.clientY < midY ? index : index + 1);
  }, []);

  const handleDropOnCard = useCallback(() => {
    if (dragFromIndex === null || dropGapIndex === null) {
      setDropGapIndex(null);
      setDragFromIndex(null);
      return;
    }
    const toIdx = dropGapIndex > dragFromIndex ? dropGapIndex - 1 : dropGapIndex;
    if (toIdx !== dragFromIndex) applyReorder(dragFromIndex, toIdx);
    setDropGapIndex(null);
    setDragFromIndex(null);
  }, [dragFromIndex, dropGapIndex, applyReorder]);

  useEffect(() => {
    if (!localOrder || dragFromIndex !== null) return;

    if (!haveSameTaskIds(rocks, localOrder)) {
      setLocalOrder(null);
      return;
    }

    setLocalOrder((current) => {
      if (!current) return current;
      const merged = mergeTasksPreservingOrder(rocks, current);
      const changed = merged.some((task, index) => task !== current[index]);
      return changed ? merged : current;
    });
  }, [dragFromIndex, localOrder, rocks]);

  return (
    <div>
      <h2 style={sectionHeader}>Drag Rocks to Calendar</h2>

      {displayRocks.length === 0 && (
        <div style={emptyStyle}>No rocks available.</div>
      )}

      {displayRocks.map((rock, index) => {
        const isEditing = expandedTaskId === rock.id;
        const isPlaced = placedIds.includes(rock.id);
        const projectName = rock.projectId ? projectMap.get(rock.projectId) : null;
        const deadlineStr = formatTaskDeadlineForMeta(rock.deadline);
        const prevStr = rock.lastOccurrenceCompletedAt
          ? `Prev: ${formatLastCompletedLabel(rock.lastOccurrenceCompletedAt)}`
          : null;
        const collapsedMeta = formatCollapsedTaskMetaLine({
          deadlineLabel: deadlineStr,
          showRecurrence: !!rock.recurrence,
          projectName: projectName ?? null,
          prevCompletedLabel: prevStr,
        });
        const showGapBefore = dragFromIndex !== null && dropGapIndex === index && dropGapIndex !== dragFromIndex && dropGapIndex !== dragFromIndex + 1;

        return (
          <div key={rock.id}>
            {showGapBefore && <div style={dropIndicatorLine} />}
            <div
              data-task-row-id={rock.id}
              draggable
              onDragStart={(e) => handleDragStart(e, rock, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={() => setDropGapIndex(null)}
              onDrop={handleDropOnCard}
              onDragEnd={() => { setDragFromIndex(null); setDropGapIndex(null); }}
              style={{
                ...cardStyle,
                cursor: 'grab',
                ...(isPlaced ? placedCardStyle : {}),
                ...(dragFromIndex === index ? { opacity: 0.4 } : {}),
              }}
            >
              <div style={cardInner}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                }}>
                  <span style={{ ...dragHandle, color: isPlaced ? '#E7E3DF' : '#EFEDEB' }}>⠿</span>
                  </div>
                  <div
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => onExpandedTaskIdChange(isEditing ? null : rock.id)}
                  >
                    <div style={{ ...titleStyle, color: isPlaced ? '#9ca3af' : '#1D212B' }}>
                      {rock.title}
                    </div>
                    {collapsedMeta && (
                      <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
                    )}
                  </div>
              </div>
              {isEditing && (
                <TaskEditPanel
                  task={rock}
                  onClose={() => onExpandedTaskIdChange(null)}
                  onComplete={(id) => completeTask.mutate(id)}
                  onIcebox={(id) => iceboxTask.mutate(id)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 500,
};

const emptyStyle: React.CSSProperties = {
  padding: '20px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '14px',
  textAlign: 'center',
};

const dropIndicatorLine: React.CSSProperties = {
  height: '3px',
  background: '#c08457',
  borderRadius: '2px',
  margin: '2px 0',
};

const dragHandle: React.CSSProperties = {
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};

function haveSameTaskIds(source: Task[], ordered: Task[]): boolean {
  if (source.length !== ordered.length) return false;
  const sourceIds = new Set(source.map(task => task.id));
  return ordered.every(task => sourceIds.has(task.id));
}

function mergeTasksPreservingOrder(source: Task[], ordered: Task[]): Task[] {
  const latestById = new Map(source.map(task => [task.id, task]));
  return ordered.map(task => latestById.get(task.id) ?? task);
}
