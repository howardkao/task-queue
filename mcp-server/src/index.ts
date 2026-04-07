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
  listInvestments,
  getInvestment,
  createInvestment,
  updateInvestment,
  setInvestmentStatus,
} from './investments.js';
import {
  listInitiatives,
  getInitiative,
  createInitiative,
  updateInitiative,
  deleteInitiative,
} from './initiatives.js';

const server = new McpServer({
  name: 'task-queue',
  version: '2.0.0',
});

// ─── Task Tools ───────────────────────────────────────────────

server.tool(
  'add_task',
  'Create a new task. Lands in inbox (no size) by default. Set vital flag for strategic/critical tasks. Size: S (~5 min), M (~1 hr), L (2-3 hr). Tasks in family investments are shared by default; set excludeFromFamily to make them private.',
  {
    title: z.string().describe('Task title'),
    notes: z.string().optional().describe('Optional notes or context'),
    vital: z.boolean().optional().describe('True if strategic or critical. Defaults to false.'),
    size: z.enum(['S', 'M', 'L']).optional().describe('Task size: S (~5 min), M (~1 hr), L (2-3 hr). Omit for inbox.'),
    investmentId: z.string().optional().describe('Investment ID to assign this task to'),
    initiativeId: z.string().optional().describe('Initiative ID within the investment'),
    deadline: z.string().optional().describe('Deadline as ISO date string (e.g. "2026-04-01")'),
    excludeFromFamily: z.boolean().optional().describe('True to keep task private even in a family investment'),
  },
  async ({ title, notes, vital, size, investmentId, initiativeId, deadline, excludeFromFamily }) => {
    const task = await createTask({ title, notes, vital, size, investmentId, initiativeId, deadline, excludeFromFamily });
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.tool(
  'list_inbox',
  'List all untriaged tasks (no size set yet).',
  {},
  async () => {
    const tasks = await listTasks({ status: 'active' });
    const inbox = tasks.filter(t => t.size == null);
    return {
      content: [{
        type: 'text',
        text: inbox.length === 0
          ? 'Inbox is empty — nothing to triage.'
          : `${inbox.length} task(s) in inbox:\n\n${inbox.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` — ${t.notes}` : ''} [id: ${t.id}]`).join('\n')}`,
      }],
    };
  }
);

server.tool(
  'triage_task',
  'Triage an inbox task: set size, vital flag, and optionally assign to an investment/initiative.',
  {
    taskId: z.string().describe('ID of the task to triage'),
    size: z.enum(['S', 'M', 'L']).describe('Task size: S (~5 min), M (~1 hr), L (2-3 hr)'),
    vital: z.boolean().optional().describe('True if strategic or critical. Defaults to false.'),
    investmentId: z.string().optional().describe('Investment ID to assign to'),
    initiativeId: z.string().optional().describe('Initiative ID within the investment'),
    deadline: z.string().optional().describe('Deadline as ISO date string'),
  },
  async ({ taskId, size, vital, investmentId, initiativeId, deadline }) => {
    const task = await updateTask(taskId, {
      size,
      vital: vital ?? false,
      investmentId: investmentId ?? undefined,
      initiativeId: initiativeId ?? undefined,
      deadline: deadline ?? undefined,
    });
    return {
      content: [{ type: 'text', text: `Triaged "${task.title}" — size: ${task.size}, vital: ${task.vital}${task.investmentId ? ' [investment-linked]' : ''}.` }],
    };
  }
);

server.tool(
  'search_tasks',
  'Search tasks by title. Optionally filter by status, vital flag, size, or investment.',
  {
    query: z.string().describe('Case-insensitive text to search for in the task title'),
    status: z.enum(['active', 'completed', 'iceboxed']).optional().describe('Optional status filter'),
    vital: z.boolean().optional().describe('Filter by vital flag'),
    size: z.enum(['S', 'M', 'L']).optional().describe('Filter by size'),
    investmentId: z.string().optional().describe('Filter by investment'),
    limit: z.number().optional().describe('Maximum number of matches to return (default: 10)'),
  },
  async ({ query, status, vital, size, investmentId, limit }) => {
    const normalized = query.trim().toLowerCase();
    const tasks = await listTasks({ status, vital, size, investmentId });

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
      + ` [${task.size || 'unsized'}/${task.status}]`
      + `${task.vital ? ' [vital]' : ''}`
      + `${task.deadline ? ` (due ${task.deadline.slice(0, 10)})` : ''}`
      + `${task.investmentId ? ' [investment-linked]' : ''}`
      + `${task.notes ? `\n   Notes: ${task.notes}` : ''}`
    )).join('\n');

    return {
      content: [{ type: 'text', text: `${matches.length} matching task(s):\n\n${text}` }],
    };
  }
);

server.tool(
  'get_task',
  'Get a task\'s full details, including notes/description.',
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
  'Update an existing task. When changing excludeFromFamily, the system enforces policy: shared->private clears responsible people, private->shared starts as unassigned.',
  {
    taskId: z.string().describe('ID of the task to update'),
    title: z.string().optional().describe('New task title'),
    notes: z.string().optional().describe('Full replacement for the task notes/description'),
    vital: z.boolean().optional().describe('Set vital flag'),
    size: z.enum(['S', 'M', 'L']).nullable().optional().describe('Set size; null to clear'),
    status: z.enum(['active', 'completed', 'iceboxed']).optional().describe('New status'),
    investmentId: z.string().nullable().optional().describe('Investment link; null to clear'),
    initiativeId: z.string().nullable().optional().describe('Initiative link; null to clear'),
    deadline: z.string().nullable().optional().describe('ISO date deadline; null to clear'),
    sortOrder: z.number().optional().describe('New sort order value'),
    excludeFromFamily: z.boolean().optional().describe('True to make private in a family investment; false to share'),
  },
  async ({ taskId, title, notes, vital, size, status, investmentId, initiativeId, deadline, sortOrder, excludeFromFamily }) => {
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (vital !== undefined) updates.vital = vital;
    if (size !== undefined) updates.size = size;
    if (status !== undefined) updates.status = status;
    if (investmentId !== undefined) updates.investmentId = investmentId;
    if (initiativeId !== undefined) updates.initiativeId = initiativeId;
    if (deadline !== undefined) updates.deadline = deadline;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (excludeFromFamily !== undefined) updates.excludeFromFamily = excludeFromFamily;

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
  'Reorder tasks in a list. Provide task IDs in the new desired order. Use context "family" for shared task ordering visible to everyone, or "me" for personal ordering.',
  {
    taskIds: z.array(z.string()).describe('List of task IDs in the new order'),
    context: z.enum(['me', 'family']).optional().describe('Ordering context: "me" for personal order, "family" for shared order. Defaults to "me".'),
  },
  async ({ taskIds, context }) => {
    const order = taskIds.map((id, i) => ({ id, sortOrder: (i + 1) * 1000 }));
    await reorderTasks(order, context || 'me');
    return {
      content: [{ type: 'text', text: `Reordered ${taskIds.length} task(s) in ${context || 'me'} context.` }],
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
  'list_vital',
  'List all active vital tasks (strategic or critical), grouped by investment.',
  {},
  async () => {
    const tasks = await listTasks({ status: 'active', vital: true });
    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'No active vital tasks.' }] };
    }

    const investments = await listInvestments({ status: 'active' });
    const investmentById = new Map(investments.map(inv => [inv.id, inv]));

    const orphan = tasks.filter(t => !t.investmentId);
    const byInvestment = new Map<string, typeof tasks>();
    for (const t of tasks.filter(t => t.investmentId)) {
      const iid = t.investmentId!;
      if (!byInvestment.has(iid)) byInvestment.set(iid, []);
      byInvestment.get(iid)!.push(t);
    }

    let text = `${tasks.length} active vital task(s):\n`;

    // Show in investment rank order
    for (const inv of investments) {
      const invTasks = byInvestment.get(inv.id);
      if (!invTasks) continue;
      text += `\n${inv.name}:\n${formatTaskList(invTasks)}`;
      byInvestment.delete(inv.id);
    }

    // Any remaining investments not in the active list
    for (const [iid, invTasks] of byInvestment) {
      const name = investmentById.get(iid)?.name || `Unknown (${iid})`;
      text += `\n${name}:\n${formatTaskList(invTasks)}`;
    }

    if (orphan.length > 0) {
      text += `\nOrphan:\n${formatTaskList(orphan)}`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'list_other',
  'List all active non-vital tasks (with size set), grouped by investment. Optionally filter by size or show stale tasks.',
  {
    size: z.enum(['S', 'M', 'L']).optional().describe('Filter by size'),
    staleDays: z.number().optional().describe('Only show tasks older than this many days'),
    limit: z.number().optional().describe('Max number of tasks to return'),
  },
  async ({ size, staleDays, limit }) => {
    let tasks = await listTasks({ status: 'active', vital: false });
    // Exclude inbox (unsized)
    tasks = tasks.filter(t => t.size != null);

    if (size) {
      tasks = tasks.filter(t => t.size === size);
    }
    if (staleDays) {
      const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
      tasks = tasks.filter(t => t.createdAt && new Date(t.createdAt).getTime() < cutoff);
    }
    if (limit) {
      tasks = tasks.slice(0, limit);
    }

    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'No matching tasks.' }] };
    }

    const investments = await listInvestments({ status: 'active' });
    const investmentById = new Map(investments.map(inv => [inv.id, inv]));

    const orphan = tasks.filter(t => !t.investmentId);
    const byInvestment = new Map<string, typeof tasks>();
    for (const t of tasks.filter(t => t.investmentId)) {
      const iid = t.investmentId!;
      if (!byInvestment.has(iid)) byInvestment.set(iid, []);
      byInvestment.get(iid)!.push(t);
    }

    let text = `${tasks.length} task(s):\n`;

    for (const inv of investments) {
      const invTasks = byInvestment.get(inv.id);
      if (!invTasks) continue;
      text += `\n${inv.name}:\n${formatTaskList(invTasks)}`;
      byInvestment.delete(inv.id);
    }

    for (const [iid, invTasks] of byInvestment) {
      const name = investmentById.get(iid)?.name || `Unknown (${iid})`;
      text += `\n${name}:\n${formatTaskList(invTasks)}`;
    }

    if (orphan.length > 0) {
      text += `\nOrphan:\n${formatTaskList(orphan)}`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ─── Investment Tools ────────────────────────────────────────

server.tool(
  'list_investments',
  'List all investments with their status and rank.',
  {
    status: z.enum(['active', 'on_hold', 'completed']).optional().describe('Filter by status'),
  },
  async ({ status }) => {
    const investments = await listInvestments(status ? { status } : undefined);
    if (investments.length === 0) {
      return { content: [{ type: 'text', text: 'No investments.' }] };
    }

    const text = investments.map((inv, i) =>
      `${i + 1}. ${inv.name} [${inv.status}] [rank: ${inv.rank}] [id: ${inv.id}]`
    ).join('\n');

    return { content: [{ type: 'text', text: `${investments.length} investment(s):\n\n${text}` }] };
  }
);

server.tool(
  'get_investment',
  'Get an investment\'s full details: markdown document, initiatives, active tasks, and completed tasks.',
  {
    investmentId: z.string().describe('Investment ID'),
  },
  async ({ investmentId }) => {
    const investment = await getInvestment(investmentId);
    const initiatives = await listInitiatives(investmentId);
    const activeTasks = await listTasks({ investmentId, status: 'active' });
    const completedTasks = await listTasks({ investmentId, status: 'completed' });

    const vital = activeTasks.filter(t => t.vital);
    const other = activeTasks.filter(t => !t.vital && t.size != null);
    const inbox = activeTasks.filter(t => t.size == null);

    let text = `# ${investment.name}\n`;
    text += `Status: ${investment.status} | Rank: ${investment.rank}\n`;
    text += `\n---\n\n## Document\n\n${investment.markdown}\n`;

    if (initiatives.length > 0) {
      text += `\n---\n\n## Initiatives (${initiatives.length})\n`;
      for (const init of initiatives) {
        const initTasks = activeTasks.filter(t => t.initiativeId === init.id);
        text += `\n### ${init.name} [rank: ${init.rank}] [id: ${init.id}]\n`;
        if (initTasks.length > 0) {
          text += formatTaskList(initTasks);
        } else {
          text += '  (no active tasks)\n';
        }
      }
    }

    text += `\n---\n\n## Active Tasks\n`;

    if (vital.length > 0) {
      text += `\nVital (${vital.length}):\n${formatTaskList(vital)}`;
    }
    if (other.length > 0) {
      text += `\nOther (${other.length}):\n${formatTaskList(other)}`;
    }
    if (inbox.length > 0) {
      text += `\nInbox (${inbox.length}):\n${inbox.map(t => `  • "${t.title}" [id: ${t.id}]`).join('\n')}\n`;
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
  'create_investment',
  'Create a new investment with a name and optional initial markdown content.',
  {
    name: z.string().describe('Investment name'),
    markdown: z.string().optional().describe('Initial markdown content'),
    familyVisible: z.boolean().optional().describe('Whether tasks default to family-visible'),
  },
  async ({ name, markdown, familyVisible }) => {
    const investment = await createInvestment({ name, markdown, familyVisible });
    return { content: [{ type: 'text', text: `Created investment: "${investment.name}" [id: ${investment.id}]` }] };
  }
);

server.tool(
  'update_investment',
  'Update an investment\'s markdown document, name, or status.',
  {
    investmentId: z.string().describe('Investment ID'),
    name: z.string().optional().describe('New name'),
    markdown: z.string().optional().describe('New markdown content (replaces entire document)'),
    status: z.enum(['active', 'on_hold', 'completed']).optional().describe('New status'),
    familyVisible: z.boolean().optional().describe('Update family visibility default'),
  },
  async ({ investmentId, name, markdown, status, familyVisible }) => {
    if (status !== undefined) {
      const investment = await setInvestmentStatus(investmentId, status);
      // Also apply other updates if any
      const otherUpdates: Record<string, any> = {};
      if (name !== undefined) otherUpdates.name = name;
      if (markdown !== undefined) otherUpdates.markdown = markdown;
      if (familyVisible !== undefined) otherUpdates.familyVisible = familyVisible;
      if (Object.keys(otherUpdates).length > 0) {
        const updated = await updateInvestment(investmentId, otherUpdates);
        return { content: [{ type: 'text', text: `Updated investment: "${updated.name}" [${updated.status}]` }] };
      }
      return { content: [{ type: 'text', text: `Updated investment: "${investment.name}" [${investment.status}]` }] };
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (markdown !== undefined) updates.markdown = markdown;
    if (familyVisible !== undefined) updates.familyVisible = familyVisible;

    if (Object.keys(updates).length === 0) {
      return { content: [{ type: 'text', text: 'No updates provided.' }] };
    }

    const investment = await updateInvestment(investmentId, updates);
    return { content: [{ type: 'text', text: `Updated investment: "${investment.name}" [${investment.status}]` }] };
  }
);

// ─── Initiative Tools ────────────────────────────────────────

server.tool(
  'list_initiatives',
  'List initiatives within an investment.',
  {
    investmentId: z.string().describe('Investment ID'),
  },
  async ({ investmentId }) => {
    const initiatives = await listInitiatives(investmentId);
    if (initiatives.length === 0) {
      return { content: [{ type: 'text', text: 'No initiatives in this investment.' }] };
    }

    const text = initiatives.map((init, i) =>
      `${i + 1}. ${init.name} [rank: ${init.rank}] [id: ${init.id}]`
    ).join('\n');

    return { content: [{ type: 'text', text: `${initiatives.length} initiative(s):\n\n${text}` }] };
  }
);

server.tool(
  'create_initiative',
  'Create a new initiative within an investment. Initiatives are for multi-task efforts bigger than a single L-sized task.',
  {
    investmentId: z.string().describe('Parent investment ID'),
    name: z.string().describe('Initiative name'),
    markdown: z.string().optional().describe('Initial markdown content'),
  },
  async ({ investmentId, name, markdown }) => {
    const initiative = await createInitiative({ investmentId, name, markdown });
    return { content: [{ type: 'text', text: `Created initiative: "${initiative.name}" [id: ${initiative.id}]` }] };
  }
);

server.tool(
  'update_initiative',
  'Update an initiative\'s name or markdown document.',
  {
    initiativeId: z.string().describe('Initiative ID'),
    name: z.string().optional().describe('New name'),
    markdown: z.string().optional().describe('New markdown content'),
  },
  async ({ initiativeId, name, markdown }) => {
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (markdown !== undefined) updates.markdown = markdown;

    if (Object.keys(updates).length === 0) {
      return { content: [{ type: 'text', text: 'No updates provided.' }] };
    }

    const initiative = await updateInitiative(initiativeId, updates);
    return { content: [{ type: 'text', text: `Updated initiative: "${initiative.name}"` }] };
  }
);

server.tool(
  'delete_initiative',
  'Delete an initiative. Tasks linked to it are unlinked (moved back to the parent investment), not deleted.',
  {
    initiativeId: z.string().describe('Initiative ID to delete'),
  },
  async ({ initiativeId }) => {
    await deleteInitiative(initiativeId);
    return { content: [{ type: 'text', text: 'Initiative deleted. Linked tasks have been unlinked.' }] };
  }
);

// ─── Composite Tools ──────────────────────────────────────────

server.tool(
  'get_today',
  'Get a snapshot of today: vital tasks to schedule, top other tasks for gaps, and inbox count. Tasks grouped by investment.',
  {},
  async () => {
    const [allActive, investments] = await Promise.all([
      listTasks({ status: 'active' }),
      listInvestments({ status: 'active' }),
    ]);

    const investmentById = new Map(investments.map(inv => [inv.id, inv]));

    const inbox = allActive.filter(t => t.size == null);
    const vital = allActive.filter(t => t.vital && t.size != null);
    const other = allActive.filter(t => !t.vital && t.size != null);

    let text = '# Today\n\n';

    if (inbox.length > 0) {
      text += `⚠️ ${inbox.length} task(s) in inbox awaiting triage.\n\n`;
    }

    // Vital tasks grouped by investment
    text += `## Vital Tasks (${vital.length})\n`;
    if (vital.length === 0) {
      text += 'No vital tasks. Consider reviewing your investments.\n';
    } else {
      text += formatGroupedByInvestment(vital, investments, investmentById);
    }

    // Top other tasks
    text += `\n## Other Tasks — Top 10 (${other.length} total)\n`;
    if (other.length === 0) {
      text += 'No other tasks.\n';
    } else {
      const top = other.slice(0, 10);
      text += formatGroupedByInvestment(top, investments, investmentById);
      if (other.length > 10) {
        text += `\n...and ${other.length - 10} more.\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'suggest_tasks_for_investment',
  'Get an investment\'s full context (markdown + initiatives + all tasks) formatted for you to suggest next tasks. After reviewing, use add_task to create the tasks the user approves.',
  {
    investmentId: z.string().describe('Investment ID'),
  },
  async ({ investmentId }) => {
    const investment = await getInvestment(investmentId);
    const initiatives = await listInitiatives(investmentId);
    const activeTasks = await listTasks({ investmentId, status: 'active' });
    const completedTasks = await listTasks({ investmentId, status: 'completed' });
    const iceboxedTasks = await listTasks({ investmentId, status: 'iceboxed' });

    let text = `# Investment: ${investment.name}\n`;
    text += `Status: ${investment.status}\n\n`;
    text += `## Document\n\n${investment.markdown}\n\n`;

    if (initiatives.length > 0) {
      text += `## Initiatives\n`;
      for (const init of initiatives) {
        text += `\n### ${init.name} [id: ${init.id}]\n`;
        if (init.markdown) text += `${init.markdown}\n`;
      }
    }

    text += `\n## Current State\n\n`;

    const vital = activeTasks.filter(t => t.vital);
    const otherSized = activeTasks.filter(t => !t.vital && t.size != null);
    const unsized = activeTasks.filter(t => t.size == null);

    text += `Active vital (${vital.length}):\n`;
    vital.forEach(t => { text += `  • "${t.title}" [${t.size}]${t.initiativeId ? ` [initiative: ${t.initiativeId}]` : ''} [id: ${t.id}]\n`; });
    text += `\nActive other (${otherSized.length}):\n`;
    otherSized.forEach(t => { text += `  • "${t.title}" [${t.size}]${t.initiativeId ? ` [initiative: ${t.initiativeId}]` : ''} [id: ${t.id}]\n`; });
    if (unsized.length > 0) {
      text += `\nUntriaged (${unsized.length}):\n`;
      unsized.forEach(t => { text += `  • "${t.title}" [id: ${t.id}]\n`; });
    }

    if (completedTasks.length > 0) {
      text += `\nCompleted (${completedTasks.length}):\n`;
      completedTasks.forEach(t => { text += `  ✓ "${t.title}"\n`; });
    }
    if (iceboxedTasks.length > 0) {
      text += `\nIceboxed (${iceboxedTasks.length}):\n`;
      iceboxedTasks.forEach(t => { text += `  ❄ "${t.title}"\n`; });
    }

    text += `\n---\n\nBased on the investment document, initiatives, and task history above, suggest next tasks with sizes (S/M/L) and whether each is vital. If the work is substantial enough for a new initiative, suggest that too. Present for the user to approve, then use add_task (or create_initiative + add_task) to create the approved ones.`;

    return { content: [{ type: 'text', text }] };
  }
);

// ─── Helpers ─────────────────────────────────────────────────

function formatTaskList(tasks: { title: string; id: string; size: string | null; vital: boolean; deadline: string | null; sortOrder: number }[]): string {
  return tasks.map(t => {
    let line = `  • "${t.title}" [${t.size || '?'}]`;
    if (t.vital) line += ' [vital]';
    if (t.deadline) line += ` (due ${t.deadline.slice(0, 10)})`;
    line += ` [id: ${t.id}]`;
    return line;
  }).join('\n') + '\n';
}

function formatGroupedByInvestment(
  tasks: { title: string; id: string; size: string | null; vital: boolean; deadline: string | null; sortOrder: number; investmentId: string | null }[],
  investments: { id: string; name: string }[],
  investmentById: Map<string, { name: string }>,
): string {
  const orphan = tasks.filter(t => !t.investmentId);
  const byInvestment = new Map<string, typeof tasks>();
  for (const t of tasks.filter(t => t.investmentId)) {
    const iid = t.investmentId!;
    if (!byInvestment.has(iid)) byInvestment.set(iid, []);
    byInvestment.get(iid)!.push(t);
  }

  let text = '';

  for (const inv of investments) {
    const invTasks = byInvestment.get(inv.id);
    if (!invTasks) continue;
    text += `\n${inv.name}:\n${formatTaskList(invTasks)}`;
    byInvestment.delete(inv.id);
  }

  for (const [iid, invTasks] of byInvestment) {
    const name = investmentById.get(iid)?.name || `Unknown (${iid})`;
    text += `\n${name}:\n${formatTaskList(invTasks)}`;
  }

  if (orphan.length > 0) {
    text += `\nOrphan:\n${formatTaskList(orphan)}`;
  }

  return text;
}

// ─── Start Server ─────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
