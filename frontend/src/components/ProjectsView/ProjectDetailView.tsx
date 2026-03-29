import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject, useUpdateProject, useToggleProjectStatus, useDeleteProject } from '../../hooks/useProjects';
import { useTasks, useCompleteTask, useCreateTask, useIceboxTask } from '../../hooks/useTasks';
import { useProjectActivityLog } from '../../hooks/useActivityLog';
import { useIsMobile } from '../../hooks/useViewport';
import type { Task, Classification } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';

interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

const PROJECT_DETAIL_TASK_DRAG_TYPE = 'project-detail-task';

export function ProjectDetailView({ projectId, onBack }: ProjectDetailViewProps) {
  const isMobile = useIsMobile();
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const toggleStatus = useToggleProjectStatus();
  const deleteProject = useDeleteProject();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const createTask = useCreateTask();
  const { data: activityLog = [] } = useProjectActivityLog(projectId);

  const { data: projectTasks = [] } = useTasks({ projectId, status: 'active' });
  const { data: completedTasks = [] } = useTasks({ projectId, status: 'completed' });

  const [markdown, setMarkdown] = useState('');
  const [projectName, setProjectName] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<Classification>('pebble');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (project) {
      setMarkdown(project.markdown);
      setProjectName(project.name);
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

  const handleProjectNameChange = useCallback((value: string) => {
    setProjectName(value);
    if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
    nameSaveTimerRef.current = setTimeout(() => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === project?.name) return;
      updateProject.mutate({ id: projectId, data: { name: trimmed } });
    }, 500);
  }, [project?.name, projectId, updateProject]);

  if (isLoading || !project) {
    return (
      <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  const boulders = projectTasks.filter(t => t.classification === 'boulder');
  const rocks = projectTasks.filter(t => t.classification === 'rock');
  const pebbles = projectTasks.filter(t => t.classification === 'pebble');
  const unclassified = projectTasks.filter(t => !t.classification || t.classification === 'unclassified');

  const activityLogSection = (
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
  );

  const rightRail = (
    <div style={{ width: isMobile ? '100%' : '320px', flexShrink: 0 }}>
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
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {(['boulder', 'rock', 'pebble'] as const).map(type => (
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
              {type === 'boulder' ? '🪨 Boulder' : type === 'rock' ? 'Rock' : 'Pebble'}
            </button>
          ))}
        </div>
      </div>

      {/* Boulders */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Boulders</h2>
        {boulders.length === 0 && <div style={emptyTaskStyle}>No boulders yet</div>}
        {boulders.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={(id) => completeTask.mutate(id)}
            onIcebox={(id) => iceboxTask.mutate(id)}
          />
        ))}
      </div>

      {/* Rocks */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Rocks</h2>
        {rocks.length === 0 && <div style={emptyTaskStyle}>No rocks yet</div>}
        {rocks.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={(id) => completeTask.mutate(id)}
            onIcebox={(id) => iceboxTask.mutate(id)}
          />
        ))}
      </div>

      {/* Pebbles */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Pebbles</h2>
        {pebbles.length === 0 && <div style={emptyTaskStyle}>No pebbles yet</div>}
        {pebbles.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={(id) => completeTask.mutate(id)}
            onIcebox={(id) => iceboxTask.mutate(id)}
          />
        ))}
      </div>

      {/* Unclassified */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Unclassified</h2>
        {unclassified.length === 0 && <div style={emptyTaskStyle}>No unclassified tasks</div>}
        {unclassified.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={(id) => completeTask.mutate(id)}
            onIcebox={(id) => iceboxTask.mutate(id)}
          />
        ))}
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
          <div style={{ marginTop: '8px' }}>
            {completedTasks.length === 0 && (
              <div style={emptyTaskStyle}>No completed tasks</div>
            )}
            {completedTasks.map(t => (
              <div key={t.id} style={completedTaskStyle}>
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
        Tasks can be generated via assistant workflows.<br />
        "What should I work on next for this project?"
      </div>
    </div>
  );

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
        <span>{projectName || project.name}</span>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <input
          type="text"
          value={projectName}
          onChange={e => handleProjectNameChange(e.target.value)}
          placeholder="Project name"
          style={projectNameInputStyle}
        />
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {project.status === 'active' ? 'Active' : 'On Hold'}
        </span>
        <button onClick={() => toggleStatus.mutate(projectId)} style={btnSmStyle}>
          {project.status === 'active' ? 'Put on Hold' : 'Reactivate'}
        </button>
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            style={{ ...btnSmStyle, color: '#ef4444', borderColor: '#fca5a5' }}
          >
            Delete Project
          </button>
        ) : (
          <button
            onClick={() => deleteProject.mutate(projectId, { onSuccess: onBack })}
            style={{ ...btnSmStyle, background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
          >
            Confirm Delete
          </button>
        )}
      </div>

      {/* Split layout */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Markdown editor */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <textarea
            value={markdown}
            onChange={e => handleMarkdownChange(e.target.value)}
            placeholder="Write your project notes here... plans, goals, context, links, anything."
            style={editorStyle}
          />
        </div>

        {rightRail}
      </div>

      {activityLogSection}
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onIcebox,
}: {
  task: Task;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const deadlineStr = task.deadline ? formatDeadline(task.deadline) : null;
  const typeStyles = getTaskTypeStyles(task.classification);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(PROJECT_DETAIL_TASK_DRAG_TYPE, task.id);
    e.dataTransfer.setData(`${PROJECT_DETAIL_TASK_DRAG_TYPE}-classification`, task.classification);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{ marginBottom: '6px' }}>
      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          ...taskRowCardStyle,
          borderColor: typeStyles.border,
          background: typeStyles.bg,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '10px 12px',
          cursor: 'grab',
        }}
      >
        <span
          style={{ ...taskDragHandleStyle, color: typeStyles.handle }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => setEditing(prev => !prev)}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#1f2937',
              fontWeight: 500,
              borderBottom: editing ? '1px dashed #FF7A7A' : '1px dashed transparent',
            }}
          >
            {task.title}
          </div>
          {(task.recurrence || deadlineStr) && (
            <div style={taskRowMetaStyle}>
              {task.recurrence && <span style={{ marginRight: '4px' }}>↻</span>}
              {deadlineStr && <span style={{ color: '#FF6B6B' }}>⚑ {deadlineStr}</span>}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <TaskEditPanel
          task={task}
          onClose={() => setEditing(false)}
          onComplete={onComplete}
          onIcebox={onIcebox}
        />
      )}
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

const projectNameInputStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#1f2937',
  border: '1px solid transparent',
  borderRadius: '10px',
  background: 'transparent',
  padding: '4px 8px',
  marginLeft: '-8px',
  fontFamily: 'inherit',
  outline: 'none',
  minWidth: '280px',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6b7280', marginBottom: '8px', fontWeight: 600,
};

const emptyTaskStyle: React.CSSProperties = {
  padding: '8px 4px', color: '#9ca3af', fontStyle: 'italic', fontSize: '13px',
};

const taskDragHandleStyle: React.CSSProperties = {
  fontSize: '16px',
  userSelect: 'none',
  flexShrink: 0,
  marginTop: '1px',
};

const taskRowMetaStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '2px',
};

const taskRowCardStyle: React.CSSProperties = {
  border: '2px dashed #e5e7eb',
  borderRadius: '12px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const completedTaskStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  marginBottom: '6px',
};

const editorStyle: React.CSSProperties = {
  width: '100%', minHeight: '400px', padding: '16px 20px',
  border: '2px solid #e5e7eb', borderRadius: '16px', background: '#fff',
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: '14px', lineHeight: '1.7', color: '#1f2937',
  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

function getTaskTypeStyles(classification: Task['classification']) {
  if (classification === 'boulder') {
    return { border: '#FFB3B3', bg: '#fff', handle: '#FFB3B3' };
  }
  if (classification === 'rock') {
    return { border: '#d7b27a', bg: '#fff', handle: '#d7b27a' };
  }
  return { border: '#e5e7eb', bg: '#fff', handle: '#d1d5db' };
}
