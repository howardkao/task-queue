import { useState } from 'react';
import { useIceboxedTasks, useReactivateTask, useDeleteTask } from '../../hooks/useTasks';
import type { Task, TaskSize } from '../../types';
import { listCardTitleStyle } from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';

export function IceboxView() {
  const { data: tasks = [], isLoading } = useIceboxedTasks();
  const reactivateTask = useReactivateTask();
  const deleteTask = useDeleteTask();
  const vitalTasks = tasks.filter(t => t.vital);
  const otherTasks = tasks.filter(t => !t.vital && t.size != null);
  const unsizedTasks = tasks.filter(t => t.size == null);

  return (
    <div style={{ padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={sectionHeader}>
        Icebox ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
      </h2>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: '#9ca3af', fontStyle: 'italic', fontSize: '14px',
        }}>
          Nothing on ice.
        </div>
      )}

      {vitalTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Vital</h3>
          {vitalTasks.map(t => (
            <IceboxCard key={t.id} task={t} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}

      {otherTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Other</h3>
          {otherTasks.map(t => (
            <IceboxCard key={t.id} task={t} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}

      {unsizedTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Unsized</h3>
          {unsizedTasks.map(t => (
            <IceboxCard key={t.id} task={t} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}
    </div>
  );
}

function IceboxCard({ task, onReactivate, onDelete }: {
  task: Task;
  onReactivate: { mutate: (args: { id: string; size?: TaskSize }) => void };
  onDelete: { mutate: (id: string) => void };
}) {
  const [confirming, setConfirming] = useState(false);
  const deadlineLabel = formatTaskDeadlineForMeta(task.deadline);
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel,
    showRecurrence: !!task.recurrence,
    prevCompletedLabel: null,
  });

  return (
    <div style={cardStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={listCardTitleStyle}>{task.title}</span>
          {task.size && <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>{task.size}</span>}
        </div>
        {collapsedMeta && (
          <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {(['S', 'M', 'L'] as const).map(s => (
          <button
            key={s}
            onClick={() => onReactivate.mutate({ id: task.id, size: s })}
            style={actionBtn}
            title={`Reactivate as ${s}`}
          >
            {s}
          </button>
        ))}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ ...actionBtn, color: '#DC2828', borderColor: '#FCEDED' }}
            title="Delete permanently"
          >
            Delete
          </button>
        ) : (
          <button
            onClick={() => { onDelete.mutate(task.id); setConfirming(false); }}
            style={{ ...actionBtn, background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 500,
};

const groupHeader: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  fontWeight: 400,
  marginTop: '16px',
  marginBottom: '8px',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 14px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  marginBottom: '6px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const actionBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  background: '#F2F0ED',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};
