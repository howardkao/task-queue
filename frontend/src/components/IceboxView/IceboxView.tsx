import { useState } from 'react';
import { useIceboxedTasks, useReactivateTask, useDeleteTask } from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';
import type { Task, Classification } from '../../types';

export function IceboxView() {
  const { data: tasks = [], isLoading } = useIceboxedTasks();
  const reactivateTask = useReactivateTask();
  const deleteTask = useDeleteTask();
  const { data: projects = [] } = useProjects('active');
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const boulders = tasks.filter(t => t.classification === 'boulder');
  const rocks = tasks.filter(t => t.classification === 'rock');
  const pebbles = tasks.filter(t => t.classification === 'pebble');
  const unclassified = tasks.filter(t => t.classification === 'unclassified');

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

      {boulders.length > 0 && (
        <>
          <h3 style={groupHeader}>Boulders</h3>
          {boulders.map(t => (
            <IceboxCard key={t.id} task={t} projectMap={projectMap} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}

      {rocks.length > 0 && (
        <>
          <h3 style={groupHeader}>Rocks</h3>
          {rocks.map(t => (
            <IceboxCard key={t.id} task={t} projectMap={projectMap} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}

      {pebbles.length > 0 && (
        <>
          <h3 style={groupHeader}>Pebbles</h3>
          {pebbles.map(t => (
            <IceboxCard key={t.id} task={t} projectMap={projectMap} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}

      {unclassified.length > 0 && (
        <>
          <h3 style={groupHeader}>Unclassified</h3>
          {unclassified.map(t => (
            <IceboxCard key={t.id} task={t} projectMap={projectMap} onReactivate={reactivateTask} onDelete={deleteTask} />
          ))}
        </>
      )}
    </div>
  );
}

function IceboxCard({ task, projectMap, onReactivate, onDelete }: {
  task: Task;
  projectMap: Map<string, string>;
  onReactivate: { mutate: (args: { id: string; classification: Classification }) => void };
  onDelete: { mutate: (id: string) => void };
}) {
  const [confirming, setConfirming] = useState(false);
  const projectName = task.projectId ? projectMap.get(task.projectId) : null;

  return (
    <div style={cardStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1D212B' }}>{task.title}</div>
        {projectName && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{projectName}</div>
        )}
        {task.notes && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{task.notes}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => onReactivate.mutate({ id: task.id, classification: 'boulder' })}
          style={actionBtn}
          title="Reactivate as boulder"
        >
          🪨
        </button>
        <button
          onClick={() => onReactivate.mutate({ id: task.id, classification: 'rock' })}
          style={actionBtn}
          title="Reactivate as rock"
        >
          Rock
        </button>
        <button
          onClick={() => onReactivate.mutate({ id: task.id, classification: 'pebble' })}
          style={actionBtn}
          title="Reactivate as pebble"
        >
          Pebble
        </button>
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
  borderRadius: '12px',
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
