import { useMemo, useState, useEffect } from 'react';
import { useProjects, useCreateProject, useToggleProjectStatus, useDeleteProject } from '../../hooks/useProjects';
import { useTasks, useUpdateTask, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { useIsMobile } from '../../hooks/useViewport';
import type { Project, Task } from '../../types';
import { TaskEditPanel } from '../shared/TaskEditPanel';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
} from '../shared/collapsedTaskMeta';
import { SideDrawer } from '../shared/SideDrawer';

interface ProjectListViewProps {
  onOpenProject: (id: string) => void;
}

const PROJECT_TASK_DRAG_TYPE = 'project-task-id';

export function ProjectListView({ onOpenProject }: ProjectListViewProps) {
  const isMobile = useIsMobile();
  const { data: projects = [], isLoading } = useProjects();
  const { data: activeTasks = [] } = useTasks({ status: 'active' });
  const createProject = useCreateProject();
  const toggleStatus = useToggleProjectStatus();
  const deleteProject = useDeleteProject();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();
  const [newName, setNewName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [activeRailFilter, setActiveRailFilter] = useState<'all' | 'unclassified' | 'boulder' | 'rock' | 'pebble'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeProjects = projects.filter(p => p.status === 'active');
  const holdProjects = projects.filter(p => p.status === 'on_hold');

  const unassociatedTasks = useMemo(
    () => activeTasks.filter(task => !task.projectId),
    [activeTasks],
  );

  const displayedRailTasks = useMemo(() => {
    if (activeRailFilter === 'all') return unassociatedTasks;
    return unassociatedTasks.filter(task => task.classification === activeRailFilter);
  }, [activeRailFilter, unassociatedTasks]);

  const taskCountsByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of activeTasks) {
      if (!task.projectId) continue;
      counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
    }
    return counts;
  }, [activeTasks]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProject.mutate({ name: newName.trim() });
    setNewName('');
    setShowInput(false);
  };

  const handleAssignTask = (taskId: string, projectId: string) => {
    updateTask.mutate({ id: taskId, data: { projectId } });
    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }
  };

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const railContent = (
    <div style={railCardStyle}>
      <div style={railHeaderRowStyle}>
        <div>
          <h2 style={sectionHeaderStyle}>No Project</h2>
          <div style={railHintStyle}>Drag a task onto a project to assign it.</div>
        </div>
        <span style={railCountStyle}>{displayedRailTasks.length}</span>
      </div>

      <div style={filterChipWrapStyle}>
        {(['all', 'unclassified', 'boulder', 'rock', 'pebble'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => setActiveRailFilter(filter)}
            style={{
              ...filterChipStyle,
              ...(activeRailFilter === filter ? activeFilterChipStyle : {}),
            }}
          >
            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {displayedRailTasks.length === 0 && (
        <div style={emptyRailStyle}>
          No matching unassociated tasks.
        </div>
      )}

      <div style={railListStyle}>
        {displayedRailTasks.map(task => (
          <RailTaskCard
            key={task.id}
            task={task}
            isEditing={editingTaskId === task.id}
            onToggleEdit={() => setEditingTaskId(prev => prev === task.id ? null : task.id)}
            onCloseEdit={() => setEditingTaskId(null)}
            onComplete={(id) => completeTask.mutate(id)}
            onIcebox={(id) => iceboxTask.mutate(id)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1380px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {!showInput ? (
          <button onClick={() => setShowInput(true)} style={btnStyle}>+ New Project</button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Project name..."
              autoFocus
              style={newProjectInputStyle}
            />
            <button onClick={handleCreate} style={btnStyle}>Create</button>
            <button onClick={() => { setShowInput(false); setNewName(''); }} style={{ ...btnStyle, borderColor: '#FCEDED', color: '#DC2828' }}>Cancel</button>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setDrawerOpen(true)} style={{ ...btnStyle, marginLeft: 'auto' }}>
            No Project
          </button>
        )}
      </div>

      <div style={summaryStyle}>
        {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
        {' · '}
        {holdProjects.length} on hold
        {' · '}
        {unassociatedTasks.length} task{unassociatedTasks.length !== 1 ? 's' : ''} without a project
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      )}

      {!isLoading && (
        <div style={layoutStyle}>
          <div style={projectsColumnStyle}>
            <div style={projectsPanelStyle}>
              <h2 style={sectionHeaderStyle}>Active Projects</h2>
              {activeProjects.length === 0 && (
                <div style={emptyStyle}>No active projects</div>
              )}
              {activeProjects.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  taskCount={taskCountsByProject.get(project.id) || 0}
                  onOpen={() => onOpenProject(project.id)}
                  onToggle={() => toggleStatus.mutate(project.id)}
                  onDelete={() => deleteProject.mutate(project.id)}
                  onAssignTask={handleAssignTask}
                />
              ))}
            </div>

            <div style={{ ...projectsPanelStyle, marginTop: '20px' }}>
              <h2 style={sectionHeaderStyle}>On Hold</h2>
              {holdProjects.length === 0 && (
                <div style={emptyStyle}>No projects on hold</div>
              )}
              {holdProjects.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  taskCount={taskCountsByProject.get(project.id) || 0}
                  onOpen={() => onOpenProject(project.id)}
                  onToggle={() => toggleStatus.mutate(project.id)}
                  onDelete={() => deleteProject.mutate(project.id)}
                  onAssignTask={handleAssignTask}
                />
              ))}
            </div>
          </div>

          {!isMobile && (
            <div style={railStyle}>
              {railContent}
            </div>
          )}
        </div>
      )}

      {isMobile && (
        <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="No Project">
          {railContent}
        </SideDrawer>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  taskCount,
  onOpen,
  onToggle,
  onDelete,
  onAssignTask,
}: {
  project: Project;
  taskCount: number;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAssignTask: (taskId: string, projectId: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(PROJECT_TASK_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    const taskId = e.dataTransfer.getData(PROJECT_TASK_DRAG_TYPE);
    if (!taskId) return;
    e.preventDefault();
    setIsDragOver(false);
    onAssignTask(taskId, project.id);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      style={{
        ...projectRowStyle,
        ...(isDragOver ? projectRowDragOverStyle : {}),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={onOpen}
          style={projectNameStyle}
        >
          {project.name}
        </div>
        <div style={projectMetaStyle}>
          <span>{taskCount} active task{taskCount !== 1 ? 's' : ''}</span>
          {isDragOver && <span style={{ color: '#EA6657' }}>Drop to assign</span>}
        </div>
      </div>
      <button
        onClick={onToggle}
        style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px' }}
      >
        {project.status === 'active' ? 'Put on Hold' : 'Reactivate'}
      </button>
      {!confirmingDelete ? (
        <button
          onClick={() => setConfirmingDelete(true)}
          style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px', color: '#DC2828', borderColor: '#FCEDED' }}
        >
          Delete
        </button>
      ) : (
        <button
          onClick={onDelete}
          style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px', background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
        >
          Confirm Delete
        </button>
      )}
    </div>
  );
}

function RailTaskCard({
  task,
  isEditing,
  onToggleEdit,
  onCloseEdit,
  onComplete,
  onIcebox,
}: {
  task: Task;
  isEditing: boolean;
  onToggleEdit: () => void;
  onCloseEdit: () => void;
  onComplete: (id: string) => void;
  onIcebox: (id: string) => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(PROJECT_TASK_DRAG_TYPE, task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const prevMeta = formatLastOccurrenceForMeta(task.lastOccurrenceCompletedAt);
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel: formatTaskDeadlineForMeta(task.deadline),
    showRecurrence: !!task.recurrence,
    projectName: null,
    prevCompletedLabel: prevMeta ? `Prev: ${prevMeta}` : null,
    extraTrailing: formatClassification(task.classification),
  });

  return (
    <div style={railTaskCardStyle}>
      <div
        draggable
        onDragStart={handleDragStart}
        style={railTaskInnerStyle}
      >
        <div style={dragHandleStyle}>⠿</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={onToggleEdit} style={railTaskTitleStyle}>
            {task.title}
          </div>
          {collapsedMeta && (
            <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
          )}
        </div>
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
  );
}

function formatClassification(value: Task['classification']) {
  switch (value) {
    case 'boulder': return 'Boulder';
    case 'rock': return 'Rock';
    case 'pebble': return 'Pebble';
    default: return 'Unclassified';
  }
}

function formatLastOccurrenceForMeta(timestamp: unknown): string | null {
  if (!timestamp) return null;
  try {
    const t = timestamp as { seconds?: number };
    const d = t.seconds != null ? new Date(t.seconds * 1000) : new Date(timestamp as string);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase();
  } catch {
    return null;
  }
}

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '24px',
  alignItems: 'flex-start',
  flexWrap: 'nowrap',
};

const projectsColumnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const railStyle: React.CSSProperties = {
  width: '400px',
  flexShrink: 0,
};

const projectsPanelStyle: React.CSSProperties = {
  background: '#F9F7F6',
  border: '1px solid #EFEDEB',
  borderRadius: '16px',
  padding: '18px',
};

const railCardStyle: React.CSSProperties = {
  background: '#F9F7F6',
  border: '1px solid #EFEDEB',
  borderRadius: '16px',
  padding: '18px',
};

const projectRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px 16px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '16px',
  marginBottom: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  transition: 'all 0.15s ease',
};

const projectRowDragOverStyle: React.CSSProperties = {
  borderColor: '#EA6657',
  boxShadow: '0 0 0 3px rgba(255, 122, 122, 0.15)',
  transform: 'translateY(-1px)',
};

const projectNameStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#EA6657',
  cursor: 'pointer',
  textDecoration: 'none',
  marginBottom: '4px',
};

const projectMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
  fontSize: '12px',
  color: '#9ca3af',
};

const railHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '12px',
};

const railHintStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#8b7355',
  lineHeight: '1.4',
};

const railCountStyle: React.CSSProperties = {
  minWidth: '32px',
  height: '32px',
  borderRadius: '999px',
  background: '#fff',
  border: '1px solid #ead9ba',
  color: '#8b7355',
  fontSize: '13px',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const railListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const railTaskCardStyle: React.CSSProperties = {
  border: '1px solid #ead9ba',
  borderRadius: '8px',
  background: '#fff',
};

const railTaskInnerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px 14px',
  cursor: 'grab',
};

const dragHandleStyle: React.CSSProperties = {
  color: '#d1b892',
  fontSize: '16px',
  userSelect: 'none',
  marginTop: '1px',
};

const railTaskTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#1D212B',
  cursor: 'pointer',
  marginBottom: '4px',
};

const summaryStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#6b7280',
  marginBottom: '16px',
  fontStyle: 'italic',
};

const newProjectInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '2px solid #E7E3DF',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  color: '#1D212B',
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
  transition: 'opacity 0.2s ease',
};

const sectionHeaderStyle: React.CSSProperties = {
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

const emptyRailStyle: React.CSSProperties = {
  padding: '20px 8px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '14px',
  textAlign: 'center',
};

const filterChipWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginBottom: '14px',
};

const filterChipStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #ead9ba',
  borderRadius: '999px',
  fontSize: '12px',
  background: '#fff',
  color: '#8b7355',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const activeFilterChipStyle: React.CSSProperties = {
  background: '#EA6657',
  borderColor: '#EA6657',
  color: '#fff',
};
