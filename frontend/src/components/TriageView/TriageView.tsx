import { TriageInput } from './TriageInput';
import { TriageCard } from './TriageCard';
import { useInboxTasks, useCreateTask, useClassifyTask, useIceboxTask } from '../../hooks/useTasks';
import type { Classification, RecurrenceRule } from '../../types';

export function TriageView() {
  const { data: inboxTasks = [], isLoading } = useInboxTasks();
  const createTask = useCreateTask();
  const classifyTask = useClassifyTask();
  const iceboxTask = useIceboxTask();

  const handleCapture = (title: string) => {
    createTask.mutate({ title });
  };

  const handleClassify = (id: string, classification: Classification, projectId?: string | null, deadline?: string | null, recurrence?: RecurrenceRule | null) => {
    classifyTask.mutate({ id, classification, projectId, deadline, recurrence });
  };

  const handleDelete = (id: string) => {
    iceboxTask.mutate(id);
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <TriageInput onSubmit={handleCapture} />

      <h2 style={{
        fontSize: '14px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#6b7280',
        marginBottom: '12px',
        fontWeight: 500,
      }}>
        Inbox ({inboxTasks.length} unclassified)
      </h2>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          Loading...
        </div>
      )}

      {!isLoading && inboxTasks.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#9ca3af',
          fontStyle: 'italic',
          fontSize: '14px',
        }}>
          Inbox zero — nothing to triage!
        </div>
      )}

      {inboxTasks.map(task => (
        <TriageCard
          key={task.id}
          task={task}
          onClassify={handleClassify}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
