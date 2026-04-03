import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject, useUpdateProject, useToggleProjectStatus, useDeleteProject } from '../../hooks/useProjects';
import { useTasks, useCompleteTask, useCreateTask, useIceboxTask } from '../../hooks/useTasks';
import { useProjectActivityLog } from '../../hooks/useActivityLog';
import { useIsMobile } from '../../hooks/useViewport';
import type { Classification } from '../../types';
import { ProjectActivitySection } from './ProjectActivitySection';
import { ProjectDetailTaskRail } from './ProjectDetailTaskRail';
import { btnSmStyle, editorStyle, projectNameInputStyle } from './projectDetailStyles';

interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (project) {
      setMarkdown(project.markdown);
      setProjectName(project.name);
    }
  }, [project?.id]);

  useEffect(() => {
    setExpandedTaskId(null);
  }, [projectId]);

  const handleMarkdownChange = useCallback(
    (value: string) => {
      setMarkdown(value);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateProject.mutate({ id: projectId, data: { markdown: value } });
      }, 1000);
    },
    [projectId, updateProject],
  );

  const handleAddTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate({
      title: newTaskTitle.trim(),
      classification: newTaskType,
      projectId,
    });
    setNewTaskTitle('');
  }, [newTaskTitle, newTaskType, projectId, createTask]);

  const handleProjectNameChange = useCallback(
    (value: string) => {
      setProjectName(value);
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
      nameSaveTimerRef.current = setTimeout(() => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === project?.name) return;
        updateProject.mutate({ id: projectId, data: { name: trimmed } });
      }, 500);
    },
    [project?.name, projectId, updateProject],
  );

  if (isLoading || !project) {
    return (
      <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  const boulders = projectTasks.filter((t) => t.classification === 'boulder');
  const rocks = projectTasks.filter((t) => t.classification === 'rock');
  const pebbles = projectTasks.filter((t) => t.classification === 'pebble');
  const unclassified = projectTasks.filter((t) => !t.classification || t.classification === 'unclassified');

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>
        <span
          onClick={onBack}
          style={{ color: '#EA6657', cursor: 'pointer', textDecoration: 'none', fontWeight: 600 }}
        >
          ← Projects
        </span>
        {' / '}
        <span>{projectName || project.name}</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={projectName}
          onChange={(e) => handleProjectNameChange(e.target.value)}
          placeholder="Project name"
          style={projectNameInputStyle}
        />
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {project.status === 'active' ? 'Active' : 'On Hold'}
        </span>
        <button type="button" onClick={() => toggleStatus.mutate(projectId)} style={btnSmStyle}>
          {project.status === 'active' ? 'Put on Hold' : 'Reactivate'}
        </button>
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            style={{ ...btnSmStyle, color: '#DC2828', borderColor: '#FCEDED' }}
          >
            Delete Project
          </button>
        ) : (
          <button
            type="button"
            onClick={() => deleteProject.mutate(projectId, { onSuccess: onBack })}
            style={{ ...btnSmStyle, background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
          >
            Confirm Delete
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'flex-start',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <textarea
            value={markdown}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            placeholder="Write your project notes here... plans, goals, context, links, anything."
            style={editorStyle}
          />
        </div>

        <ProjectDetailTaskRail
          isMobile={isMobile}
          newTaskTitle={newTaskTitle}
          setNewTaskTitle={setNewTaskTitle}
          newTaskType={newTaskType}
          setNewTaskType={setNewTaskType}
          onAddTask={handleAddTask}
          boulders={boulders}
          rocks={rocks}
          pebbles={pebbles}
          unclassified={unclassified}
          onCompleteTask={(id) => completeTask.mutate(id)}
          onIceboxTask={(id) => iceboxTask.mutate(id)}
          showCompleted={showCompleted}
          setShowCompleted={setShowCompleted}
          completedTasks={completedTasks}
          expandedTaskId={expandedTaskId}
          onExpandedTaskIdChange={setExpandedTaskId}
        />
      </div>

      <ProjectActivitySection
        entries={activityLog}
        showLog={showLog}
        onToggle={() => setShowLog(!showLog)}
      />
    </div>
  );
}
