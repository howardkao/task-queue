import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInvestment, useUpdateInvestment, useSetInvestmentStatus, useDeleteInvestment } from '../../hooks/useInvestments';
import { useInitiatives, useCreateInitiative } from '../../hooks/useInitiatives';
import { useTasksByInvestment, useCompleteTask, useCreateTask, useIceboxTask } from '../../hooks/useTasks';
import { useIsMobile } from '../../hooks/useViewport';
import { useAuth } from '../../hooks/useAuth';
import { reorderPrivateTaskPlacements, reorderTasks as reorderTasksApi } from '../../api/tasks';
import {
  computePrivatePlacementUpdates,
  computeSharedOrderUpdates,
  haveSameTaskIds,
  mergeTasksPreservingOrder,
  sortTasksForScope,
} from '../../lib/taskOrdering';
import type { Task, TaskSize } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import { isFamilyInvestment, isTaskVisibleInFamily, isTaskVisibleInMe } from '../../taskPolicy';

interface InvestmentDetailViewProps {
  investmentId: string;
  onBack: () => void;
}

export function InvestmentDetailView({ investmentId, onBack }: InvestmentDetailViewProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: investment, isLoading } = useInvestment(investmentId);
  const updateInvestment = useUpdateInvestment();
  const setStatus = useSetInvestmentStatus();
  const deleteInvestment = useDeleteInvestment();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const createTask = useCreateTask();
  const { data: initiatives = [] } = useInitiatives(investmentId);
  const createInitiative = useCreateInitiative();
  const { data: tasks = [] } = useTasksByInvestment(investmentId);

  const [markdown, setMarkdown] = useState('');
  const [investmentName, setInvestmentName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSize, setNewTaskSize] = useState<TaskSize>('M');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);
  const [dragState, setDragState] = useState<{ section: 'vital' | 'other'; index: number } | null>(null);
  const [dropGap, setDropGap] = useState<{ section: 'vital' | 'other'; index: number } | null>(null);
  const [newInitName, setNewInitName] = useState('');
  const [showInitInput, setShowInitInput] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = user?.uid ?? '';
  const visibleTasks = useMemo(() => {
    if (!investment) return [];
    return tasks.filter((task) =>
      isTaskVisibleInFamily(task, investment) || isTaskVisibleInMe(task, investment, uid),
    );
  }, [investment, tasks, uid]);
  const orderedTasks = useMemo(() => sortTasksForScope(visibleTasks, 'me', uid, investment ?? undefined), [visibleTasks, uid, investment]);
  const displayTasks = localOrder || orderedTasks;

  useEffect(() => {
    if (investment) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
      setMarkdown(investment.markdown);
      setInvestmentName(investment.name);
    }
  }, [investment]);

  useEffect(() => {
    setExpandedTaskId(null);
  }, [investmentId]);

  useEffect(() => {
    if (!localOrder || dragState !== null) return;
    if (!haveSameTaskIds(orderedTasks, localOrder)) {
      setLocalOrder(null);
      return;
    }
    setLocalOrder((current) => {
      if (!current) return current;
      const merged = mergeTasksPreservingOrder(orderedTasks, current);
      const changed = merged.some((task, index) => task !== current[index]);
      return changed ? merged : current;
    });
  }, [dragState, localOrder, orderedTasks]);

  const handleMarkdownChange = useCallback(
    (value: string) => {
      setMarkdown(value);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateInvestment.mutate({ id: investmentId, data: { markdown: value } });
      }, 1000);
    },
    [investmentId, updateInvestment],
  );

  const handleNameChange = useCallback(
    (value: string) => {
      setInvestmentName(value);
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
      nameSaveTimerRef.current = setTimeout(() => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === investment?.name) return;
        updateInvestment.mutate({ id: investmentId, data: { name: trimmed } });
      }, 500);
    },
    [investment?.name, investmentId, updateInvestment],
  );

  const handleAddTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate({
      title: newTaskTitle.trim(),
      size: newTaskSize,
      investmentId,
    });
    setNewTaskTitle('');
  }, [newTaskTitle, newTaskSize, investmentId, createTask]);

  const handleAddInitiative = useCallback(() => {
    if (!newInitName.trim()) return;
    createInitiative.mutate({ name: newInitName.trim(), investmentId });
    setNewInitName('');
    setShowInitInput(false);
  }, [newInitName, investmentId, createInitiative]);

  const vitalTasks = useMemo(() => displayTasks.filter((task) => task.vital), [displayTasks]);
  const otherTasks = useMemo(() => displayTasks.filter((task) => !task.vital), [displayTasks]);

  const persistSectionOrder = useCallback(async (sectionTasks: Task[]) => {
    try {
      if (!investment) return;

      if (isFamilyInvestment(investment)) {
        const sharedOrder = computeSharedOrderUpdates(sectionTasks, investment);
        const privatePlacements = computePrivatePlacementUpdates(sectionTasks, uid, investment);

        if (sharedOrder.length > 0) await reorderTasksApi(sharedOrder, 'family');
        if (privatePlacements.length > 0) await reorderPrivateTaskPlacements(privatePlacements);
        return;
      }

      const personalOrder = sectionTasks.map((task, index) => ({
        id: task.id,
        sortOrder: (index + 1) * 1000,
      }));
      if (personalOrder.length > 0) await reorderTasksApi(personalOrder, 'me');
    } catch (error) {
      console.error('Failed to persist investment task order:', error);
    }
  }, [investment, uid]);

  const applySectionReorder = useCallback((sectionTasks: Task[], fromIdx: number, toIdx: number) => {
    const reorderedSection = [...sectionTasks];
    const [moved] = reorderedSection.splice(fromIdx, 1);
    reorderedSection.splice(toIdx, 0, moved);

    const sectionIds = new Set(sectionTasks.map((task) => task.id));
    let nextSectionIndex = 0;
    const merged = displayTasks.map((task) => (
      sectionIds.has(task.id) ? reorderedSection[nextSectionIndex++]! : task
    ));

    setLocalOrder(merged);
    persistSectionOrder(reorderedSection);
  }, [displayTasks, persistSectionOrder]);

  const handleTaskDragStart = useCallback((task: Task, section: 'vital' | 'other', index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData('task-id', task.id);
    e.dataTransfer.setData('task-reorder', `${section}:${index}`);
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ section, index });
  }, []);

  const handleTaskDragOver = useCallback((section: 'vital' | 'other', index: number) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('task-reorder')) return;
    if (!dragState || dragState.section !== section) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropGap({ section, index: e.clientY < midY ? index : index + 1 });
  }, [dragState]);

  const handleTaskDrop = useCallback((section: 'vital' | 'other', sectionTasks: Task[]) => () => {
    if (!dragState || !dropGap || dragState.section !== section || dropGap.section !== section) {
      setDragState(null);
      setDropGap(null);
      return;
    }
    const toIdx = dropGap.index > dragState.index ? dropGap.index - 1 : dropGap.index;
    if (toIdx !== dragState.index) applySectionReorder(sectionTasks, dragState.index, toIdx);
    setDragState(null);
    setDropGap(null);
  }, [applySectionReorder, dragState, dropGap]);

  const handleTaskDragEnd = useCallback(() => {
    setDragState(null);
    setDropGap(null);
  }, []);

  if (isLoading || !investment) {
    return (
      <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>
        <span
          onClick={onBack}
          style={{ color: '#EA6657', cursor: 'pointer', fontWeight: 600 }}
        >
          ← Investments
        </span>
        {' / '}
        <span>{investmentName || investment.name}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={investmentName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Investment name"
          style={nameInputStyle}
        />
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {investment.status === 'active' ? 'Active' : 'On Hold'}
        </span>
        <button type="button" onClick={() => setStatus.mutate({ id: investmentId, status: investment.status === 'active' ? 'on_hold' : 'active' })} style={btnSmStyle}>
          {investment.status === 'active' ? 'Put on Hold' : 'Reactivate'}
        </button>
        <label style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={investment.familyVisible}
            onChange={(e) => updateInvestment.mutate({ id: investmentId, data: { familyVisible: e.target.checked } })}
          />
          Shared with family
        </label>
        {!confirmingDelete ? (
          <button type="button" onClick={() => setConfirmingDelete(true)} style={{ ...btnSmStyle, color: '#DC2828' }}>
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => deleteInvestment.mutate(investmentId, { onSuccess: onBack })}
            style={{ ...btnSmStyle, background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
          >
            Confirm Delete
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Left: markdown + initiatives */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <textarea
            value={markdown}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            placeholder="Notes, goals, context..."
            style={editorStyle}
          />

          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3 style={sectionHeader}>Initiatives</h3>
              {!showInitInput && (
                <button onClick={() => setShowInitInput(true)} style={{ ...btnSmStyle, fontSize: '11px', padding: '2px 8px' }}>+</button>
              )}
            </div>
            {showInitInput && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={newInitName}
                  onChange={e => setNewInitName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddInitiative()}
                  placeholder="Initiative name..."
                  autoFocus
                  style={{ ...nameInputStyle, fontSize: '13px', padding: '6px 10px' }}
                />
                <button onClick={handleAddInitiative} style={btnSmStyle}>Add</button>
                <button onClick={() => { setShowInitInput(false); setNewInitName(''); }} style={{ ...btnSmStyle, color: '#DC2828' }}>Cancel</button>
              </div>
            )}
            {initiatives.length === 0 && !showInitInput && (
              <div style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>No initiatives yet.</div>
            )}
            {initiatives.map(init => (
              <div key={init.id} style={initRowStyle}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{init.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: task rail */}
        <div style={{ width: isMobile ? '100%' : '380px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <input
              type="text"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTask()}
              placeholder="+ Add task..."
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #E7E3DF', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
            <select
              value={newTaskSize}
              onChange={e => setNewTaskSize(e.target.value as TaskSize)}
              style={{ padding: '4px 8px', border: '1px solid #E7E3DF', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit' }}
            >
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
            </select>
          </div>

          {vitalTasks.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={railSectionHeader}>Vital ({vitalTasks.length})</h4>
              {vitalTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  draggable
                  isEditing={expandedTaskId === task.id}
                  isDragging={dragState?.section === 'vital' && vitalTasks[dragState.index]?.id === task.id}
                  showDropBefore={dropGap?.section === 'vital' && vitalTasks.indexOf(task) === dropGap.index}
                  onToggleEdit={() => setExpandedTaskId(prev => prev === task.id ? null : task.id)}
                  onCloseEdit={() => setExpandedTaskId(null)}
                  onComplete={(id) => completeTask.mutate(id)}
                  onIcebox={(id) => iceboxTask.mutate(id)}
                  onDragStart={handleTaskDragStart(task, 'vital', vitalTasks.indexOf(task))}
                  onDragOver={handleTaskDragOver('vital', vitalTasks.indexOf(task))}
                  onDrop={handleTaskDrop('vital', vitalTasks)}
                  onDragEnd={handleTaskDragEnd}
                />
              ))}
              {dragState?.section === 'vital'
                && dropGap?.section === 'vital'
                && dropGap.index === vitalTasks.length
                && dropGap.index !== dragState.index + 1
                && <div style={dropIndicatorLine} />}
            </div>
          )}

          <div>
            <h4 style={railSectionHeader}>Other ({otherTasks.length})</h4>
            {otherTasks.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic', padding: '8px 0' }}>No tasks.</div>
            )}
            {otherTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                draggable
                isEditing={expandedTaskId === task.id}
                isDragging={dragState?.section === 'other' && otherTasks[dragState.index]?.id === task.id}
                showDropBefore={dropGap?.section === 'other' && otherTasks.indexOf(task) === dropGap.index}
                onToggleEdit={() => setExpandedTaskId(prev => prev === task.id ? null : task.id)}
                onCloseEdit={() => setExpandedTaskId(null)}
                onComplete={(id) => completeTask.mutate(id)}
                onIcebox={(id) => iceboxTask.mutate(id)}
                onDragStart={handleTaskDragStart(task, 'other', otherTasks.indexOf(task))}
                onDragOver={handleTaskDragOver('other', otherTasks.indexOf(task))}
                onDrop={handleTaskDrop('other', otherTasks)}
                onDragEnd={handleTaskDragEnd}
              />
            ))}
            {dragState?.section === 'other'
              && dropGap?.section === 'other'
              && dropGap.index === otherTasks.length
              && dropGap.index !== dragState.index + 1
              && <div style={dropIndicatorLine} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  draggable,
  isEditing,
  isDragging,
  showDropBefore,
  onToggleEdit,
  onCloseEdit,
  onComplete,
  onIcebox,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  draggable?: boolean;
  isEditing: boolean;
  isDragging?: boolean;
  showDropBefore?: boolean;
  onToggleEdit: () => void;
  onCloseEdit: () => void;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <>
      {showDropBefore && <div style={dropIndicatorLine} />}
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        style={{
          ...taskRowStyle,
          cursor: 'grab',
          ...(isDragging ? { opacity: 0.45 } : {}),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div onClick={onToggleEdit} style={{ ...taskTitleStyle, flex: 1, minWidth: 0 }}>
            <span>{task.title}</span>
            {task.size && <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>{task.size}</span>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onComplete(task.id);
            }}
            style={completeButtonStyle}
            title="Complete"
          >
            &#10003;
          </button>
        </div>
        {isEditing && (
          <TaskEditPanel
            task={task}
            onClose={onCloseEdit}
            onComplete={onComplete}
            onIcebox={onIcebox}
          />
        )}
      </div>
    </>
  );
}

const nameInputStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '18px',
  fontWeight: 600,
  color: '#1D212B',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  outline: 'none',
  padding: '4px 0',
  fontFamily: 'inherit',
  minWidth: '200px',
};

const editorStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '260px',
  padding: '16px 18px',
  border: '1px solid #E7E3DF',
  borderRadius: '16px',
  fontSize: '14px',
  fontFamily: "'DM Sans', monospace",
  lineHeight: 1.7,
  color: '#1D212B',
  background: '#FBFAF9',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnSmStyle: React.CSSProperties = {
  padding: '4px 12px',
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
};

const sectionHeader: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  fontWeight: 500,
  margin: 0,
};

const railSectionHeader: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  fontWeight: 500,
  marginBottom: '6px',
};

const initRowStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  marginBottom: '6px',
};

const taskRowStyle: React.CSSProperties = {
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  background: '#fff',
  marginBottom: '6px',
};

const taskTitleStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#1D212B',
  cursor: 'pointer',
};

const dropIndicatorLine: React.CSSProperties = {
  height: '3px',
  background: '#EA6657',
  borderRadius: '2px',
  margin: '2px 0',
};

const completeButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  background: 'transparent',
  color: '#9ca3af',
  fontSize: '12px',
  cursor: 'pointer',
  lineHeight: 1,
  marginRight: '8px',
};
