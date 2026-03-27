import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject, useUpdateProject, useToggleProjectStatus } from '../../hooks/useProjects';
import { useTasks, useCompleteTask, useCreateTask } from '../../hooks/useTasks';
import { useProjectActivityLog } from '../../hooks/useActivityLog';
import type { Task, Classification } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';

interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

export function ProjectDetailView({ projectId, onBack }: ProjectDetailViewProps) {
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const toggleStatus = useToggleProjectStatus();
  const completeTask = useCompleteTask();
  const createTask = useCreateTask();
  const { data: activityLog = [] } = useProjectActivityLog(projectId);

  const { data: projectTasks = [] } = useTasks({ projectId, status: 'active' });
  const { data: completedTasks = [] } = useTasks({ projectId, status: 'completed' });

  const [markdown, setMarkdown] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<Classification>('pebble');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (project) {
      setMarkdown(project.markdown);
    }
  }, [project?.id]);

  const handleMarkdownChange = useCallback((value: string) => {
    setMarkdown(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateProject.mutate({ id: projectId, data: { markdown: value } });
    }, 1000);
  }, [projectId, updateProject]);

  const handleAddTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate({
      title: newTaskTitle.trim(),
      classification: newTaskType,
      projectId,
    });
    setNewTaskTitle('');
  }, [newTaskTitle, newTaskType, projectId, createTask]);

  if (isLoading || !project) {
    return (
      <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  const boulders = projectTasks.filter(t => t.classification === 'boulder');
  const pebbles = projectTasks.filter(t => t.classification === 'pebble');

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>
        <span
          onClick={onBack}
          style={{ color: '#FF7A7A', cursor: 'pointer', textDecoration: 'none', fontWeight: 600 }}
        >
          ← Projects
        </span>
        {' / '}
        <span>{project.name}</span>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>
          {project.name}
        </h1>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {project.status === 'active' ? 'Active' : 'On Hold'}
        </span>
        <button onClick={() => toggleStatus.mutate(projectId)} style={btnSmStyle}>
          {project.status === 'active' ? 'Put on Hold' : 'Reactivate'}
        </button>
      </div>

      {/* Split layout */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Markdown editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            value={markdown}
            onChange={e => handleMarkdownChange(e.target.value)}
            placeholder="Write your project notes here... plans, goals, context, links, anything."
            style={editorStyle}
          />

          {/* Activity Log */}
          <div style={{ marginTop: '16px' }}>
            <div
              onClick={() => setShowLog(!showLog)}
              style={{
                cursor: 'pointer', color: '#6b7280', fontSize: '14px',
                userSelect: 'none', fontWeight: 600,
              }}
            >
              Activity Log ({activityLog.length}) {showLog ? '▲' : '▼'}
            </div>
            {showLog && (
              <div style={{
                marginTop: '8px', background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: '16px', padding: '8px 0', maxHeight: '300px', overflow: 'auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                {activityLog.length === 0 && (
                  <div style={{ padding: '12px 16px', color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>
                    No activity yet
                  </div>
                )}
                {activityLog.map(entry => (
                  <div key={entry.id} style={{
                    padding: '6px 16px', borderBottom: '1px solid #f3f4f6',
                    display: 'flex', gap: '8px', alignItems: 'baseline',
                  }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap', minWidth: '70px' }}>
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#4b5563' }}>
                      {entry.description}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tasks sidebar */}
        <div style={{ width: '320px', flexShrink: 0 }}>
          {/* Add task */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              <input
                type="text"
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                placeholder="Add a task..."
                style={{
                  flex: 1, padding: '6px 10px', border: '2px solid #e5e7eb',
                  borderRadius: '12px', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                  color: '#1f2937',
                }}
              />
              <button onClick={handleAddTask} style={btnSmStyle}>Add</button>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['boulder', 'pebble'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setNewTaskType(type)}
                  style={{
                    ...btnSmStyle,
                    background: newTaskType === type ? '#FF7A7A' : '#f9fafb',
                    color: newTaskType === type ? '#fff' : '#4b5563',
                    borderColor: newTaskType === type ? '#FF7A7A' : '#e5e7eb',
                    textTransform: 'capitalize',
                    fontWeight: 700,
                  }}
                >
                  {type === 'boulder' ? '🪨 Boulder' : 'Pebble'}
                </button>
              ))}
            </div>
          </div>

          {/* Boulders */}
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Boulders</h2>
            <div style={cardStyle}>
              {boulders.length === 0 && <div style={emptyTaskStyle}>No boulders yet</div>}
              {boulders.map(t => (
                <TaskRow key={t.id} task={t} onComplete={() => completeTask.mutate(t.id)} />
              ))}
            </div>
          </div>

          {/* Pebbles */}
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Pebbles</h2>
            <div style={cardStyle}>
              {pebbles.length === 0 && <div style={emptyTaskStyle}>No pebbles yet</div>}
              {pebbles.map(t => (
                <TaskRow key={t.id} task={t} onComplete={() => completeTask.mutate(t.id)} />
              ))}
            </div>
          </div>

          {/* Completed */}
          <div style={{ marginBottom: '16px' }}>
            <div
              onClick={() => setShowCompleted(!showCompleted)}
              style={{ cursor: 'pointer', color: '#6b7280', fontSize: '14px', userSelect: 'none' }}
            >
              Completed ({completedTasks.length}) {showCompleted ? '▲' : '▼'}
            </div>
            {showCompleted && (
              <div style={{ ...cardStyle, marginTop: '8px' }}>
                {completedTasks.length === 0 && (
                  <div style={emptyTaskStyle}>No completed tasks</div>
                )}
                {completedTasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderBottom: '1px solid #f3f4f6',
                  }}>
                    <div style={{
                      width: '16px', height: '16px',
                      background: '#FF7A7A', border: '2px solid #FF7A7A',
                      borderRadius: '6px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', color: '#fff',
                    }}>✓</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '14px', textDecoration: 'line-through', color: '#9ca3af' }}>
                        {t.title}
                      </span>
                      {t.completedAt && (
                        <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                          {formatTimestamp(t.completedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hint */}
          <div style={{
            marginTop: '12px', fontSize: '12px', color: '#9ca3af',
            fontStyle: 'italic', lineHeight: '1.5',
          }}>
            Tasks are generated via Claude conversations.<br />
            "What should I work on next for this project?"
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: () => void }) {
  const [editing, setEditing] = useState(false);
  const deadlineStr = task.deadline ? formatDeadline(task.deadline) : null;
  return (
    <div style={{ borderBottom: '1px solid #f3f4f6' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 10px',
      }}>
        <div
          onClick={onComplete}
          style={{
            width: '16px', height: '16px', border: '2px solid #d1d5db',
            borderRadius: '6px', flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
            transition: 'all 0.2s ease',
          }}
          title="Complete"
        />
        <span
          onClick={() => setEditing(!editing)}
          style={{
            fontSize: '14px', flex: 1, color: '#1f2937', cursor: 'pointer',
            borderBottom: editing ? '1px dashed #FF7A7A' : '1px dashed transparent',
          }}
          title="Click to edit"
        >
          {task.title}
        </span>
        {task.recurrence && (
          <span style={{ fontSize: '11px', color: '#6b7280' }}>↻</span>
        )}
        {deadlineStr && (
          <span style={{ fontSize: '12px', color: '#FF6B6B' }}>⚑ {deadlineStr}</span>
        )}
      </div>
      {editing && <TaskEditPanel task={task} onClose={() => setEditing(false)} />}
    </div>
  );
}

function formatDeadline(deadline: string): string {
  try {
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const btnSmStyle: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: '12px',
  background: '#f9fafb', cursor: 'pointer', fontSize: '12px',
  fontWeight: 600, color: '#4b5563', fontFamily: 'inherit',
  transition: 'opacity 0.2s ease',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6b7280', marginBottom: '8px', fontWeight: 600,
};

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '4px 0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const emptyTaskStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#9ca3af', fontStyle: 'italic', fontSize: '13px',
};

const editorStyle: React.CSSProperties = {
  width: '100%', minHeight: '400px', padding: '16px 20px',
  border: '2px solid #e5e7eb', borderRadius: '16px', background: '#fff',
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: '14px', lineHeight: '1.7', color: '#1f2937',
  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};
