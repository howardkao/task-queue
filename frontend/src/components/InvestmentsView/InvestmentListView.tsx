import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInvestments, useCreateInvestment, useSetInvestmentStatus, useDeleteInvestment, useReorderInvestments } from '../../hooks/useInvestments';
import { useTasks, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { useIsMobile } from '../../hooks/useViewport';
import { useAuth } from '../../hooks/useAuth';
import type { Investment, Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { sizeBadgeStyle } from '../shared/collapsedTaskMeta';
import { listCardCompleteButtonStyle } from '../shared/listCardStyles';
import { InlineEditableTitle } from '../shared/InlineEditableTitle';
import { onExpandedTaskHeaderBackgroundClick } from '../shared/expandedTaskHeader';
import { isTaskVisibleInMe } from '../../taskPolicy';

interface InvestmentListViewProps {
  onOpenInvestment: (id: string) => void;
}

export function InvestmentListView({ onOpenInvestment }: InvestmentListViewProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data: investments = [], isLoading } = useInvestments();
  const { data: activeTasks = [] } = useTasks({ status: 'active' });
  const createInvestment = useCreateInvestment();
  const setStatus = useSetInvestmentStatus();
  const deleteInvestment = useDeleteInvestment();
  const reorderInvestments = useReorderInvestments();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const [newName, setNewName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [localInvestments, setLocalInvestments] = useState<Investment[] | null>(null);
  const [dragState, setDragState] = useState<{ section: 'active' | 'on_hold'; index: number } | null>(null);
  const [dropGap, setDropGap] = useState<{ section: 'active' | 'on_hold'; index: number } | null>(null);

  const displayInvestments = localInvestments || investments;
  const activeInvestments = useMemo(
    () => displayInvestments.filter((investment) => investment.status === 'active'),
    [displayInvestments],
  );
  const holdInvestments = useMemo(
    () => displayInvestments.filter((investment) => investment.status === 'on_hold'),
    [displayInvestments],
  );

  const investmentById = useMemo(
    () => new Map(investments.map((inv) => [inv.id, inv])),
    [investments],
  );
  const { taskCountsByInvestment, unassignedTasks } = useMemo(() => {
    const counts = new Map<string, number>();
    const unassigned: Task[] = [];
    for (const task of activeTasks) {
      if (!task.investmentId) {
        // Apply visibility: only show tasks visible to the current user
        if (isTaskVisibleInMe(task, undefined, uid)) {
          unassigned.push(task);
        }
        continue;
      }
      const inv = investmentById.get(task.investmentId);
      if (isTaskVisibleInMe(task, inv, uid)) {
        counts.set(task.investmentId, (counts.get(task.investmentId) || 0) + 1);
      }
    }
    return { taskCountsByInvestment: counts, unassignedTasks: unassigned };
  }, [activeTasks, investmentById, uid]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createInvestment.mutate({ name: newName.trim() });
    setNewName('');
    setShowInput(false);
  };

  useEffect(() => {
    if (!localInvestments || dragState !== null) return;
    if (localInvestments.length !== investments.length) {
      setLocalInvestments(null);
      return;
    }
    const latestById = new Map(investments.map((investment) => [investment.id, investment]));
    const merged = localInvestments.map((investment) => latestById.get(investment.id) ?? investment);
    const changed = merged.some((investment, index) => investment !== localInvestments[index]);
    if (changed) setLocalInvestments(merged);
  }, [dragState, investments, localInvestments]);

  const persistInvestmentOrder = useCallback((ordered: Investment[]) => {
    reorderInvestments.mutate(ordered.map((investment, index) => ({
      id: investment.id,
      rank: (index + 1) * 1000,
    })));
  }, [reorderInvestments]);

  const applyInvestmentReorder = useCallback((
    sectionItems: Investment[],
    fromIdx: number,
    toIdx: number,
  ) => {
    const reorderedSection = [...sectionItems];
    const [moved] = reorderedSection.splice(fromIdx, 1);
    reorderedSection.splice(toIdx, 0, moved);

    const sectionIds = new Set(sectionItems.map((investment) => investment.id));
    let nextSectionIndex = 0;
    const merged = displayInvestments.map((investment) => (
      sectionIds.has(investment.id) ? reorderedSection[nextSectionIndex++]! : investment
    ));

    setLocalInvestments(merged);
    persistInvestmentOrder(merged);
    setDragState(null);
    setDropGap(null);
  }, [displayInvestments, persistInvestmentOrder]);

  const handleInvestmentDragStart = useCallback((section: 'active' | 'on_hold', index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData('investment-reorder', `${section}:${index}`);
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ section, index });
  }, []);

  const handleInvestmentDragOver = useCallback((section: 'active' | 'on_hold', index: number) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('investment-reorder')) return;
    if (!dragState || dragState.section !== section) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropGap({ section, index: e.clientY < midY ? index : index + 1 });
  }, [dragState]);

  const handleInvestmentDrop = useCallback((section: 'active' | 'on_hold', sectionItems: Investment[]) => () => {
    if (!dragState || !dropGap || dragState.section !== section || dropGap.section !== section) {
      setDragState(null);
      setDropGap(null);
      return;
    }
    const toIdx = dropGap.index > dragState.index ? dropGap.index - 1 : dropGap.index;
    if (toIdx !== dragState.index) {
      applyInvestmentReorder(sectionItems, dragState.index, toIdx);
      return;
    }
    setDragState(null);
    setDropGap(null);
  }, [applyInvestmentReorder, dragState, dropGap]);

  const handleInvestmentDragEnd = useCallback(() => {
    setDragState(null);
    setDropGap(null);
  }, []);

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {!showInput ? (
          <button onClick={() => setShowInput(true)} style={btnStyle}>+ New Investment</button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Investment name..."
              autoFocus
              style={inputStyle}
            />
            <button onClick={handleCreate} style={btnStyle}>Create</button>
            <button onClick={() => { setShowInput(false); setNewName(''); }} style={{ ...btnStyle, color: '#DC2828' }}>Cancel</button>
          </div>
        )}
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      )}

      {!isLoading && (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
          {/* Left: investment lists */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={panelStyle}>
              <h2 style={sectionHeader}>Active</h2>
              {activeInvestments.length === 0 && <div style={emptyStyle}>No active investments</div>}
              {activeInvestments.map((inv, index) => (
                <div key={inv.id}>
                  {dropGap?.section === 'active' && dropGap.index === index && <div style={dropIndicatorLine} />}
                  <InvestmentRow
                    investment={inv}
                    taskCount={taskCountsByInvestment.get(inv.id) || 0}
                    draggable
                    isDragging={dragState?.section === 'active' && dragState.index === index}
                    onDragStart={handleInvestmentDragStart('active', index)}
                    onDragOver={handleInvestmentDragOver('active', index)}
                    onDrop={handleInvestmentDrop('active', activeInvestments)}
                    onDragEnd={handleInvestmentDragEnd}
                    onOpen={() => onOpenInvestment(inv.id)}
                    onToggle={() => setStatus.mutate({ id: inv.id, status: 'on_hold' })}
                    onDelete={() => deleteInvestment.mutate(inv.id)}
                  />
                </div>
              ))}
              {dropGap?.section === 'active'
                && dropGap.index === activeInvestments.length
                && dragState?.section === 'active'
                && dropGap.index !== dragState.index + 1
                && <div style={dropIndicatorLine} />}
            </div>

            {holdInvestments.length > 0 && (
              <div style={{ ...panelStyle, marginTop: '20px' }}>
                <h2 style={sectionHeader}>On Hold</h2>
                {holdInvestments.map((inv, index) => (
                  <div key={inv.id}>
                    {dropGap?.section === 'on_hold' && dropGap.index === index && <div style={dropIndicatorLine} />}
                    <InvestmentRow
                      investment={inv}
                      taskCount={taskCountsByInvestment.get(inv.id) || 0}
                      draggable
                      isDragging={dragState?.section === 'on_hold' && dragState.index === index}
                      onDragStart={handleInvestmentDragStart('on_hold', index)}
                      onDragOver={handleInvestmentDragOver('on_hold', index)}
                      onDrop={handleInvestmentDrop('on_hold', holdInvestments)}
                      onDragEnd={handleInvestmentDragEnd}
                      onOpen={() => onOpenInvestment(inv.id)}
                      onToggle={() => setStatus.mutate({ id: inv.id, status: 'active' })}
                      onDelete={() => deleteInvestment.mutate(inv.id)}
                    />
                  </div>
                ))}
                {dropGap?.section === 'on_hold'
                  && dropGap.index === holdInvestments.length
                  && dragState?.section === 'on_hold'
                  && dropGap.index !== dragState.index + 1
                  && <div style={dropIndicatorLine} />}
              </div>
            )}
          </div>

          {/* Right: uncategorized tasks */}
          <div style={{ width: isMobile ? '100%' : '340px', flexShrink: 0 }}>
            <div style={panelStyle}>
              <h2 style={sectionHeader}>Uncategorized Tasks ({unassignedTasks.length})</h2>
              {unassignedTasks.length === 0 && (
                <div style={emptyStyle}>All tasks are assigned to investments</div>
              )}
              {unassignedTasks.map(task => {
                const isEditing = expandedTaskId === task.id;
                return (
                  <div key={task.id} style={unassignedTaskRowStyle}>
                    <div
                      style={{ display: 'flex', alignItems: 'center' }}
                      onClick={(e) =>
                        onExpandedTaskHeaderBackgroundClick(e, isEditing, () =>
                          setExpandedTaskId(null),
                        )
                      }
                    >
                      <div
                        onClick={isEditing ? undefined : () => setExpandedTaskId(task.id)}
                        style={{ ...unassignedTaskTitleStyle, flex: 1, minWidth: 0, cursor: isEditing ? undefined : 'pointer' }}
                      >
                        {isEditing ? (
                          <InlineEditableTitle taskId={task.id} initialTitle={task.title} style={unassignedTaskTitleStyle} />
                        ) : (
                          <span>{task.title}</span>
                        )}
                      </div>
                      {task.size && <span style={sizeBadgeStyle}>{task.size}</span>}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeTask.mutate(task.id);
                        }}
                        style={listCardCompleteButtonStyle}
                        title="Complete"
                      >
                        &#10003;
                      </button>
                    </div>
                    {isEditing && (
                      <TaskEditPanel
                        task={task}
                        onClose={() => setExpandedTaskId(null)}
                        onComplete={(id) => completeTask.mutate(id)}
                        onIcebox={(id) => iceboxTask.mutate(id)}
                        seamless
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InvestmentRow({
  investment,
  taskCount,
  draggable,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onOpen,
  onToggle,
  onDelete,
}: {
  investment: Investment;
  taskCount: number;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        ...rowStyle,
        cursor: 'grab',
        ...(isDragging ? { opacity: 0.45 } : {}),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={onOpen} style={nameStyle}>{investment.name}</div>
        <div style={metaStyle}>
          {taskCount} active task{taskCount !== 1 ? 's' : ''}
          {investment.familyVisible && <span> · Shared with family</span>}
        </div>
      </div>
      <button onClick={onToggle} style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px' }}>
        {investment.status === 'active' ? 'Put on Hold' : 'Reactivate'}
      </button>
      {!confirmingDelete ? (
        <button
          onClick={() => setConfirmingDelete(true)}
          style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px', color: '#DC2828' }}
        >
          Delete
        </button>
      ) : (
        <button
          onClick={onDelete}
          style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px', background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
        >
          Confirm
        </button>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#F9F7F6',
  border: '1px solid #EFEDEB',
  borderRadius: '16px',
  padding: '18px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px 16px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '16px',
  marginBottom: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const dropIndicatorLine: React.CSSProperties = {
  height: '3px',
  background: '#EA6657',
  borderRadius: '2px',
  margin: '2px 0 6px',
};

const nameStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#EA6657',
  cursor: 'pointer',
  marginBottom: '4px',
};

const metaStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
};

const sectionHeader: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 500,
};

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '14px',
};

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  border: '1px solid #E7E3DF',
  borderRadius: '12px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '2px solid #E7E3DF',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  color: '#1D212B',
};

const unassignedTaskRowStyle: React.CSSProperties = {
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  background: '#fff',
  marginBottom: '6px',
};

const unassignedTaskTitleStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#1D212B',
  cursor: 'pointer',
};
