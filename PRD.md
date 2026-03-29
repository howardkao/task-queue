# Task Queue — Strategy & North Star

## 1. Vision & "The Vibe"

- **The Vibe:** Calm, intentional, zero-overhead. Opening the app feels like sitting down with a clean notebook and today's plan — not logging into a work system. The daily ritual takes 2 minutes and the rest of the day you're just checking things off.
- **Visual Direction:** Warm, muted tones (cream, stone, soft shadows). Typography-driven, no icons where words work. Low-fi wireframe energy — functional, not flashy. The UI should feel like a tool built for one person, not a product marketed to thousands.

## 2. The "Why" (Problem Statement)

- **Problem:** Many task management tools are built for teams coordinating across large projects. For an individual managing personal, household, and creative work, these tools are often bloated, expensive for key features such as calendar integration, and organized around concepts that do not match how one person thinks about a day. The result: important tasks get buried, planning feels like overhead rather than a catalyst, and lightweight collaboration becomes harder than it should be.
- **Impact of Solution:** A purpose-built app that matches a natural planning rhythm: pick boulders and rocks for meaningful work, sort pebbles for the cracks, and let an external assistant handle capture or decomposition workflows. The result is one system that feels trustworthy enough to use every day.

## 3. Success Principles

1. **Big work first.** The app's primary job is helping you pick and protect meaningful work — usually one boulder a day, sometimes supplemented by a rock. If you're drowning in pebbles, the system has failed.
2. **Projects are documents, not databases.** Premature decomposition is worse than no decomposition. Let intent evolve in prose; let an external assistant translate to tasks on demand.
3. **AI lives outside the app.** The app is a simple, durable CRUD system. An external assistant can provide capture, triage, decomposition, cleanup, and auditing via MCP without adding complexity to the codebase.
4. **Self-regulating systems over artificial limits.** Too many active projects → overwhelming boulder list → natural pressure to park some. No caps, no warnings, just feedback loops.
5. **Default to preservation, allow cleanup.** Most workflows should preserve history through completion, iceboxing, or on-hold status, but explicit deletion is allowed when you are intentionally cleaning up tasks or projects.

## 4. User Personas & Scenarios

- **Primary Persona:** An individual managing a mix of personal, household, and creative tasks. Thinks in terms of deep-work blocks, medium-sized tasks, and small tasks. Uses desktop for planning and mobile for quick review/capture. Wants a system that matches how they think, not one they have to adapt to.
- **Secondary Persona:** Lightweight collaborator. Interacts with shared projects as simple documents. Will not tolerate onboarding overhead. Think "shared notes app" rather than a project management suite.

### Key Scenarios

- **Morning Planning (2 min):** Open app. Glance at today's calendar. Scan candidate boulders and rocks. Slot one or two onto the calendar. Open pebbles, scan the top of the list, maybe re-sort one or two. Done. You know what your day looks like.
- **Capture on the Go (5 sec):** An idea strikes while away from the desk. Use an external assistant or quick capture surface to add a task. It lands in the inbox and the thought is out of the way.
- **Project Kickoff (10 min, with assistant support):** Activate a project, feed in the project notes, and ask for suggested boulders, rocks, and pebbles. You approve the suggestions and they land in the backlog.
- **Pebble Spring Cleaning (10 min, with assistant support):** Once every week or two, review stale pebbles with an assistant or lightweight batch workflow. Decide whether to icebox, roll into a project, or leave them alone.
- **During the Day:** Work your boulder or rock. In a gap between meetings, glance at the pebble sidebar. Check off the top one. Move on.

## 5. High-Level Capabilities

### MVP (P0) — Core Replacement Scope

1. **Task Management** — Create tasks with title, notes, deadline, optional recurrence. Classify as boulder/rock/pebble. Statuses: active, completed, iceboxed. Link to a project or leave standalone. Tasks are always flat — no nesting, no dependencies.
2. **Inline Triage** — Inbox of unclassified tasks at the top of Today. Classify each as boulder/rock/pebble, then refine metadata in the expanded editor when needed.
3. **Today View** — Adjustable multi-day calendar on larger screens and a single-day calendar on mobile. Boulders and rocks can be dragged onto the calendar. The task workspace lives in the right sidebar on desktop and a right-edge drawer on mobile. Pebbles are sorted with due-soon tasks at the top.
4. **Ordered Task Lists** — Full sortable lists of active boulders, rocks, and pebbles. Drag to reorder. Shortcut buttons to the left of the name: bump to top, drop by 10. Complete or icebox inline. Deadline flags and staleness indicators remain visible.
5. **Projects** — Markdown documents with a name, body, and status (active/on hold). On-hold projects hide their tasks from Today. Desktop uses a two-column project layout with an unassociated-task rail for drag assignment; mobile collapses that rail into a right-side drawer.
6. **Google Calendar Integration** — Read-only. Fetch today's events via iCal feed URLs. Supports multiple calendars. Reads busy/free availability. Never writes back.
7. **API + MCP Server** — All functionality via the app data layer and MCP server. The MCP server exposes the same task/project model to external assistants, including rocks, so capture, decomposition, cleanup, triage assistance, and productivity auditing can happen through conversation rather than app-specific features.

### P1 — Next

8. **Shared Projects** — Some projects visible to multiple collaborators. Everyone can edit the markdown and see associated tasks. Self-assigned tasks only; no cross-assignment. Requires auth (Google SSO).
9. **Planning Calendar Refinement** — Multi-day view for tentatively slotting boulders and rocks onto upcoming days. Rough sketch, not deadlines. Personal and shared views.
10. **Periodic Pebble Cleanup UI** — Dedicated batch review of stale pebbles. (Can be done via assistant workflows in MVP.)
11. **Mobile Capture UI** — Dedicated lightweight capture interface. (Assistant/MCP workflow is sufficient for MVP.)

### P2 — Later

12. **Productivity Auditing** — An assistant reviews completion patterns and coaches. (Enabled by MCP, just a conversation pattern.)
13. **Android Widget** — Calendar-only, showing today's boulder and events.
14. **Push Notifications** — Not needed; pull-based is sufficient.

## 6. Non-Goals

### Out of Scope
- **Enterprise/team features**: no teams, no roles, no permissions beyond personal/shared
- **Cross-assignment**: you only assign tasks to yourself
- **Task nesting or dependencies**: tasks are always flat
- **AI baked into the app**: no prompts, no API keys, no ML in the codebase — any AI interaction happens externally via MCP
- **Writing to Google Calendar**: read-only integration only
- **Native mobile app**: web app is sufficient; mobile capture can happen through an assistant workflow

### Intentional Constraints
- **Desktop-first UI**: Desktop remains the primary planning experience, but core mobile flows should remain usable through focused layouts such as single-day calendars and overlay drawers.
- **Single-user MVP**: No auth or sharing until P1. Start from a simple single-user workflow.
- **Free hosting**: Firebase free tier. No paid services.
- **No real-time sync**: Firestore handles persistence, but there's no multi-device real-time collaboration requirement in MVP.

---

## Resolved Questions

1. **Recurring tasks**: Completing a recurring task auto-generates the next occurrence at position 4 in the pebble list. Iceboxing stops future generation.
2. **Pebble sort persistence**: Sort order is global and persistent. New pebbles arrive at position 4 (below top 3, above everything else). Fresh items are likely higher priority than the stale bottom, but shouldn't displace your deliberately sorted top.
3. **Calendar auth**: iCal feed URLs for MVP (no OAuth). Supports multiple feeds. Reads busy/free. Can be 30+ min stale — acceptable for morning planning.
4. **Hosting / database**: Firebase (Firestore). Free tier, positions for Google SSO in P1.
