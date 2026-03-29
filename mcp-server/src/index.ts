#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  iceboxTask,
  reorderTasks,
} from './tasks.js';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  toggleProjectStatus,
} from './projects.js';

const server = new McpServer({
  name: 'task-queue',
  version: '1.0.0',
});

// ─── Task Tools ───────────────────────────────────────────────

server.tool(
  'add_task',
  'Create a new task. Lands in inbox (unclassified) by default, or specify classification to place directly.',
  {
    title: z.string().describe('Task title'),
    notes: z.string().optional().describe('Optional notes or context'),
    classification: z.enum(['unclassified', 'boulder', 'rock', 'pebble']).optional().describe('Task type. Defaults to unclassified (inbox).'),
    priority: z.enum(['high', 'med', 'low']).optional().describe('Priority level. Defaults to low.'),
    projectId: z.string().optional().describe('Project ID to link this task to'),
    deadline: z.string().optional().describe('Deadline as ISO date string (e.g. "2026-04-01")'),
  },
  async ({ title, notes, classification, priority, projectId, deadline }) => {
    const task = await createTask({ title, notes, classification, priority, projectId, deadline });
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.tool(
  'list_inbox',
  'List all unclassified tasks in the triage inbox.',
  {},
  async () => {
    const tasks = await listTasks({ classification: 'unclassified', status: 'active' });
    return {
      content: [{
        type: 'text',
        text: tasks.length === 0
          ? 'Inbox is empty — nothing to triage.'
          : `${tasks.length} task(s) in inbox:\n\n${tasks.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` — ${t.notes}` : ''} [id: ${t.id}]`).join('\n')}`,
      }],
    };
  }
);

server.tool(
  'classify_task',
  'Classify an inbox task as boulder, rock, or pebble. Optionally assign to a project and set a deadline.',
  {
    taskId: z.string().describe('ID of the task to classify'),
    classification: z.enum(['boulder', 'rock', 'pebble']).describe('Classify as boulder (deep work), rock (medium effort), or pebble (small task)'),
    projectId: z.string().optional().describe('Project ID to link this task to'),
    deadline: z.string().optional().describe('Deadline as ISO date string'),
  },
  async ({ taskId, classification, projectId, deadline }) => {
    const task = await updateTask(taskId, {
      classification,
      projectId: projectId ?? undefined,
      deadline: deadline ?? undefined,
    });
    return {
      content: [{ type: 'text', text: `Classified "${task.title}" as ${classification}${task.projectId ? ` (linked to project)` : ''}.` }],
    };
  }
);

server.tool(
  'search_tasks',
  'Search tasks by title and optionally filter by status or classification. Use this to find task IDs before reading or updating a task.',
  {
    query: z.string().describe('Case-insensitive text to search for in the task title'),
    status: z.enum(['active', 'completed', 'iceboxed']).optional().describe('Optional status filter'),
    classification: z.enum(['unclassified', 'boulder', 'rock', 'pebble']).optional().describe('Optional classification filter'),
    limit: z.number().optional().describe('Maximum number of matches to return (default: 10)'),
  },
  async ({ query, status, classification, limit }) => {
    const normalized = query.trim().toLowerCase();
    const tasks = await listTasks({
      status,
      classification,
    });

    const matches = tasks
      .filter((task) => task.title.toLowerCase().includes(normalized))
      .slice(0, limit ?? 10);

    if (matches.length === 0) {
      return {
        content: [{ type: 'text', text: `No tasks found matching "${query}".` }],
      };
    }

    const text = matches.map((task, index) => (
      `${index + 1}. "${task.title}" [id: ${task.id}]`
      + ` [${task.classification}/${task.status}]`
      + ` [sortOrder: ${task.sortOrder}]`
      + `${task.priority !== 'low' ? ` [${task.priority}]` : ''}`
      + `${task.projectId ? ' [project-linked]' : ''}`
      + `${task.notes ? `\n   Notes: ${task.notes}` : ''}`
    )).join('\n');

    return {
      content: [{ type: 'text', text: `${matches.length} matching task(s):\n\n${text}` }],
    };
  }
);

server.tool(
  'get_task',
  'Get a task\'s full details, including notes/description. Use this before revising a task based on information from another task.',
  {
    taskId: z.string().describe('ID of the task to retrieve'),
  },
  async ({ taskId }) => {
    const task = await getTask(taskId);
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.tool(
  'update_task',
  'Update an existing task. This can replace the notes/description after incorporating context from another task.',
  {
    taskId: z.string().describe('ID of the task to update'),
    title: z.string().optional().describe('Optional new task title'),
    notes: z.string().optional().describe('Optional full replacement for the task notes/description'),
    classification: z.enum(['unclassified', 'boulder', 'rock', 'pebble']).optional().describe('Optional new classification'),
    priority: z.enum(['high', 'med', 'low']).optional().describe('Optional priority level'),
    status: z.enum(['active', 'completed', 'iceboxed']).optional().describe('Optional new status'),
    projectId: z.string().nullable().optional().describe('Optional project link; pass null to clear'),
    deadline: z.string().nullable().optional().describe('Optional ISO date string deadline; pass null to clear'),
    sortOrder: z.number().optional().describe('Optional new sort order value'),
  },
  async ({ taskId, title, notes, classification, priority, status, projectId, deadline, sortOrder }) => {
    const updates: {
      title?: string;
      notes?: string;
      classification?: 'unclassified' | 'boulder' | 'rock' | 'pebble';
      priority?: 'high' | 'med' | 'low';
      status?: 'active' | 'completed' | 'iceboxed';
      projectId?: string | null;
      deadline?: string | null;
      sortOrder?: number;
    } = {};

    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (classification !== undefined) updates.classification = classification;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (projectId !== undefined) updates.projectId = projectId;
    if (deadline !== undefined) updates.deadline = deadline;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    if (Object.keys(updates).length === 0) {
      return {
        content: [{ type: 'text', text: 'No updates provided.' }],
      };
    }

    const task = await updateTask(taskId, updates);
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.tool(
  'reorder_tasks',
  'Reorder tasks in a list. Provide task IDs in the new desired order. This updates their sortOrder values globally.',
  {
    taskIds: z.array(z.string()).describe('List of task IDs in the new order'),
  },
  async ({ taskIds }) => {
    const order = taskIds.map((id, i) => ({ id, sortOrder: (i + 1) * 1000 }));
    await reorderTasks(order);
    return {
      content: [{ type: 'text', text: `Reordered ${taskIds.length} task(s).` }],
    };
  }
);

server.tool(
  'complete_task',
  'Mark a task as completed. If it has a recurrence rule, the next occurrence is auto-generated.',
  {
    taskId: z.string().describe('ID of the task to complete'),
  },
  async ({ taskId }) => {
    const result = await completeTask(taskId);
    let msg = `Completed: "${result.completed.title}"`;
    if (result.nextOccurrence) {
      msg += `\nNext occurrence created: "${result.nextOccurrence.title}" (due ${result.nextOccurrence.deadline || 'no deadline'})`;
    }
    return { content: [{ type: 'text', text: msg }] };
  }
);

server.tool(
  'icebox_task',
  'Icebox a task — removes it from active lists without deleting. Can be retrieved later.',
  {
    taskId: z.string().describe('ID of the task to icebox'),
  },
  async ({ taskId }) => {
    const task = await iceboxTask(taskId);
    return { content: [{ type: 'text', text: `Iceboxed: "${task.title}"` }] };
  }
);

server.tool(
  'list_boulders',
  'List all active boulders (deep work tasks). These are candidates for daily planning.',
  {},
  async () => {
    const tasks = await listTasks({ classification: 'boulder', status: 'active' });
    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'No active boulders.' }] };
    }

    // Group by project
    const standalone = tasks.filter(t => !t.projectId);
    const byProject = new Map<string, typeof tasks>();
    for (const t of tasks.filter(t => t.projectId)) {
      const pid = t.projectId!;
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid)!.push(t);
    }

    let text = `${tasks.length} active boulder(s):\n`;

    if (standalone.length > 0) {
      text += `\nStandalone:\n${standalone.map(t => `  • "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''} [id: ${t.id}]`).join('\n')}`;
    }

    for (const [pid, projectTasks] of byProject) {
      try {
        const project = await getProject(pid);
        text += `\n\n${project.name}:\n${projectTasks.map(t => `  • "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''} [id: ${t.id}]`).join('\n')}`;
      } catch {
        text += `\n\nUnknown project (${pid}):\n${projectTasks.map(t => `  • "${t.title}" [id: ${t.id}]`).join('\n')}`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'list_rocks',
  'List all active rocks (medium-sized tasks). These can also be scheduled on the Today calendar.',
  {},
  async () => {
    const tasks = await listTasks({ classification: 'rock', status: 'active' });
    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'No active rocks.' }] };
    }

    const text = tasks.map((t, i) => (
      `${i + 1}. "${t.title}"`
      + ` [sortOrder: ${t.sortOrder}]`
      + `${t.priority !== 'low' ? ` [${t.priority}]` : ''}`
      + `${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''}`
      + `${t.projectId ? ' [project-linked]' : ' [standalone]'}`
      + ` [id: ${t.id}]`
    )).join('\n');

    return {
      content: [{ type: 'text', text: `${tasks.length} active rock(s):\n\n${text}` }],
    };
  }
);

server.tool(
  'list_pebbles',
  'List active pebbles in priority order. Optionally filter to only stale pebbles (older than N days).',
  {
    staleDays: z.number().optional().describe('Only show pebbles older than this many days'),
    limit: z.number().optional().describe('Max number of pebbles to return (default: all)'),
  },
  async ({ staleDays, limit }) => {
    const tasks = await listTasks({
      classification: 'pebble',
      status: 'active',
      staleThresholdDays: staleDays,
    });

    const limited = limit ? tasks.slice(0, limit) : tasks;

    if (limited.length === 0) {
      return { content: [{ type: 'text', text: staleDays ? `No pebbles older than ${staleDays} days.` : 'No active pebbles.' }] };
    }

    const text = limited.map((t, i) => {
      const age = t.createdAt ? Math.floor((Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : '?';
      return `${i + 1}. "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` ⚑ due ${t.deadline.slice(0, 10)}` : ''} (${age}d old)${t.projectId ? ' [project-linked]' : ''} [id: ${t.id}]`;
    }).join('\n');

    return {
      content: [{ type: 'text', text: `${limited.length} pebble(s)${staleDays ? ` older than ${staleDays} days` : ''}:\n\n${text}` }],
    };
  }
);

// ─── Project Tools ────────────────────────────────────────────

server.tool(
  'list_projects',
  'List all projects with their status.',
  {
    status: z.enum(['active', 'on_hold']).optional().describe('Filter by status'),
  },
  async ({ status }) => {
    const projects = await listProjects(status ? { status } : undefined);
    if (projects.length === 0) {
      return { content: [{ type: 'text', text: 'No projects.' }] };
    }

    const text = projects.map(p =>
      `• ${p.name} [${p.status}] [id: ${p.id}]`
    ).join('\n');

    return { content: [{ type: 'text', text: `${projects.length} project(s):\n\n${text}` }] };
  }
);

server.tool(
  'get_project',
  'Get a project\'s full details: markdown document, associated active tasks, and completed tasks. Use this to understand a project before suggesting next steps.',
  {
    projectId: z.string().describe('Project ID'),
  },
  async ({ projectId }) => {
    const project = await getProject(projectId);
    const activeTasks = await listTasks({ projectId, status: 'active' });
    const completedTasks = await listTasks({ projectId, status: 'completed' });

    const boulders = activeTasks.filter(t => t.classification === 'boulder');
    const rocks = activeTasks.filter(t => t.classification === 'rock');
    const pebbles = activeTasks.filter(t => t.classification === 'pebble');
    const unclassified = activeTasks.filter(t => t.classification === 'unclassified');

    let text = `# ${project.name}\n`;
    text += `Status: ${project.status}\n`;
    text += `\n---\n\n## Project Document\n\n${project.markdown}\n`;

    text += `\n---\n\n## Active Tasks\n`;

    if (boulders.length > 0) {
      text += `\nBoulders (${boulders.length}):\n${boulders.map(t => `  • "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''} [id: ${t.id}]`).join('\n')}\n`;
    }
    if (rocks.length > 0) {
      text += `\nRocks (${rocks.length}):\n${rocks.map(t => `  • "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''} [id: ${t.id}]`).join('\n')}\n`;
    }
    if (pebbles.length > 0) {
      text += `\nPebbles (${pebbles.length}):\n${pebbles.map(t => `  • "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` (due ${t.deadline.slice(0, 10)})` : ''} [id: ${t.id}]`).join('\n')}\n`;
    }
    if (unclassified.length > 0) {
      text += `\nUnclassified (${unclassified.length}):\n${unclassified.map(t => `  • "${t.title}" [id: ${t.id}]`).join('\n')}\n`;
    }
    if (activeTasks.length === 0) {
      text += '\nNo active tasks.\n';
    }

    if (completedTasks.length > 0) {
      text += `\n## Completed Tasks (${completedTasks.length})\n`;
      text += completedTasks.map(t =>
        `  ✓ "${t.title}"${t.completedAt ? ` (${new Date(t.completedAt).toLocaleDateString()})` : ''}`
      ).join('\n') + '\n';
    }

    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'create_project',
  'Create a new project with a name and optional initial markdown content.',
  {
    name: z.string().describe('Project name'),
    markdown: z.string().optional().describe('Initial markdown content. Defaults to "# {name}\\n\\n"'),
  },
  async ({ name, markdown }) => {
    const project = await createProject({ name, markdown });
    return { content: [{ type: 'text', text: `Created project: "${project.name}" [id: ${project.id}]` }] };
  }
);

server.tool(
  'update_project',
  'Update a project\'s markdown document, name, or status.',
  {
    projectId: z.string().describe('Project ID'),
    name: z.string().optional().describe('New project name'),
    markdown: z.string().optional().describe('New markdown content (replaces entire document)'),
    status: z.enum(['active', 'on_hold']).optional().describe('New status'),
  },
  async ({ projectId, name, markdown, status }) => {
    const updates: Record<string, string | undefined> = {};
    if (name !== undefined) updates.name = name;
    if (markdown !== undefined) updates.markdown = markdown;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return { content: [{ type: 'text', text: 'No updates provided.' }] };
    }

    const project = await updateProject(projectId, updates);
    return { content: [{ type: 'text', text: `Updated project: "${project.name}" [${project.status}]` }] };
  }
);

// ─── Composite Tools ──────────────────────────────────────────

server.tool(
  'get_today',
  'Get a snapshot of today: active boulders and rocks to choose from, top pebbles, and inbox count. Use this to help with daily planning.',
  {},
  async () => {
    const [boulders, rocks, pebbles, inbox] = await Promise.all([
      listTasks({ classification: 'boulder', status: 'active' }),
      listTasks({ classification: 'rock', status: 'active' }),
      listTasks({ classification: 'pebble', status: 'active' }),
      listTasks({ classification: 'unclassified', status: 'active' }),
    ]);

    let text = '# Today\n\n';

    // Inbox
    if (inbox.length > 0) {
      text += `⚠️ ${inbox.length} task(s) in inbox awaiting triage.\n\n`;
    }

    // Boulders
    text += `## Boulder Candidates (${boulders.length})\n`;
    if (boulders.length === 0) {
      text += 'No active boulders. Consider decomposing a project into boulders.\n';
    } else {
      for (const t of boulders) {
        let line = `• "${t.title}" [sortOrder: ${t.sortOrder}]`;
        if (t.priority !== 'low') line += ` [${t.priority}]`;
        if (t.deadline) line += ` (due ${t.deadline.slice(0, 10)})`;
        if (t.projectId) {
          try {
            const p = await getProject(t.projectId);
            line += ` — ${p.name}`;
          } catch { /* ignore */ }
        } else {
          line += ' — standalone';
        }
        line += ` [id: ${t.id}]`;
        text += line + '\n';
      }
    }

    text += `\n## Rocks (${rocks.length})\n`;
    if (rocks.length === 0) {
      text += 'No active rocks.\n';
    } else {
      for (const t of rocks) {
        let line = `• "${t.title}" [sortOrder: ${t.sortOrder}]`;
        if (t.priority !== 'low') line += ` [${t.priority}]`;
        if (t.deadline) line += ` (due ${t.deadline.slice(0, 10)})`;
        if (t.projectId) {
          try {
            const p = await getProject(t.projectId);
            line += ` — ${p.name}`;
          } catch { /* ignore */ }
        } else {
          line += ' — standalone';
        }
        line += ` [id: ${t.id}]`;
        text += line + '\n';
      }
    }

    // Top pebbles
    text += `\n## Top Pebbles\n`;
    const topPebbles = pebbles.slice(0, 10);
    if (topPebbles.length === 0) {
      text += 'No active pebbles.\n';
    } else {
      topPebbles.forEach((t, i) => {
        text += `${i + 1}. "${t.title}" [sortOrder: ${t.sortOrder}]${t.priority !== 'low' ? ` [${t.priority}]` : ''}${t.deadline ? ` ⚑ ${t.deadline.slice(0, 10)}` : ''} [id: ${t.id}]\n`;
      });
      if (pebbles.length > 10) {
        text += `\n...and ${pebbles.length - 10} more pebbles.\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'suggest_tasks_for_project',
  'Get a project\'s full context (markdown + all tasks) formatted for you to suggest next boulders, rocks, and pebbles. After reviewing, use add_task to create the tasks the user approves.',
  {
    projectId: z.string().describe('Project ID'),
  },
  async ({ projectId }) => {
    const project = await getProject(projectId);
    const activeTasks = await listTasks({ projectId, status: 'active' });
    const completedTasks = await listTasks({ projectId, status: 'completed' });
    const iceboxedTasks = await listTasks({ projectId, status: 'iceboxed' });

    let text = `# Project: ${project.name}\n`;
    text += `Status: ${project.status}\n\n`;
    text += `## Document\n\n${project.markdown}\n\n`;

    text += `## Current State\n\n`;

    const boulders = activeTasks.filter(t => t.classification === 'boulder');
    const rocks = activeTasks.filter(t => t.classification === 'rock');
    const pebbles = activeTasks.filter(t => t.classification === 'pebble');

    text += `Active boulders (${boulders.length}):\n`;
    boulders.forEach(t => { text += `  • "${t.title}" [sortOrder: ${t.sortOrder}] [id: ${t.id}]\n`; });
    text += `\nActive rocks (${rocks.length}):\n`;
    rocks.forEach(t => { text += `  • "${t.title}" [sortOrder: ${t.sortOrder}] [id: ${t.id}]\n`; });
    text += `\nActive pebbles (${pebbles.length}):\n`;
    pebbles.forEach(t => { text += `  • "${t.title}" [sortOrder: ${t.sortOrder}] [id: ${t.id}]\n`; });

    if (completedTasks.length > 0) {
      text += `\nCompleted (${completedTasks.length}):\n`;
      completedTasks.forEach(t => { text += `  ✓ "${t.title}"\n`; });
    }
    if (iceboxedTasks.length > 0) {
      text += `\nIceboxed (${iceboxedTasks.length}):\n`;
      iceboxedTasks.forEach(t => { text += `  ❄ "${t.title}"\n`; });
    }

    text += `\n---\n\nBased on the project document and task history above, suggest next boulders (deep work blocks), rocks (medium-sized tasks), and pebbles (small tasks) that would move this project forward. Present them for the user to approve, then use add_task to create the approved ones.`;

    return { content: [{ type: 'text', text }] };
  }
);

// ─── Start Server ─────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
