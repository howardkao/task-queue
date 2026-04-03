import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firestoreTimeToMs } from '@/lib/firestoreTime';
import type { FirestoreTimestampLike } from '@/types';

export interface ProjectPickerProject {
  id: string;
  name: string;
  status?: 'active' | 'on_hold';
  updatedAt?: FirestoreTimestampLike;
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
      .sort((a, b) => firestoreTimeToMs(b.updatedAt) - firestoreTimeToMs(a.updatedAt));

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
      className="relative min-w-[200px] flex-1"
      onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
    >
      {/* Input Field */}
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder="Search or create project..."
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
          className={cn(
            "w-full h-8 px-3 pr-8 text-[13px] rounded-md",
            "bg-card border border-input text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring",
            "transition-all duration-150"
          )}
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full left-0 right-0 mt-1 z-50",
            "max-h-56 overflow-y-auto",
            "bg-popover border border-border rounded-lg shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-150"
          )}
        >
          <div className="p-1">
            {/* No Project Option */}
            <button
              type="button"
              onMouseDown={() => handleSelect('')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-left",
                "text-muted-foreground hover:bg-secondary hover:text-foreground",
                "transition-colors duration-150"
              )}
            >
              No project
            </button>

            {/* Section Label */}
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {trimmedQuery ? 'Matches' : 'Active & Recent'}
            </div>

            {/* Results */}
            {searchResults.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-muted-foreground italic">
                No matching projects.
              </div>
            ) : (
              searchResults.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onMouseDown={() => handleSelect(project.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[13px] text-left",
                    "transition-colors duration-150",
                    project.id === value
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {project.id === value && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>{project.name}</span>
                  </span>
                  {(project.status || 'active') !== 'active' && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      On Hold
                    </span>
                  )}
                </button>
              ))
            )}

            {/* Create Option */}
            {trimmedQuery && !hasExactMatch && onCreateProject && (
              <>
                <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Create
                </div>
                <button
                  type="button"
                  onMouseDown={() => { void handleCreate(); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-left",
                    "text-primary font-medium hover:bg-primary/10",
                    "transition-colors duration-150"
                  )}
                  disabled={isCreating}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isCreating ? 'Creating...' : `Create "${query.trim()}"`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
