import { useState } from 'react';
import { useInvestments, useCreateInvestment, useSetInvestmentStatus, useDeleteInvestment } from '../../hooks/useInvestments';
import { useTasks, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { useIsMobile } from '../../hooks/useViewport';
import type { Investment, Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';

interface InvestmentListViewProps {
  onOpenInvestment: (id: string) => void;
}

export function InvestmentListView({ onOpenInvestment }: InvestmentListViewProps) {
  const isMobile = useIsMobile();
  const { data: investments = [], isLoading } = useInvestments();
  const { data: activeTasks = [] } = useTasks({ status: 'active' });
  const createInvestment = useCreateInvestment();
  const setStatus = useSetInvestmentStatus();
  const deleteInvestment = useDeleteInvestment();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const [newName, setNewName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const activeInvestments = investments.filter(i => i.status === 'active');
  const holdInvestments = investments.filter(i => i.status === 'on_hold');

  const taskCountsByInvestment = new Map<string, number>();
  const unassignedTasks: Task[] = [];
  for (const task of activeTasks) {
    if (!task.investmentId) {
      unassignedTasks.push(task);
      continue;
    }
    taskCountsByInvestment.set(task.investmentId, (taskCountsByInvestment.get(task.investmentId) || 0) + 1);
  }

  const handleCreate = () => {
    if (!newName.trim()) return;
    createInvestment.mutate({ name: newName.trim() });
    setNewName('');
    setShowInput(false);
  };

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
              {activeInvestments.map(inv => (
                <InvestmentRow
                  key={inv.id}
                  investment={inv}
                  taskCount={taskCountsByInvestment.get(inv.id) || 0}
                  onOpen={() => onOpenInvestment(inv.id)}
                  onToggle={() => setStatus.mutate({ id: inv.id, status: 'on_hold' })}
                  onDelete={() => deleteInvestment.mutate(inv.id)}
                />
              ))}
            </div>

            {holdInvestments.length > 0 && (
              <div style={{ ...panelStyle, marginTop: '20px' }}>
                <h2 style={sectionHeader}>On Hold</h2>
                {holdInvestments.map(inv => (
                  <InvestmentRow
                    key={inv.id}
                    investment={inv}
                    taskCount={taskCountsByInvestment.get(inv.id) || 0}
                    onOpen={() => onOpenInvestment(inv.id)}
                    onToggle={() => setStatus.mutate({ id: inv.id, status: 'active' })}
                    onDelete={() => deleteInvestment.mutate(inv.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: unassigned tasks */}
          <div style={{ width: isMobile ? '100%' : '340px', flexShrink: 0 }}>
            <div style={panelStyle}>
              <h2 style={sectionHeader}>Unassigned Tasks ({unassignedTasks.length})</h2>
              {unassignedTasks.length === 0 && (
                <div style={emptyStyle}>All tasks are assigned to investments</div>
              )}
              {unassignedTasks.map(task => (
                <div key={task.id} style={unassignedTaskRowStyle}>
                  <div
                    onClick={() => setExpandedTaskId(prev => prev === task.id ? null : task.id)}
                    style={unassignedTaskTitleStyle}
                  >
                    <span>{task.title}</span>
                    {task.size && <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>{task.size}</span>}
                  </div>
                  {expandedTaskId === task.id && (
                    <TaskEditPanel
                      task={task}
                      onClose={() => setExpandedTaskId(null)}
                      onComplete={(id) => completeTask.mutate(id)}
                      onIcebox={(id) => iceboxTask.mutate(id)}
                    />
                  )}
                </div>
              ))}
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
  onOpen,
  onToggle,
  onDelete,
}: {
  investment: Investment;
  taskCount: number;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={onOpen} style={nameStyle}>{investment.name}</div>
        <div style={metaStyle}>
          {taskCount} active task{taskCount !== 1 ? 's' : ''}
          {investment.familyVisible && <span> · Family visible</span>}
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
