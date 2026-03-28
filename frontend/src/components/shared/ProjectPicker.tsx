import { useEffect, useMemo, useState } from 'react';

export interface ProjectPickerProject {
  id: string;
  name: string;
  status?: 'active' | 'on_hold';
  updatedAt?: any;
}

interface ProjectPickerProps {
  projects: ProjectPickerProject[];
  value: string;
  onChange: (projectId: string) => void;
  onCreateProject?: (name: string) => Promise<ProjectPickerProject>;
}

const RECENT_PROJECTS_KEY = 'task-queue-recent-projects';
const RECENT_INACTIVE_LIMIT = 2;

function readRecentProjectIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecentProjectIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(ids.slice(0, 12)));
  } catch {
    // Ignore localStorage failures.
  }
}

function rememberProject(id: string) {
  if (!id) return;
  const next = [id, ...readRecentProjectIds().filter(existing => existing !== id)];
  writeRecentProjectIds(next);
}

function getTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value.seconds) return value.seconds * 1000;
  if (value.toDate) return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortProjects(projects: ProjectPickerProject[]) {
  return [...projects].sort((a, b) => {
    if ((a.status || 'active') !== (b.status || 'active')) {
      return (a.status || 'active') === 'active' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function ProjectPicker({ projects, value, onChange, onCreateProject }: ProjectPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const projectMap = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const selectedProject = value ? projectMap.get(value) ?? null : null;

  useEffect(() => {
    setQuery(selectedProject?.name ?? '');
  }, [selectedProject?.id, selectedProject?.name]);

  const allProjects = useMemo(() => sortProjects(projects), [projects]);
  const activeProjects = useMemo(
    () => allProjects.filter(project => (project.status || 'active') === 'active'),
    [allProjects],
  );

  const recentInactiveProjects = useMemo(() => {
    const recentIds = readRecentProjectIds();
    const inactiveMap = new Map(
      allProjects
        .filter(project => (project.status || 'active') !== 'active')
        .map(project => [project.id, project]),
    );

    const orderedRecent = recentIds
      .map(id => inactiveMap.get(id))
      .filter((project): project is ProjectPickerProject => Boolean(project));

    const fallback = [...inactiveMap.values()]
      .filter(project => !recentIds.includes(project.id))
      .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));

    return [...orderedRecent, ...fallback].slice(0, RECENT_INACTIVE_LIMIT);
  }, [allProjects]);

  const defaultProjects = useMemo(() => {
    const seen = new Set<string>();
    const options: ProjectPickerProject[] = [];

    for (const project of [...activeProjects, ...recentInactiveProjects]) {
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      options.push(project);
    }

    if (selectedProject && !seen.has(selectedProject.id)) {
      options.unshift(selectedProject);
    }

    return options;
  }, [activeProjects, recentInactiveProjects, selectedProject]);

  const trimmedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return defaultProjects;

    return allProjects.filter(project => project.name.toLowerCase().includes(trimmedQuery));
  }, [allProjects, defaultProjects, trimmedQuery]);

  const hasExactMatch = useMemo(
    () => allProjects.some(project => project.name.trim().toLowerCase() === trimmedQuery),
    [allProjects, trimmedQuery],
  );

  const handleSelect = (projectId: string) => {
    onChange(projectId);
    if (projectId) rememberProject(projectId);
    setIsOpen(false);
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || !onCreateProject || isCreating) return;

    setIsCreating(true);
    try {
      const project = await onCreateProject(name);
      rememberProject(project.id);
      onChange(project.id);
      setQuery(project.name);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px' }}
      onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
    >
      <input
        type="text"
        value={query}
        placeholder="Search or create a project..."
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
          }
          if (e.key === 'Enter' && trimmedQuery && !hasExactMatch && onCreateProject) {
            e.preventDefault();
            void handleCreate();
          }
        }}
        style={pickerInputStyle}
      />

      {isOpen && (
        <div style={menuStyle}>
          <button type="button" onMouseDown={() => handleSelect('')} style={menuItemStyle}>
            No project
          </button>

          {trimmedQuery
            ? <div style={sectionLabelStyle}>Matches</div>
            : <div style={sectionLabelStyle}>Active and Recent</div>}

          {searchResults.length === 0 && (
            <div style={emptyStyle}>No matching projects.</div>
          )}

          {searchResults.map(project => (
            <button
              key={project.id}
              type="button"
              onMouseDown={() => handleSelect(project.id)}
              style={{
                ...menuItemStyle,
                ...(project.id === value ? selectedMenuItemStyle : {}),
              }}
            >
              <span>{project.name}</span>
              {(project.status || 'active') !== 'active' && (
                <span style={statusPillStyle}>On Hold</span>
              )}
            </button>
          ))}

          {trimmedQuery && !hasExactMatch && onCreateProject && (
            <>
              <div style={sectionLabelStyle}>Create</div>
              <button
                type="button"
                onMouseDown={() => { void handleCreate(); }}
                style={createItemStyle}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : `Create "${query.trim()}"`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const pickerInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '12px',
  background: '#fff',
  fontFamily: 'inherit',
  color: '#4b5563',
  boxSizing: 'border-box',
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 30,
  maxHeight: '240px',
  overflowY: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  background: '#fff',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
  padding: '6px',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#9ca3af',
  padding: '8px 8px 4px',
  fontWeight: 700,
};

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  borderRadius: '8px',
  padding: '8px',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: '12px',
  color: '#374151',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

const selectedMenuItemStyle: React.CSSProperties = {
  background: '#fff1f1',
  color: '#b91c1c',
};

const createItemStyle: React.CSSProperties = {
  ...menuItemStyle,
  fontWeight: 600,
  color: '#b91c1c',
};

const statusPillStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#6b7280',
  background: '#f3f4f6',
  borderRadius: '999px',
  padding: '2px 6px',
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  padding: '8px',
  fontSize: '12px',
  color: '#9ca3af',
  fontStyle: 'italic',
};
