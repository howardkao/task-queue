# Task Queue — Execution Blueprint & Technical Spec

## 1. System Architecture

### High-Level Overview

Task Queue is a single-page React application backed by Firebase Auth + Firestore, designed for a small number of authenticated users to manage tasks using a boulders (deep work) and pebbles (small tasks) mental model. AI integration happens externally via an MCP server — the app itself is a simple, durable CRUD system.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Today   │  │  Icebox  │  │ Projects │              │
│  │  View    │  │  View    │  │ View     │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │             │                     │
│       └──────────┬───┴─────────┬──┘                     │
│                  │             │                         │
│            ┌─────┴─────┐ ┌────┴──────┐ ┌──────────────┐│
│            │ useTasks  │ │useProjects│ │useActivityLog ││
│            │ (RQ hooks)│ │(RQ hooks) │ │ (RQ hooks)   ││
│            └─────┬─────┘ └────┬──────┘ └───────┬──────┘│
│                  │            │                 │        │
│            ┌─────┴────────────┴─────────────────┴──────┐│
│            │   Firebase Auth + Firestore SDK (direct)  ││
│            └───────────────────┬────────────────────────┘│
└────────────────────────────────┼─────────────────────────┘
                                 │
         ┌───────────────────────┴──────────────────────┐
         │                                              │
┌────────┴─────────┐                         ┌──────────┴──────────┐
│    Firestore     │                         │  Cloudflare Worker  │
│ tasks / projects │                         │ calendar proxy      │
│ activityLog /    │                         │ (Firebase token     │
│ admins / invites │                         │  verified)          │
└────────┬─────────┘                         └──────────┬──────────┘
         ▲                                              │
         │                                              │
         └───────────────────────┬──────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    MCP Server (stdio)   │
                    │  Claude Desktop/Code    │
                    └─────────────────────────┘
```

### Key Architectural Decision: Spark-Compatible Architecture

The active production path uses direct Firestore access from the browser for app data, plus a Cloudflare Worker for calendar fetching. Firebase Cloud Functions are not part of the deployed architecture because the project stays on the Spark plan and avoids Blaze-only deployment paths.

Current responsibilities:
- **Firebase Auth**: email/password sign-in, admin detection, invite-gated signup
- **Firestore**: owner-scoped app data (`tasks`, `projects`, `activityLog`) plus auth/admin metadata
- **Cloudflare Worker**: fetches private iCal feeds and verifies Firebase ID tokens before returning calendar data
- **MCP server**: local stdio bridge for Claude/Desktop/Code workflows

### Tech Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | React | 19 |
| Build | Vite | latest |
| Language | TypeScript | strict |
| Data fetching | @tanstack/react-query | v5 |
| Auth | Firebase Auth | Web SDK v9+ (modular) |
| Database | Firebase Firestore | Web SDK v9+ (modular) |
| Hosting | Firebase Hosting | Free tier |
| Calendar backend | Cloudflare Worker | Free tier |
| MCP Server | TypeScript + stdio | Built |

### Module Dependency Graph

```
App.tsx
├── Auth/
│   ├── Login (email/password sign-in + invite-gated signup)
│   └── AdminPanel (invite code management, admin-only)
├── TabBar (shared) — 3 tabs: Today, Icebox, Projects
├── TodayView/
│   ├── DayCalendar (7am–10pm time grid + drag-and-drop boulder placement)
│   ├── Inline Inbox (capture input + boulder/pebble classify buttons)
│   ├── BoulderSidebar (draggable boulder cards, visual placed/unplaced distinction)
│   └── PebbleSidebar (self-contained: full drag-reorder, bump/drop, complete/icebox)
├── IceboxView/
│   └── IceboxView (grouped list of iceboxed tasks, reactivate or delete)
├── ProjectsView/
│   ├── ProjectListView (project list + create)
│   └── ProjectDetailView (markdown editor + task sidebar + activity log)
└── shared/
    ├── TaskEditPanel (reusable task metadata editor: title, notes, project, deadline, recurrence)
    └── Toast (global error toast system)

Hooks (all in src/hooks/):
├── useAuth.ts → Firebase Auth state, admin detection, sign-in/sign-out
├── useTasks.ts → api/tasks.ts → Firestore
├── useProjects.ts → api/projects.ts → Firestore
├── useCalendar.ts → api/calendar.ts → Cloudflare Worker
└── useActivityLog.ts → api/activityLog.ts → Firestore
```

### Data Flow Pattern

All data flows follow the same pattern:
1. **Component** calls a React Query hook (e.g., `usePebbles()`)
2. **Hook** delegates to an API function (e.g., `listTasks({ classification: 'pebble', status: 'active' })`)
3. **API function** calls `requireUser()` for auth, queries Firestore with `ownerUid` filter, applies client-side filtering, returns typed data
4. **Mutations** call API functions, then invalidate relevant query keys to trigger refetch
5. **Side effects** (activity log entries) are fire-and-forget `.catch(() => {})` — never block the user

---

## 2. Feature Deep-Dives

### Feature 1: Inline Inbox (Capture + Classification)

**What it does:** Unclassified tasks enter via a text input at the top of the Today sidebar. Each shows the task title with two buttons: 🪨 (boulder) or Pebble. Classifying moves the task to the top of the respective list. There is no standalone Triage tab — capture and classification happen inline on the Today page.

**Location in component tree:**
```
TodayView sidebar (above boulder/pebble toggle)
├── Text input (Enter to capture)
└── Inbox task rows[] (one per unclassified task)
    ├── Title
    ├── 🪨 button (classify as boulder → top of boulder list)
    └── Pebble button (classify as pebble → top of pebble list)
```

**State management:**
- `useInboxTasks()` → queries `listTasks({ classification: 'unclassified', status: 'active' })`
- `useCreateTask()` mutation → `createTask({ title })`
- `useClassifyTask()` mutation → `updateTask(id, { classification })` — assigns `sortOrder` via `getTopSortOrder()` to place at top of list

**Edge cases:**
- Empty inbox: section collapses, only input visible
- Classifying as boulder or pebble puts the task at the **top** of the list (lowest sortOrder)

---

### Feature 2: Pebble Management (PebbleSidebar)

**What it does:** Self-contained pebble manager embedded in the Today sidebar (toggle: Boulders ↔ Pebbles). Full drag-and-drop reorder, shortcut buttons, complete/icebox via expanded card view.

**Component tree:**
```
PebbleSidebar (self-contained — fetches own data)
└── Pebble card[] (one per active pebble)
    ├── Drag handle (⠿) with ⤒/↓ stacked below
    ├── Task title (click to expand → TaskEditPanel)
    ├── Project name (if assigned)
    ├── Deadline flag (⚑) + recurrence indicator (↻)
    └── Staleness indicator (days since creation, color escalation)
```

**State management:**
- `usePebbles()` fetches sorted pebble list
- Local `localOrder` state for optimistic drag reordering
- On drag end: update local state immediately, then `reorderPebbles.mutate()` with new sort orders
- Bump-to-top: assigns `sortOrder = firstPebble.sortOrder - 1000`
- Drop-by-10: inserts between positions 10 and 11 using fractional indexing

**Sort order strategy:**
- Both pebbles and boulders use a numeric `sortOrder` field (fractional indexing)
- **New tasks (from inbox classification) go to the top of their list** via `getTopSortOrder()` which finds the minimum sortOrder and subtracts 1000
- Fallback for missing composite index: `-1000 + Math.random() * 100`
- Full drag reorder: assigns fresh integer sortOrders to all items via `writeBatch`

**Persistence:**
- `reorderPebbles()` uses Firestore `writeBatch` to atomically update all sortOrder values
- React Query invalidation on `['tasks', 'pebbles']` after batch completes

---

### Feature 3: Today View (Daily Planning)

**What it does:** Day calendar (7am–10pm) showing Google Calendar events + boulder blocks. Sidebar with inline inbox, toggleable boulder/pebble sections. Boulders are dragged onto the calendar to sketch out the day's plan.

**Component tree:**
```
TodayView
├── DayCalendar (7am–10pm time grid)
│   ├── Half-hour slot lines
│   ├── Drop indicator line (when dragging boulder over)
│   └── Event overlays (positioned absolutely)
│       ├── Meeting events (blue, from iCal)
│       ├── Personal events (green, from iCal)
│       └── Boulder blocks (coral dashed border, draggable/resizable)
│           ├── Time range + title + project name
│           ├── → button (remove from calendar)
│           └── Resize handle (bottom, 8px, ns-resize cursor)
├── Sidebar (320px)
│   ├── Inline Inbox (capture + classify)
│   ├── Toggle (Boulders ↔ Pebbles)
│   ├── BoulderSidebar (when selected)
│   │   └── Boulder cards with visual placed/unplaced distinction
│   └── PebbleSidebar (when selected)
│       └── Full pebble management (see Feature 2)
```

**Boulder placement flow:**
1. User drags a boulder card from the sidebar onto the calendar
2. A drop indicator line shows the snap position (15-minute increments)
3. On drop, boulder appears as a coral-dashed block (default 2 hours)
4. **Boulder remains in the sidebar** with a visual distinction (opacity/dimmed) — it's "sketched" onto the calendar, not moved
5. Placed boulders can be moved (mousedown drag) or resized (bottom handle drag) in 15-minute snaps
6. → button removes boulder from calendar (returns to full opacity in sidebar)
7. Task metadata can be edited from the sidebar's expanded card view (TaskEditPanel)

**Snap grid:**
- `SNAP = 0.25` (15-minute increments)
- `PX_PER_HOUR = SLOT_HEIGHT * 2` (pixel-to-hour conversion)
- `yToHour()` converts pixel Y position to snapped hour value

**Calendar data:**
- Real iCal data from Cloudflare Worker when configured (`useTodayEvents()`)
- Falls back to mock events when no `VITE_API_BASE` configured
- `icalToCalEvents()` converts CalendarEvent[] to internal CalEvent[] format

**Client state (TodayView):**
- `placedBoulders: Record<string, { startHour: number; duration: number }>` — boulder calendar placements (ephemeral, not persisted)
- `sidebarMode: 'boulders' | 'pebbles'` — which sidebar section is active
- `captureValue: string` — inline inbox input

---

### Feature 4: Icebox View

**What it does:** Displays all iceboxed tasks grouped by classification (boulders, pebbles, unclassified). Each task can be reactivated as boulder or pebble, or permanently deleted.

**Component tree:**
```
IceboxView
├── Section header (task count)
├── Boulders group
│   └── IceboxCard[] (title, project name, notes, action buttons)
├── Pebbles group
│   └── IceboxCard[]
└── Unclassified group
    └── IceboxCard[]
```

**Actions per card:**
- 🪨 button → reactivate as boulder (`useReactivateTask`)
- Pebble button → reactivate as pebble (`useReactivateTask`)
- Delete button → confirmation → permanent delete (`useDeleteTask` → Firestore `deleteDoc`)

**State management:**
- `useIceboxedTasks()` → queries `listTasks({ status: 'iceboxed' })`
- Badge count on Icebox tab driven by `iceboxTasks.length` in App.tsx

---

### Feature 5: Projects

**What it does:** Projects are freeform markdown documents with associated tasks. Split-pane layout: markdown editor (left) + task sidebar (right).

**Component tree:**
```
ProjectListView
├── Create project input
└── Project rows (grouped: active, then on hold)
    ├── Project name (clickable)
    └── Status toggle button

ProjectDetailView
├── Breadcrumb (← Projects / Project Name)
├── Header (name + status + toggle button)
├── Split layout
│   ├── Left: Markdown textarea (auto-save, 1s debounce)
│   │   └── Activity Log (collapsible)
│   │       └── Log entries with timestamps
│   └── Right: Task sidebar (320px)
│       ├── Add task input + boulder/pebble toggle
│       ├── Boulders section (click title → TaskEditPanel)
│       ├── Pebbles section (click title → TaskEditPanel)
│       ├── Completed section (collapsible)
│       └── Claude hint text
```

**Auto-save behavior:**
- `handleMarkdownChange` sets local state immediately (responsive typing)
- Debounce timer (1000ms) fires `updateProject.mutate()` after typing stops
- Timer ref cleared on each keystroke to prevent stale saves

**Activity log:**
- Entries auto-generated on: task_created, task_completed, task_iceboxed, project_status_changed
- Fire-and-forget writes via `addLogEntry().catch(() => {})`
- Displayed newest-first with formatted timestamps
- Firestore query with fallback: tries `orderBy('timestamp', 'desc')`, falls back to client-side sort if composite index missing

---

### Feature 6: Shared TaskEditPanel

**What it does:** Reusable component for editing task metadata from any view where tasks appear (BoulderSidebar, PebbleSidebar, ProjectDetailView). Provides a consistent editing experience.

**Component:**
```
TaskEditPanel
├── Title (editable)
├── Notes (textarea)
├── Project dropdown (active projects)
├── Deadline picker
├── Recurrence selector (only shown when deadline is set)
│   ├── Never / Daily / Weekly / Monthly / Yearly / Periodically / Custom
│   ├── Weekly: day-of-week picker (defaults to deadline's day, can't be empty)
│   ├── Periodically: interval 1–30 days after completion
│   └── Custom: weekly/monthly toggle + interval 1–26 + optional day picker
├── Complete button (optional, via props)
└── Icebox button (optional, via props)
```

**Props:** `{ task: Task; onClose: () => void; onComplete?: (id) => void; onIcebox?: (id) => void }`

**Uses:** `useUpdateTask` hook for all metadata changes, `useProjects('active')` for project dropdown.

---

### Feature 7: Auth (Login + Admin + Invites)

**What it does:** Email/password authentication with invite-gated signup. First user becomes admin automatically. Admin can generate invite codes for additional users.

**Components:**
- `Login` — sign-in form + invite-code signup flow
- `AdminPanel` — modal for generating/viewing invite codes (admin-only)
- `useAuth` hook — Firebase Auth state, admin detection, sign-in/sign-out

**Flow:**
1. First user signs up → `admins` collection is empty → user auto-promoted to admin
2. Admin generates invite codes via AdminPanel
3. New users enter invite code during signup → code validated + marked used → account created
4. App checks `admins/{uid}` to determine admin status

---

## 3. Data Model & State Management

### Firestore Collections

#### `tasks`
```typescript
{
  id: string;                              // Firestore document ID
  ownerUid: string;                        // Firebase Auth UID for per-user data isolation
  title: string;                           // Required, trimmed on create
  notes: string;                           // Freeform text, default ''
  classification: 'unclassified' | 'boulder' | 'pebble';
  status: 'active' | 'completed' | 'iceboxed';
  deadline: Timestamp | null;              // Firestore Timestamp, converted to ISO string client-side
  recurrence: RecurrenceRule | null;       // See RecurrenceRule below
  projectId: string | null;               // FK to projects collection
  sortOrder: number;                       // Fractional index for boulder AND pebble ordering
  completedAt: Timestamp | null;           // Set on completion via serverTimestamp()
  createdAt: Timestamp;                    // serverTimestamp()
  updatedAt: Timestamp;                    // serverTimestamp(), updated on every write
}
```

#### RecurrenceRule
```typescript
interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'periodically' | 'custom';
  interval?: number;        // repeat every N (days for periodically, weeks/months for custom)
  days?: string[];          // for weekly/custom-weekly: ['mon','tue','wed','thu','fri','sat','sun']
  customUnit?: 'weekly' | 'monthly'; // for custom freq: which unit the interval applies to
}
```

**Recurrence types:**
- `daily` — every day (interval ignored)
- `weekly` — every week on specified `days[]` (defaults to deadline's day of week)
- `monthly` — every month on same date
- `yearly` — every year on same date
- `periodically` — N days after completion (not from deadline), interval 1–30
- `custom` — weekly or monthly with configurable interval 1–26, optional day picker for weekly

**On completion:** `completeTask()` auto-generates the next occurrence with the same title, notes, classification, project, and recurrence. `periodically` uses completion date as base; all others use the current deadline as base.

#### `projects`
```typescript
{
  id: string;
  ownerUid: string;                        // Firebase Auth UID for per-user data isolation
  name: string;
  markdown: string;                        // Default: "# {name}\n\n"
  status: 'active' | 'on_hold';
  visibility: 'personal' | 'shared';       // Always 'personal' in MVP
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `activityLog`
```typescript
{
  id: string;
  ownerUid: string;                        // Firebase Auth UID for per-user data isolation
  projectId: string;                       // FK to projects collection
  action: 'task_created' | 'task_completed' | 'task_iceboxed' | 'task_classified' | 'project_created' | 'project_status_changed';
  description: string;                     // Human-readable, e.g. 'Completed pebble: "Buy screws"'
  taskId?: string;                         // FK to tasks collection (optional)
  timestamp: Timestamp;                    // serverTimestamp()
}
```

#### `admins`
```typescript
{
  id: string;                              // Document ID == Firebase Auth UID
  email: string | null;
  createdAt: Timestamp;
}
```

#### `inviteCodes`
```typescript
{
  id: string;                              // Document ID == invite code
  code: string;                            // Repeated for convenience/display
  used: boolean;
  usedBy?: string;                         // Firebase Auth UID
  usedAt?: Timestamp;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}
```

#### `bootstrap/auth`
```typescript
{
  adminUid: string;                        // First user to complete bootstrap
  createdAt: Timestamp;
}
```

### Firestore Indexes

Required composite index (defined in `firestore.indexes.json`):
```json
{
  "collectionGroup": "tasks",
  "fields": [
    { "fieldPath": "classification", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "sortOrder", "order": "ASCENDING" }
  ]
}
```

**Index strategy:** `listTasks()` queries with `where('ownerUid', '==', uid)` plus optionally `where('status', '==', ...)`, and applies remaining filters (classification, projectId) client-side. `getTopSortOrder()` queries with `ownerUid` + `classification` + `status` + `orderBy('sortOrder')` — may require a composite index.

### React Query Cache Structure

| Query Key | Source | Stale Time |
|-----------|--------|------------|
| `['tasks', filters]` | `useTasks(filters)` | 30s (global default) |
| `['tasks', 'inbox']` | `useInboxTasks()` | 30s |
| `['tasks', 'boulders']` | `useBoulders()` | 30s |
| `['tasks', 'pebbles']` | `usePebbles()` | 30s |
| `['tasks', 'iceboxed']` | `useIceboxedTasks()` | 30s |
| `['projects']` | `useProjects()` | 30s |
| `['projects', id]` | `useProject(id)` | 30s |
| `['activityLog', projectId]` | `useProjectActivityLog(id)` | 30s |

**Invalidation strategy:**
- All task mutations invalidate `['tasks']` (broad — catches inbox, boulders, pebbles, iceboxed, and filtered queries)
- Pebble reorder specifically invalidates `['tasks', 'pebbles']`
- Project mutations invalidate `['projects']`
- Project status toggle also invalidates `['tasks']` (boulder visibility changes)

### Client State (not in React Query)

| State | Location | Purpose |
|-------|----------|---------|
| `activeTab` | App.tsx `useState` | Current view tab (today/icebox/projects) |
| `openProjectId` | App.tsx `useState` | Project detail navigation |
| `showAdmin` | App.tsx `useState` | Admin panel modal visibility |
| `placedBoulders` | TodayView `useState` | Boulder → { startHour, duration } calendar placements (ephemeral) |
| `sidebarMode` | TodayView `useState` | Toggle: 'boulders' or 'pebbles' |
| `captureValue` | TodayView `useState` | Inline inbox text input |
| `markdown` | ProjectDetailView `useState` | Local editor state (debounced to server) |
| `localOrder` | PebbleSidebar `useState` | Optimistic drag reorder |
| `showCompleted` | ProjectDetailView `useState` | Toggle completed tasks visibility |
| `showLog` | ProjectDetailView `useState` | Toggle activity log visibility |
| `newTaskTitle/Type` | ProjectDetailView `useState` | Task creation form |

---

## 4. Architectural Decision Records (ADRs)

### ADR-001: Direct Firestore + Worker vs. Firebase Functions API Layer

**Decision:** Frontend talks directly to Firestore for app data, and a Cloudflare Worker handles calendar fetching. Firebase Cloud Functions are not in the active path.

**Context:** ARCHITECTURE.md originally specified Cloud Functions as the API layer. That path now conflicts with the desire to stay on Firebase Spark. Direct Firestore access remains simple for CRUD, while the Cloudflare Worker provides server-side network access for iCal feeds without introducing Blaze billing.

**Consequences:**
- (+) Stays on free tiers (Firebase Spark + Cloudflare Worker free tier)
- (+) No Cloud Functions deploy or billing dependency
- (+) Firestore SDK still gives realtime sync and offline-friendly behavior
- (-) Business logic still lives in the frontend and MCP server
- (-) Calendar auth/verification must be implemented manually in the Worker
- (-) Invites remain a direct-firestore flow rather than a dedicated backend flow

**Migration path:** If the project ever moves to Blaze or another backend, the `api/*.ts` layer can be extracted behind a service boundary without changing most UI hooks.

---

### ADR-002: Client-Side Filtering vs. Composite Indexes

**Decision:** Query Firestore with `ownerUid` + one optional `where` clause (status), filter remaining dimensions (classification, projectId) in JavaScript.

**Context:** Firestore requires composite indexes for multi-field queries. These must be manually created in the Firebase console, and errors only surface at runtime. For a small-user app with small data volumes, the trade-off favors simplicity.

**Consequences:**
- (+) Minimal composite index management
- (+) No runtime index-missing errors blocking the app
- (-) Fetches more documents than needed (all active tasks when only pebbles are wanted)
- (-) Won't scale to thousands of tasks — acceptable for personal use

---

### ADR-003: Fire-and-Forget Activity Logging

**Decision:** Activity log writes use `.catch(() => {})` — failures are silently ignored.

**Context:** The activity log is supplementary context for humans and Claude, not a critical data path. A failed log write should never block or error on a task completion.

**Consequences:**
- (+) Zero UX impact from log write failures
- (+) Simpler code — no error handling UI for a background concern
- (-) Log entries may be silently lost (acceptable — it's an audit trail, not a ledger)

---

### ADR-004: Fractional Indexing for Task Sort Order

**Decision:** Both boulder and pebble ordering use numeric `sortOrder` values with fractional midpoints for insertions.

**Context:** Options considered: array-based ordering (requires rewriting all positions on every move), linked list (complex queries), or fractional indexing (simple math, occasional rebalancing). Fractional indexing gives O(1) inserts between any two items.

**Implementation:**
- **New tasks from inbox classification go to the top of their list** via `getTopSortOrder()`: finds minimum existing sortOrder and subtracts 1000
- Bump-to-top: `first.sortOrder - 1000`
- Drop-by-10: midpoint between `orders[9]` and `orders[10]`
- Full drag reorder: assigns fresh integer sortOrders to all items via `writeBatch`
- Fallback for missing composite index: `-1000 + Math.random() * 100`

**Consequences:**
- (+) Single-field updates for insertions — no batch needed for bump/drop
- (+) Batch drag reorder is clean (fresh integers, no precision loss)
- (-) Theoretical precision loss after many fractional insertions — mitigated by periodic batch reorder on drag

---

### ADR-005: Projects as Markdown Documents

**Decision:** Projects are freeform markdown blobs, not structured databases with hierarchies or dependencies.

**Context:** The user explored tree views, mind maps, and hierarchical task structures. All were discarded in favor of the insight that premature decomposition kills projects. Let intent evolve in prose; let Claude decompose into tasks on demand via MCP.

**Consequences:**
- (+) Dramatically simpler data model — just a text field
- (+) Zero UI complexity for "structure" — just a textarea
- (+) Claude can reason about the full project context by reading markdown
- (-) No structured metadata extraction (milestones, deadlines) from project docs — that's Claude's job

---

### ADR-006: AI Lives Outside the App

**Decision:** No AI features, API keys, or ML models in the codebase. All intelligence provided by Claude via MCP server.

**Context:** Baking AI into the app means managing API keys, prompt engineering in the frontend, loading states for AI calls, error handling for AI failures, and coupling to a specific model. By keeping the app as a pure CRUD system, it stays simple and durable. Claude provides capture, triage assistance, project decomposition, cleanup, and auditing — all through conversation.

**Consequences:**
- (+) App codebase stays simple — no AI dependency, no API costs
- (+) AI capabilities upgrade for free as Claude improves
- (+) Mobile capture solved without building mobile UI — just talk to Claude
- (-) AI features require Claude Desktop/Code running — no in-app intelligence
- (-) MCP server is an additional deployment artifact to maintain

---

### ADR-007: Boulder Calendar Placement as Ephemeral Sketch

**Decision:** When a boulder is dragged onto the day calendar, it remains in the sidebar list with a visual distinction (dimmed). Placement data is ephemeral client state — not persisted to Firestore.

**Context:** The calendar view is for daily planning ("sketching out when I plan to work on this boulder"), not for fundamentally moving tasks. Boulders are still todo items that live in the sidebar; the calendar placement is a transient visual aid.

**Consequences:**
- (+) Boulder list always reflects the full todo set, maintaining sort order
- (+) Task metadata (edit, complete, icebox) accessible from sidebar even when boulder is on calendar
- (+) No Firestore writes for calendar placement — keeps the interaction lightweight
- (-) Calendar placements lost on page refresh (acceptable for daily planning)
- (-) No historical record of time-blocking patterns

---

### ADR-008: Triage Absorbed into Today View

**Decision:** Eliminated the standalone Triage tab. Capture and classification happen inline at the top of the Today sidebar.

**Context:** The Triage tab was a separate view with project/deadline/recurrence assignment during classification. In practice, most inbox items just need a quick boulder/pebble decision. Metadata can be edited later via TaskEditPanel from any view. Reducing tabs from 4→3 simplifies navigation.

**Consequences:**
- (+) Fewer tabs, faster workflow — capture and classify without leaving the planning view
- (+) Inbox badge moved to visible position above the boulder/pebble toggle
- (+) TaskEditPanel provides full metadata editing everywhere, so triage-time metadata assignment isn't needed
- (-) No project/deadline assignment at classification time (must expand card later)

---

## 5. Integration Points

### Firestore (Current)

**Connection:** Firebase Web SDK v9+ (modular imports) initialized in `src/firebase.ts` from environment variables for your Firebase project.

**Auth:** Email/password Firebase Auth is required. Firestore rules enforce:
- owner-scoped reads/writes for `tasks`, `projects`, and `activityLog`
- admin-only access for `admins`, `settings`, and invite-code management
- one-time bootstrap for the first admin account
- `admins` collection is publicly readable (needed for first-user check during signup)

**Security model:** documents in user-owned collections must carry `ownerUid`, and rules compare that field to `request.auth.uid`. All API functions call `requireUser()` before any Firestore operation.

**Error handling:** React Query's `retry: 1` provides one automatic retry. Global toast system (`ToastProvider` + `MutationCache.onError`) surfaces mutation errors as temporary notifications.

### Google Calendar / iCal

**Implementation:** Cloudflare Worker fetches private iCal feed URLs from Worker secrets, parses today's events using `ical.js` (with RRULE expansion), and returns them only after verifying the caller's Firebase ID token.

**Timezone handling:** Worker accepts `?tz=` query parameter. Uses `Intl.DateTimeFormat` with `timeZone` option to correctly determine "today" in the user's timezone.

**Requirements:**
- Multiple calendar feeds (work, personal, etc.)
- Read TRANSP property for busy/free
- 30+ minute staleness acceptable (morning planning use case)
- Never writes back to Google Calendar

**Fallback state:** Today View uses hardcoded mock events if the calendar API is unavailable or not configured.

### MCP Server (Phase 5 — Built)

**Location:** `mcp-server/` directory. TypeScript MCP server using `@modelcontextprotocol/sdk` with stdio transport.

**Connection:** Uses the Firebase Web SDK (same client SDK as the frontend) with hardcoded project config. No service account needed — runs locally with the same Firestore access as the browser.

**13 tools implemented:**
| Tool | Description |
|------|-------------|
| `add_task` | Create task (inbox by default, or specify classification) |
| `list_inbox` | List unclassified tasks for triage |
| `classify_task` | Classify as boulder/pebble, optionally assign project + deadline |
| `complete_task` | Complete a task (handles recurrence auto-generation) |
| `icebox_task` | Icebox a task |
| `list_boulders` | List active boulders, grouped by project |
| `list_pebbles` | List pebbles in priority order, optional stale filter |
| `list_projects` | List all projects with status |
| `get_project` | Full project context: markdown + all tasks (active, completed) |
| `create_project` | Create new project |
| `update_project` | Update project markdown, name, or status |
| `get_today` | Daily planning snapshot: boulders, top pebbles, inbox count |
| `suggest_tasks_for_project` | Full project context formatted for Claude to suggest next tasks |

**Setup:** `cd mcp-server && npm install && npm run build`, then configure in Claude Desktop/Code:
```json
{
  "mcpServers": {
    "task-queue": {
      "command": "node",
      "args": ["/path/to/task-queue/mcp-server/dist/index.js"]
    }
  }
}
```

---

## 6. Implementation Checklist

### Completed

- [x] **Phase 1: Core Data + Triage**
  - [x] Firebase project setup (Firestore enabled)
  - [x] Task data model + Firestore CRUD (`api/tasks.ts`)
  - [x] React Query hooks for tasks (`hooks/useTasks.ts`)
  - [x] TypeScript type definitions (`types/index.ts`)
  - [x] Triage View — capture input, classification cards, project dropdown, deadline picker
  - [x] Tab navigation with inbox badge count

- [x] **Phase 2: Pebble Sorting**
  - [x] Pebble sort order persistence (fractional indexing)
  - [x] Drag-and-drop reorder with optimistic UI
  - [x] Shortcut buttons (bump to top, drop by 10, complete, icebox)
  - [x] Deadline flags and staleness indicators
  - [x] Batch reorder via Firestore writeBatch

- [x] **Phase 3: Today View**
  - [x] Day calendar component (7am–10pm time grid)
  - [x] Event rendering with color coding (meeting/personal/boulder)
  - [x] Boulder drag-and-drop to calendar with 15-minute snap grid
  - [x] Boulder move and resize within calendar
  - [x] Boulders stay in sidebar when placed (visual distinction)
  - [x] PebbleSidebar (self-contained pebble management)
  - [x] Sidebar toggle (boulders ↔ pebbles)
  - [x] iCal feed integration via Cloudflare Worker

- [x] **Phase 4: Projects**
  - [x] Project data model + Firestore CRUD (`api/projects.ts`)
  - [x] React Query hooks for projects (`hooks/useProjects.ts`)
  - [x] Project List View (active/on-hold grouping, inline create, status toggle)
  - [x] Project Detail View (markdown editor + task sidebar)
  - [x] Auto-save markdown with 1s debounce
  - [x] Task creation from project page (boulder/pebble toggle)
  - [x] Activity log (auto-generated entries, collapsible display)
  - [x] Completed tasks section with timestamps

- [x] **Phase 5: MCP Server**
  - [x] Set up TypeScript MCP server project with stdio transport
  - [x] Connect to Firestore via Firebase Web SDK (no service account needed)
  - [x] All 13 tools implemented and tested
  - [ ] Configure in Claude Desktop / Claude Code and test conversationally

- [x] **Phase 6: iCal + Recurring Tasks + Polish**
  - [x] Cloudflare Worker for iCal feed fetching and Firebase-token verification
  - [x] Deploy Worker and configure iCal feed URLs in Worker secrets
  - [x] Frontend calendar API client + hook (`api/calendar.ts`, `hooks/useCalendar.ts`)
  - [x] Today View uses real iCal data when available, falls back to mock events
  - [x] Full recurrence system: 6 types (daily, weekly, monthly, yearly, periodically, custom)
  - [x] Recurrence UI with day-of-week picker, interval controls, custom unit toggle
  - [x] Error handling UI — global toast system
  - [x] Keyboard shortcuts — `1`/`2`/`3` switches tabs
  - [x] Staleness indicators with color escalation

- [x] **Phase 7: UX Consolidation**
  - [x] Triage tab removed — inline inbox in Today sidebar
  - [x] Pebbles tab removed — PebbleSidebar is self-contained
  - [x] Icebox tab added with reactivate/delete actions
  - [x] Shared TaskEditPanel for consistent task editing everywhere
  - [x] Boulder drag-and-drop calendar placement (replaces one-click)
  - [x] Boulders remain in sidebar when placed (sketch model)
  - [x] Standardized card style across boulders and pebbles
  - [x] New tasks from classification go to top of list

- [x] **Phase 8: Auth**
  - [x] Firebase Auth with email/password + invite flow
  - [x] First-user auto-admin bootstrap
  - [x] Admin panel for invite code generation
  - [x] Firestore security rules (per-user data isolation via ownerUid)
  - [x] All API functions call `requireUser()` for auth guard
  - [x] Worker calendar endpoint requires Firebase ID token
  - [ ] Replace public invite-code lookup with a rate-limited backend flow

### Remaining

- [ ] **P1: Shared Projects**
  - [ ] Shared project visibility toggle
  - [ ] Multi-user project access

- [ ] **P2: Auth Hardening**
  - [ ] Replace public invite-code lookup with a rate-limited backend flow
