# Task Queue — Execution Blueprint & Technical Spec

## 1. System Architecture

### High-Level Overview

Task Queue is a single-page React application backed by Firebase Auth + Firestore, designed for a small number of authenticated users to manage tasks using a boulders (deep work), rocks (medium-sized work), and pebbles (small tasks) mental model. Assistant integration happens externally via an MCP server; the app itself remains a simple, durable CRUD system.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Today   │  │  Icebox  │  │ Projects │              │
│  │  View    │  │  (menu)  │  │ View     │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │             │                     │
│       └──────────┬───┴─────────┬──┘                     │
│                  │             │                         │
│            ┌─────┴─────┐ ┌────┴──────┐ ┌──────────────┐┌─────────────┐│
│            │ useTasks  │ │useProjects│ │useActivityLog││ useCalendar ││
│            │ (RQ hooks)│ │(RQ hooks) │ │ (RQ hooks)   ││ (range +   ││
│            └─────┬─────┘ └────┬──────┘ └───────┬──────┘└──────┬──────┘│
│                  │            │                 │            │        │
│            ┌─────┴────────────┴─────────────────┴────────────┴──────┐
│            │   Firebase Auth + Firestore SDK (direct)               │
│            └───────────────────┬──────────────────────────────────────┘
└────────────────────────────────┼─────────────────────────┘
                                 │
         ┌───────────────────────┴──────────────────────┐
         │                                              │
┌────────┴─────────┐                         ┌──────────┴──────────┐
│    Firestore     │                         │  Cloudflare Worker  │
│ tasks / projects │                         │ iCal fetch + sync   │
│ activityLog      │                         │ verifies Firebase   │
│ calendar mirror  │                         │ ID token, expands   │
│ admins / invites │                         │ iCal to mirror docs │
└────────┬─────────┘                         └──────────┬──────────┘
         ▲                                              │
         │                                              │
         └───────────────────────┬──────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    MCP Server (stdio)   │
                    │ MCP-compatible client   │
                    └─────────────────────────┘
```

### Key Architectural Decision: Spark-Compatible Architecture

The active production path uses direct Firestore access from the browser for app data, plus a Cloudflare Worker for calendar fetching. Firebase Cloud Functions are not part of the deployed architecture because the project stays on the Spark plan and avoids Blaze-only deployment paths.

Current responsibilities:
- **Firebase Auth**: email/password sign-in, admin detection, invite-gated signup
- **Firestore**: owner-scoped app data (`tasks`, `projects`, `activityLog`), calendar mirror collections (`calendarMirrorEvents`, `calendarMirrorFeedMeta`), plus auth/admin metadata
- **Cloudflare Worker**: fetches private iCal feeds and verifies Firebase ID tokens; sync writes expanded events into Firestore for the SPA to subscribe via the Firebase SDK
- **MCP server**: local stdio bridge for MCP-compatible assistant workflows

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
├── TabBar — primary tabs: Today, Projects (`TabId` still includes `icebox` for routing)
├── Header Menu (`SideDrawer`) — Icebox entry (badge count), Invites (admins), sign out
├── TodayView/
│   ├── DayCalendar (wake–bed hour grid; drag-and-drop placement for boulders, rocks, pebbles)
│   │   ├── `dayCalendarOverlapLayout.ts` — side-by-side lanes when timed events overlap (priority: boulder → rock → pebble → iCal)
│   │   └── DayCalendarEventModal — detail modal for external (iCal) events
│   ├── DueSoonSidebar (tasks nearing deadline; expandable cards)
│   ├── Inline Inbox (capture input + boulder/rock/pebble classify buttons)
│   ├── BoulderSidebar / RockSidebar / PebbleSidebar (single visible column via `sidebarMode`; each supports drag-reorder persisted via `reorderPebbles` batch API)
│   └── CalendarFeedSettings (feed CRUD when API configured)
├── IceboxView/
│   └── IceboxView (grouped list of iceboxed tasks, reactivate or delete)
├── ProjectsView/
│   ├── ProjectListView (project list + unassociated-task rail/drawer + create)
│   └── ProjectDetailView (markdown editor + task sections + activity log)
└── shared/
    ├── TaskEditPanel (reusable task metadata editor: title, notes, classification, priority, project, deadline, recurrence)
    ├── SideDrawer (mobile task drawer on Today; project rail drawer; header Menu on all layouts)
    └── Toast (global error toast system)

Hooks (all in src/hooks/):
├── useAuth.ts → Firebase Auth state, admin detection, sign-in/sign-out
├── useTasks.ts → api/tasks.ts → Firestore (lists by classification, inbox, icebox, due-soon, mutations)
├── useProjects.ts → api/projects.ts → Firestore
├── useCalendar.ts → `api/calendar.ts` + `api/calendarMirror.ts` → Worker sync + Firestore mirror subscription (`useEventsForRange`, feed hooks)
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

**What it does:** Unclassified tasks enter via a text input at the top of the Today task workspace. Each shows the task title with buttons for boulder, rock, or pebble. Classifying moves the task to the top of the respective ordered list. There is no standalone Triage tab — capture and classification happen inline on the Today page.

**Location in component tree:**
```
TodayView task workspace (above the ordered task sections)
├── Text input (Enter to capture)
└── Inbox task rows[] (one per unclassified task)
    ├── Title
    ├── 🪨 button (classify as boulder → top of boulder list)
    ├── Rock button (classify as rock → top of rock list)
    └── Pebble button (classify as pebble → top of pebble list)
```

**State management:**
- `useInboxTasks()` → queries `listTasks({ classification: 'unclassified', status: 'active' })`
- Today View uses `useTodayInboxTasks(projectFilter)` so the inbox list respects the same project filter as boulders/rocks
- `useCreateTask()` mutation → `createTask({ title })`
- `useClassifyTask()` mutation → `updateTask(id, { classification })` — assigns `sortOrder` via `getTopSortOrder()` to place at top of list

**Edge cases:**
- Empty inbox: section collapses, only input visible
- Classifying as boulder, rock, or pebble puts the task at the **top** of the list (lowest sortOrder)

---

### Feature 2: Ordered Task Management (Boulders, Rocks, Pebbles)

**What it does:** The Today task workspace contains ordered lists for boulders, rocks, and pebbles. Each list supports drag-and-drop reorder, shortcut buttons, and complete/icebox via expanded card view.

**Component tree:**
```
BoulderSidebar / RockSidebar / PebbleSidebar
└── Task card[] (one per active task in that classification)
    ├── Drag handle (⠿) with ⤒/↓ stacked below
    ├── Task title (click to expand → TaskEditPanel)
    ├── Project name (if assigned)
    ├── Deadline flag (⚑) + recurrence indicator (↻)
    └── Classification-specific metadata (e.g. staleness indicator on pebbles, placed-on-calendar state when `placement` is set)
```

**State management:**
- `useBoulders()`, `useRocks()`, and `usePebbles()` fetch sorted task lists by classification
- Local `localOrder` state for optimistic drag reordering on all three ordered sidebars
- On drag end: update local state immediately, then `reorderPebbles()` (Firestore `writeBatch` in `api/tasks.ts` — the name is historical) with new `sortOrder` values for the affected list
- Bump-to-top: assigns `sortOrder = firstPebble.sortOrder - 1000`
- Drop-by-10: inserts between positions 10 and 11 using fractional indexing

**Sort order strategy:**
- Boulders, rocks, and pebbles use a numeric `sortOrder` field (fractional indexing)
- **New tasks (from inbox classification) go to the top of their list** via `getTopSortOrder()` which finds the minimum sortOrder and subtracts 1000
- Fallback for missing composite index: `-1000 + Math.random() * 100`
- Full drag reorder: assigns fresh integer sortOrders to all items via `writeBatch`

**Persistence:**
- `reorderPebbles()` in `api/tasks.ts` performs a Firestore `writeBatch` of `sortOrder` updates. Boulder, Rock, and Pebble sidebars call it directly after list reorder; the `useReorderPebbles()` hook is available when a mutation-shaped API is preferred (invalidates `['tasks']`).

---

### Feature 3: Today View (Daily Planning)

**What it does:** Adjustable multi-day calendar whose visible time range is driven by per-user **wake** and **bed** hours (defaults 8–22). The grid shows mirrored Google Calendar (iCal) events plus **placed tasks**: boulders, rocks, and pebbles that have a `placement` on the visible day. On desktop, Today uses a split layout with a task workspace column; on mobile, the workspace lives in a right-edge `SideDrawer`. Overlapping timed events render in **side-by-side lanes** within each overlap cluster so blocks stay readable; lane order favors **boulders, then rocks, then pebbles, then iCal-backed meeting/personal** types (`dayCalendarOverlapLayout.ts`).

**Navigation & filters:**
- Horizontal day strip with previous/next day, “Today,” and configurable **day count** on larger viewports (persisted in `localStorage`, default 3). **Mobile** always shows **one** day (`visibleDayCount` derived from `useIsMobile()`). Scroll position is clamped to a finite past/future window (`calendarLimits.ts`).
- **Project filter** and **priority filter** (high/med/low) narrow sidebar lists; filters persist in `localStorage`.
- **Sidebar mode** toggles which ordered list is visible: boulders, rocks, or pebbles (persisted).
- Optional **CalendarFeedSettings** and refresh when `VITE_API_BASE` is set.

**Component tree:**
```
TodayView
├── Header row (date strip, filters, settings, mobile drawer trigger)
├── DayCalendar × N (one per visible day; compact when N > 1)
│   ├── Half-hour slot lines (wake–bed)
│   ├── All-day stacked rows when needed
│   ├── Drop indicator + “now” line (today only)
│   └── Timed overlays: external iCal-colored events + placed boulder/rock/pebble blocks
│       (move, resize, remove; overlap lanes via dayCalendarOverlapLayout.ts)
├── DayCalendarEventModal — external event details on click
├── DueSoonSidebar (when due-soon tasks exist)
├── Desktop column / mobile SideDrawer
│   ├── Inline Inbox (capture + classify)
│   └── BoulderSidebar | RockSidebar | PebbleSidebar (one visible via sidebarMode)
└── CalendarFeedSettings (when opened)
```

**Placement flow (persisted on the task):**
1. User drags a boulder, rock, or pebble from the workspace onto a day grid (or due-soon tasks that are schedulable).
2. A drop indicator shows the snapped time (15-minute increments).
3. On drop, `updateTask` writes `placement: { date, startHour, duration }` (default duration 2h if none). The task **stays in the sidebar** with a dimmed/placed visual state.
4. Move: pointer drag on the block updates `placement.startHour`. Resize: bottom handle updates `placement.duration`.
5. → clears `placement` (`null`) on the task document.
6. Metadata edits use `TaskEditPanel` as elsewhere.

**Overlap lanes:**
- Timed events partitioned into **overlap-connected components**; each component uses `columnCount` equal-width lanes with a small gap.
- **Column assignment** processes events in priority order (boulder → rock → pebble → meeting → personal), each taking the lowest free lane that does not intersect an already placed overlapping event — so higher-priority work tends to appear **leftmost**.
- While moving or resizing a placed task, layout recomputes from preview geometry so lanes update live.

**Snap grid:**
- `SNAP = 0.25` (15 minutes)
- `PX_PER_HOUR = SLOT_HEIGHT * 2`
- `yToHour()` maps pointer Y to snapped hour

**Calendar data:**
- When `VITE_API_BASE` is set: `useEventsForRange(startDate, days)` subscribes to Firestore calendar mirror updates (`subscribeCalendarMirror` in `api/calendarMirror.ts`) and triggers periodic Worker sync (`runCalendarSync`).
- When unset: mock events for today only (`MOCK_CAL_EVENTS` in `todayCalendarBridge.ts`).
- `icalToCalEvents()` maps `CalendarEvent[]` to `CalEvent[]` (includes mirror doc id prefixing for stable keys).

**Client state (TodayView) — highlights:**
- `drawerOpen` — mobile task drawer
- `sidebarMode` — `'boulders' | 'rocks' | 'pebbles'`
- `dayCount`, `wakeUpHour`, `bedTimeHour`, `startDate` — calendar scope (several persisted)
- `projectFilter`, `priorityFilter`, `isFilterExpanded` — sidebar filtering (persisted)
- `expandedTaskId`, `captureValue`, `isSettingsOpen`, `shouldBustCache`
- **Placement** itself is **not** ephemeral local state: it lives on each `Task` in Firestore (`placement` field).

---

### Feature 4: Icebox View

**What it does:** Displays all iceboxed tasks grouped by classification (boulders, rocks, pebbles, unclassified). Each task can be reactivated into an active classification or permanently deleted.

**Component tree:**
```
IceboxView
├── Section header (task count)
├── Boulders group
│   └── IceboxCard[] (title, project name, notes, action buttons)
├── Rocks group
│   └── IceboxCard[]
├── Pebbles group
│   └── IceboxCard[]
└── Unclassified group
    └── IceboxCard[]
```

**Actions per card:**
- 🪨 button → reactivate as boulder (`useReactivateTask`)
- Rock / Pebble buttons → reactivate with that classification (`useReactivateTask`)
- Delete button → confirmation → permanent delete (`useDeleteTask` → Firestore `deleteDoc`)

**State management:**
- `useIceboxedTasks()` → queries `listTasks({ status: 'iceboxed' })`
- Badge count on Icebox tab driven by `iceboxTasks.length` in App.tsx

---

### Feature 5: Projects

**What it does:** Projects are freeform markdown documents with associated tasks. Desktop uses a project-centric two-column layout: project content on the left, and a right rail of active tasks with no project for drag assignment. On mobile, that rail becomes a right-edge overlay drawer.

**Component tree:**
```
ProjectListView
├── Create project input
├── Project rows (grouped: active, then on hold)
│   ├── Project name (clickable)
│   ├── Status toggle button
│   └── Drop target for assigning unassociated tasks
└── No Project rail / drawer
    ├── Unassociated active tasks
    └── Classification filter (all/unclassified/boulder/rock/pebble)

ProjectDetailView
├── Breadcrumb (← Projects / Project Name)
├── Header (name + status + toggle button)
├── Split layout
│   ├── Left: Markdown textarea (auto-save, 1s debounce)
│   │   └── Activity Log (collapsible)
│   │       └── Log entries with timestamps
│   └── Right: Task sections
│       ├── Add task input + boulder / rock / pebble type toggle
│       ├── Boulders section (click title → TaskEditPanel)
│       ├── Rocks section (click title → TaskEditPanel)
│       ├── Pebbles section (click title → TaskEditPanel)
│       ├── Completed section (collapsible)
│       └── Assistant hint text
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
├── Classification + priority controls
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

**Global chrome:** The signed-in header shows **Today** and **Projects** tabs plus a **Menu** control. **Icebox** and **Invites** (admins only) live in that menu; keyboard shortcuts **`1` / `2` / `3`** still switch **Today / Icebox / Projects** when focus is not in an input.

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
  classification: 'unclassified' | 'boulder' | 'rock' | 'pebble';
  status: 'active' | 'completed' | 'iceboxed';
  priority: 'high' | 'med' | 'low';        // Default 'low'; surfaced in Today filters and TaskEditPanel
  deadline: Timestamp | null;              // Firestore Timestamp, converted to ISO string client-side
  recurrence: RecurrenceRule | null;       // See RecurrenceRule below
  projectId: string | null;               // FK to projects collection
  sortOrder: number;                       // Fractional index for boulder, rock, and pebble ordering
  placement: {                             // Optional time block on Today calendar (persisted)
    date: string;                          // YYYY-MM-DD
    startHour: number;                     // e.g. 9.5 for 9:30
    duration: number;                      // hours
  } | null;
  completedAt: Timestamp | null;           // Set on completion via serverTimestamp()
  lastOccurrenceCompletedAt: Timestamp | null; // Used by recurrence / completion flows when applicable
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
| `['tasks', filters]` | `useTasks(filters)` (non–active-all paths) | 30s (global default) |
| `['tasks', 'active-all']` | Single shared query for all active tasks; `useInboxTasks`, `useBoulders`, `useRocks`, `usePebbles`, and Today-scoped hooks use `select` to slice by classification / project filter | 30s |
| `['tasks', 'iceboxed']` | `useIceboxedTasks()` | 30s |
| `['projects']` | `useProjects()` | 30s |
| `['projects', id]` | `useProject(id)` | 30s |
| `['activityLog', projectId]` | `useProjectActivityLog(id)` | 30s |
| `['calendar', 'range', uid, startDate, days]` | `useEventsForRange` + mirror subscription | `staleTime: Infinity` (live updates via `setQueryData`) |

**Invalidation strategy:**
- Task mutations invalidate `['tasks']`, which refreshes the shared `active-all` query and any other task query prefixes the app uses
- List reorder from sidebars persists via `reorderPebbles()` without always calling `invalidateQueries` (the optimistic `localOrder` holds until the next refetch)
- Project mutations invalidate `['projects']`
- Project status toggle also invalidates `['tasks']` (boulder visibility changes)

### Client State (not in React Query)

| State | Location | Purpose |
|-------|----------|---------|
| `activeTab` | App.tsx `useState` | Current primary tab (`today` / `projects`); `icebox` reachable via Menu or keyboard `2` |
| `openProjectId` | App.tsx `useState` | Project detail navigation |
| `showAdmin` | App.tsx `useState` | Admin panel modal visibility |
| `showMenu` | App.tsx `useState` | Header Menu drawer (Icebox, Invites, sign out) |
| `drawerOpen` | TodayView `useState` | Mobile task-workspace drawer |
| `sidebarMode` | TodayView `useState` | Which ordered list is visible: boulders / rocks / pebbles |
| `dayCount`, `wakeUpHour`, `bedTimeHour`, `startDate` | TodayView | Calendar scope (several persisted via `localStorage`) |
| `projectFilter`, `priorityFilter` | TodayView | Sidebar list filters (persisted) |
| `expandedTaskId` | TodayView `useState` | Which task card shows `TaskEditPanel` inline |
| `captureValue` | TodayView `useState` | Inline inbox text input |
| *(placement)* | Firestore on `Task` | `{ date, startHour, duration }` or `null` — not separate React state |
| `drawerOpen` | ProjectListView `useState` | Mobile unassociated-task rail drawer |
| `markdown` | ProjectDetailView `useState` | Local editor state (debounced to server) |
| `localOrder` | Today sidebars `useState` | Optimistic drag reorder for ordered task lists |
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

**Context:** The activity log is supplementary context for humans and assistant workflows, not a critical data path. A failed log write should never block or error on a task completion.

**Consequences:**
- (+) Zero UX impact from log write failures
- (+) Simpler code — no error handling UI for a background concern
- (-) Log entries may be silently lost (acceptable — it's an audit trail, not a ledger)

---

### ADR-004: Fractional Indexing for Task Sort Order

**Decision:** Boulder, rock, and pebble ordering use numeric `sortOrder` values with fractional midpoints for insertions.

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

**Context:** Tree views, mind maps, and hierarchical task structures were discarded in favor of the insight that premature decomposition kills projects. Let intent evolve in prose and let an external assistant decompose it into tasks on demand via MCP.

**Consequences:**
- (+) Dramatically simpler data model — just a text field
- (+) Zero UI complexity for "structure" — just a textarea
- (+) An assistant can reason about the full project context by reading markdown
- (-) No structured metadata extraction (milestones, deadlines) from project docs; that remains an external workflow

---

### ADR-006: AI Lives Outside the App

**Decision:** No AI features, API keys, or ML models in the codebase. Any assistant intelligence is provided externally via the MCP server.

**Context:** Baking AI into the app means managing API keys, prompt engineering in the frontend, loading states for AI calls, error handling for AI failures, and coupling to a specific model. By keeping the app as a pure CRUD system, it stays simple and durable. Assistant-driven capture, triage assistance, project decomposition, cleanup, and auditing stay outside the app.

**Consequences:**
- (+) App codebase stays simple — no AI dependency, no API costs
- (+) Assistant capabilities can improve independently of the app
- (+) Mobile capture can be supported without building a dedicated mobile UI
- (-) Assistant-driven workflows require an MCP-compatible client running; there is no in-app intelligence
- (-) MCP server is an additional deployment artifact to maintain

---

### ADR-007: Calendar Placement Stored on the Task Document

**Decision:** When a boulder, rock, or pebble is placed on the day calendar, `placement: { date, startHour, duration }` is written to the task in Firestore via `updateTask`. Removing from the calendar sets `placement` to `null`. The task **remains** in its ordered sidebar list with a dimmed/placed visual distinction.

**Context:** Daily planning should survive refresh and multi-device use. Treating the time block as task metadata (like deadline) avoids a separate “calendar-only” store while keeping the mental model: the list is the inventory, the grid is the schedule sketch.

**Consequences:**
- (+) Placements sync across sessions and devices with normal task sync
- (+) Ordered lists still show the full set; placement is orthogonal to `sortOrder`
- (+) One mutation path (`updateTask`) for move, resize, and clear
- (-) Extra Firestore writes when dragging on the grid (acceptable for explicit user actions)
- (-) No separate audit trail of placement history beyond `updatedAt`

---

### ADR-008: Triage Absorbed into Today View

**Decision:** Eliminated the standalone Triage tab. Capture and classification happen inline at the top of the Today sidebar.

**Context:** The Triage tab was a separate view with project/deadline/recurrence assignment during classification. In practice, most inbox items just need a quick boulder/rock/pebble decision. Metadata can be edited later via TaskEditPanel from any view. Reducing tabs from 4→3 simplifies navigation.

**Consequences:**
- (+) Fewer tabs, faster workflow — capture and classify without leaving the planning view
- (+) Inbox and capture share the Today task column — no separate triage view
- (+) TaskEditPanel provides full metadata editing everywhere, so triage-time metadata assignment isn't needed
- (-) No project/deadline assignment at classification time (must expand card later)

---

### ADR-009: Overlap Columns on the Today Calendar

**Decision:** When two or more timed calendar entries intersect, they render in equal-width horizontal lanes within the same overlap cluster (Google Calendar–style). Lane indices are assigned in **priority order**: boulder, then rock, then pebble, then iCal types (meeting, personal), so higher-priority work tends to occupy the **left** columns.

**Context:** Full-width stacked cards made background events unreadable. Lane layout preserves scanability without hiding lower-priority items entirely.

**Consequences:**
- (+) Concurrent meetings and placed tasks remain visible side by side
- (+) Product preference (boulders over rocks over external calendar) is reflected in layout
- (-) Many simultaneous events produce narrow columns; titles truncate more aggressively
- (-) Implementation lives in `dayCalendarOverlapLayout.ts` and must stay in sync with `CalEvent` types

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

**Implementation:** The Cloudflare Worker verifies the caller’s Firebase ID token, fetches configured private iCal URLs, parses events with `ical.js` (including RRULE expansion), and **syncs** normalized instances into **Firestore** (mirrored event documents per user). The SPA does not long-poll the Worker for day cells: it uses `subscribeCalendarMirror` (`api/calendarMirror.ts`) so React Query receives realtime updates, and `runCalendarSync` triggers periodic refresh (throttled per user in `useCalendar.ts`).

**Feed configuration:** Authenticated clients manage feeds through calendar API endpoints reflected in the UI as `CalendarFeedSettings` (create/update/delete feed metadata).

**Timezone handling:** Worker and expansion logic respect user timezone (e.g. `?tz=` / client-supplied context) so “today” and ranges match local planning.

**Requirements:**
- Multiple calendar feeds (work, personal, etc.)
- Read TRANSP (and related) data for busy/free display
- Staleness on the order of minutes is acceptable; mirror + throttled sync keep UX fresh without hammering origins
- Never writes back to Google Calendar

**Fallback state:** If `VITE_API_BASE` is unset, Today View uses hardcoded mock events for the current day only.

### MCP Server (Phase 5 — Built)

**Location:** `mcp-server/` directory. TypeScript MCP server using `@modelcontextprotocol/sdk` with stdio transport.

**Connection:** Uses the Firebase Web SDK (same client SDK as the frontend) with hardcoded project config. No service account needed — runs locally with the same Firestore access as the browser.

**18 tools implemented:**
| Tool | Description |
|------|-------------|
| `add_task` | Create task (inbox by default, or specify classification, priority, project, deadline) |
| `list_inbox` | List unclassified tasks for triage |
| `classify_task` | Classify as boulder/rock/pebble; optional project + deadline |
| `search_tasks` | Search by title with optional status/classification filters |
| `get_task` | Fetch a task's full details |
| `update_task` | Update task fields (title, notes, classification, priority, status, project, deadline, sortOrder, etc.) |
| `reorder_tasks` | Set list order by passing task IDs (rewrites sort orders) |
| `complete_task` | Complete a task (handles recurrence auto-generation) |
| `icebox_task` | Icebox a task |
| `list_boulders` | List active boulders, grouped by project |
| `list_rocks` | List active rocks |
| `list_pebbles` | List pebbles in order, optional stale-day filter + limit |
| `list_projects` | List projects with optional status filter |
| `get_project` | Markdown + active (by classification) + completed tasks |
| `create_project` | Create project with optional initial markdown |
| `update_project` | Update project markdown, name, or status |
| `get_today` | Planning snapshot: boulders, rocks, top pebbles, inbox count |
| `suggest_tasks_for_project` | Project doc + tasks (incl. iceboxed) formatted for assistant suggestions |

**Setup:** `cd mcp-server && npm install && npm run build`, then configure it in your MCP-compatible client:
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
  - [x] Capture + classification (now inline on Today; triage-only view retired)
  - [x] Tab navigation; icebox count surfaced from Menu drawer

- [x] **Phase 2: Pebble Sorting**
  - [x] Pebble sort order persistence (fractional indexing)
  - [x] Drag-and-drop reorder with optimistic UI
  - [x] Shortcut buttons (bump to top, drop by 10, complete, icebox)
  - [x] Deadline flags and staleness indicators
  - [x] Batch reorder via Firestore writeBatch

- [x] **Phase 3: Today View**
  - [x] Day calendar with configurable wake/bed hours and multi-day strip
  - [x] Event rendering with feed-driven colors; placed boulder/rock/pebble blocks
  - [x] Drag-and-drop placement with 15-minute snap grid; move and resize
  - [x] Tasks stay in sidebar when placed (dimmed distinction); placement persisted on task
  - [x] Boulder / Rock / Pebble sidebars with mode switch and reorder persistence
  - [x] Overlap columns for concurrent timed events (priority-ordered lanes)
  - [x] iCal via Worker + Firestore calendar mirror subscription

- [x] **Phase 4: Projects**
  - [x] Project data model + Firestore CRUD (`api/projects.ts`)
  - [x] React Query hooks for projects (`hooks/useProjects.ts`)
  - [x] Project List View (active/on-hold grouping, inline create, status toggle)
  - [x] Project Detail View (markdown editor + task sidebar)
  - [x] Auto-save markdown with 1s debounce
  - [x] Task creation from project page (boulder / rock / pebble toggle)
  - [x] Activity log (auto-generated entries, collapsible display)
  - [x] Completed tasks section with timestamps

- [x] **Phase 5: MCP Server**
  - [x] Set up TypeScript MCP server project with stdio transport
  - [x] Connect to Firestore via Firebase Web SDK (no service account needed)
  - [x] 18 tools implemented (tasks, search/reorder, projects, planning composites)
  - [ ] Configure in an MCP-compatible client and test conversationally

- [x] **Phase 6: iCal + Recurring Tasks + Polish**
  - [x] Cloudflare Worker for iCal feed fetching and Firebase-token verification
  - [x] Deploy Worker and configure iCal feed URLs in Worker secrets
  - [x] Frontend calendar API + Firestore mirror client (`api/calendar.ts`, `api/calendarMirror.ts`, `hooks/useCalendar.ts`)
  - [x] Today View uses mirrored events when API configured, falls back to mock events
  - [x] Full recurrence system: 6 types (daily, weekly, monthly, yearly, periodically, custom)
  - [x] Recurrence UI with day-of-week picker, interval controls, custom unit toggle
  - [x] Error handling UI — global toast system
  - [x] Keyboard shortcuts — `1`/`2`/`3` switch Today / Icebox / Projects (inputs excluded)
  - [x] Staleness indicators with color escalation

- [x] **Phase 7: UX Consolidation**
  - [x] Triage tab removed — inline inbox in Today sidebar
  - [x] Pebbles tab removed — PebbleSidebar is self-contained
  - [x] Icebox moved to header Menu (not a main tab); reactivate/delete per classification
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
