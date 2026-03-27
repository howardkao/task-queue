import { useState } from 'react';
import { useProjects, useCreateProject, useToggleProjectStatus } from '../../hooks/useProjects';
import type { Project } from '../../types';

interface ProjectListViewProps {
  onOpenProject: (id: string) => void;
}

export function ProjectListView({ onOpenProject }: ProjectListViewProps) {
  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const toggleStatus = useToggleProjectStatus();
  const [newName, setNewName] = useState('');
  const [showInput, setShowInput] = useState(false);

  const activeProjects = projects.filter(p => p.status === 'active');
  const holdProjects = projects.filter(p => p.status === 'on_hold');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProject.mutate({ name: newName.trim() });
    setNewName('');
    setShowInput(false);
  };

  // Count tasks per project — we'll need this from task data
  // For now just show the project list without counts

  return (
    <div style={{ padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
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
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                color: '#1f2937',
              }}
            />
            <button onClick={handleCreate} style={btnStyle}>Create</button>
            <button onClick={() => { setShowInput(false); setNewName(''); }} style={{ ...btnStyle, borderColor: '#fca5a5', color: '#ef4444' }}>Cancel</button>
          </div>
        )}
      </div>

      <div style={{
        fontSize: '14px',
        color: '#6b7280',
        marginBottom: '16px',
        fontStyle: 'italic',
      }}>
        {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
        {' · '}
        {holdProjects.length} on hold
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      )}

      {/* Active Projects */}
      <h2 style={sectionHeaderStyle}>Active Projects</h2>
      {activeProjects.length === 0 && !isLoading && (
        <div style={emptyStyle}>No active projects</div>
      )}
      {activeProjects.map(p => (
        <ProjectRow
          key={p.id}
          project={p}
          onOpen={() => onOpenProject(p.id)}
          onToggle={() => toggleStatus.mutate(p.id)}
        />
      ))}

      {/* On Hold */}
      <h2 style={{ ...sectionHeaderStyle, marginTop: '24px' }}>On Hold</h2>
      {holdProjects.length === 0 && !isLoading && (
        <div style={emptyStyle}>No projects on hold</div>
      )}
      {holdProjects.map(p => (
        <ProjectRow
          key={p.id}
          project={p}
          onOpen={() => onOpenProject(p.id)}
          onToggle={() => toggleStatus.mutate(p.id)}
        />
      ))}
    </div>
  );
}

function ProjectRow({
  project, onOpen, onToggle,
}: {
  project: Project;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '16px',
      marginBottom: '6px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <span
        onClick={onOpen}
        style={{
          fontSize: '15px',
          fontWeight: 700,
          color: '#FF7A7A',
          cursor: 'pointer',
          flex: 1,
          textDecoration: 'none',
        }}
      >
        {project.name}
      </span>
      <button
        onClick={onToggle}
        style={{ ...btnStyle, fontSize: '12px', padding: '4px 10px' }}
      >
        {project.status === 'active' ? 'Put on Hold' : 'Reactivate'}
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  color: '#4b5563',
  fontFamily: 'inherit',
  transition: 'opacity 0.2s ease',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  color: '#9ca3af',
  fontStyle: 'italic',
  fontSize: '14px',
};
