# Task Queue — Strategy & North Star

## 1. Vision & "The Vibe"

- **The Vibe:** Calm, intentional, zero-overhead. Opening the app feels like sitting down with a clean notebook and **your** plan — not logging into a work system. The daily ritual takes 2 minutes and the rest of the day you're just checking things off. When something is shared with the household, it appears on **Family** without turning the whole app into a team dashboard.
- **Visual Direction:** Warm, muted tones (cream, stone, soft shadows). Typography-driven, no icons where words work. Low-fi wireframe energy — functional, not flashy. The UI should feel like a tool built for one person, not a product marketed to thousands.

## 2. The "Why" (Problem Statement)

- **Problem:** Many task management tools are built for teams coordinating across large projects. For an individual managing personal, household, and creative work, these tools are often bloated, expensive for key features such as calendar integration, and organized around concepts that do not match how one person thinks about a day. Household-relevant work often ends up either duplicated across people’s apps or stuffed into a “team” product that is overkill. The result: important tasks get buried, planning feels like overhead rather than a catalyst, and lightweight sharing becomes harder than it should be.
- **Impact of Solution:** A purpose-built app that helps you align your daily time with your life priorities. You define your **investments** — the domains where you deliberately allocate time and energy — and within each, mark what’s **vital** (strategic or critical) versus everything else. Planning means scheduling vital work first, then filling remaining time intentionally, with task **sizing** (S/M/L) helping you match work to available slots. **Me** is your personal planner; **Family** is the shared surface for household-visible work — same calendar discipline, without forcing everything to be “team software.” An external assistant handles capture, decomposition, and cleanup via MCP. The result is one system that feels trustworthy enough to use every day.

## 3. Success Principles

1. **Vital work first.** The app's primary job is helping you identify and protect what's truly strategic or critical. The planning toggle separates vital tasks from everything else — a cognitive protection mechanism that prevents the urgent-but-not-important from pulling your attention. If you're drowning in non-vital work, the system has failed.
2. **Investments reflect life priorities.** Your time is a portfolio. Investments are ranked to express how you want to allocate across life domains. Two-level prioritization — between investments, then within each — makes deliberate distribution manageable without forcing you to sort dozens of tasks in a single list.
3. **Resist premature decomposition.** Investments have optional markdown bodies for planning at whatever fidelity is appropriate. Initiatives exist for multi-task efforts that earn a named grouping, but the threshold is deliberately high — the term “initiative” was chosen to create healthy friction against over-structuring. An external assistant translates prose to tasks on demand.
4. **AI lives outside the app.** The app is a simple, durable CRUD system. An external assistant can provide capture, triage, decomposition, cleanup, and auditing via MCP without adding complexity to the codebase.
5. **Self-regulating systems over artificial limits.** Too many active investments → overwhelming vital list → natural pressure to put some on hold. No caps, no warnings, just feedback loops.
6. **Default to preservation, allow cleanup.** Most workflows should preserve history through completion, iceboxing, or on-hold status, but explicit deletion is allowed when you are intentionally cleaning up tasks or investments.
7. **Individuals first, family when it helps.** Every task belongs to at least one person. “Family” is an overlay for visibility and shared planning — not a separate bucket of orphan chores. A task can be on both **Me** and **Family**; it still schedules **once** on the calendar.
8. **Terminology guides behavior.** Names were chosen not just for accuracy but for the usage patterns they encourage over time. “Investment” frames allocation as intentional. “Vital” carries both strategic importance and critical urgency. “Initiative” sets a higher bar than “project” to prevent proliferation.

## 4. User Personas & Scenarios

- **Primary Persona:** An individual managing a mix of personal, household, and creative tasks. Thinks in terms of life investments and deliberate time allocation. Uses desktop for planning and mobile for quick review/capture. Wants a system that matches how they think, not one they have to adapt to. Uses **Me** for their queue and **Family** when tasks or investments are marked visible to the household.
- **Secondary Persona:** Lightweight collaborator (evolving). Same household, separate login: sees shared family-visible work and their own **Me** view. Will not tolerate onboarding overhead. Think “shared notes app” energy extended to tasks — not a project management suite.

### Key Scenarios

- **Morning Planning (2 min):** Open app on **Me**. Glance at today's calendar. Toggle to **Vital** — see vital tasks grouped by investment in rank order. Schedule the most important work first, balancing across investments intuitively. Toggle to **Other** — fill remaining calendar slots, using task sizes (S/M/L) to match work to available time. Optionally switch to **Family** to align on household-visible items. Done. You know what your day looks like.
- **Capture on the Go (5 sec):** An idea strikes while away from the desk. Use an external assistant or quick capture surface to add a task. It lands in the inbox and the thought is out of the way.
- **Initiative Kickoff (10 min, with assistant support):** Create an initiative within an investment, feed in the planning notes, and ask for suggested tasks with sizes. You approve the suggestions and they land in the backlog.
- **Task Cleanup (10 min, with assistant support):** Once every week or two, review stale tasks with an assistant or lightweight batch workflow. Decide whether to icebox, roll into an initiative, or leave them alone.
- **During the Day:** Work your scheduled tasks. In a gap between meetings, scan for unscheduled S-sized tasks near the top of your lists. Check one off. Move on.

## 5. High-Level Capabilities

### MVP (P0) — Core Replacement Scope

1. **Task Management** — Create tasks with title, notes, deadline, optional recurrence. Mark as **vital** (strategic or critical) or leave unmarked. Size as **S** (~5 min), **M** (~1 hr), or **L** (2-3 hr). Statuses: active, completed, iceboxed. Assign to an investment, an initiative within an investment, or leave orphaned. Tasks are always flat — no nesting, no subtasks, no dependencies. Tasks live in a **household** data scope (solo household in v1) and always have **at least one individual** assignee; **family visibility** is optional (pin, investment default, or opt-out).
2. **Investments** — Top-level containers representing domains of deliberate time allocation. Ranked against each other to express portfolio priority. Optional markdown body for planning and notes. Status: active / on hold / completed. Optional **family-visible** flag: new tasks in that investment default to family visibility; individual tasks can **opt out**. On-hold investments hide their tasks from both planners.
3. **Initiatives** — Named efforts within an investment for work that exceeds a single L-sized task. One nesting level only. Ranked within their parent investment. Optional markdown body. Have their own vital/other task lists. The term "initiative" is chosen to set a higher bar than "project" — only create one when work genuinely warrants decomposition.
4. **Inline Triage** — Inbox of unclassified tasks at the top of the **Me** or **Family** planner. Set vital flag, size, and optionally assign to an investment/initiative.
5. **Me & Family Planners** — Same daily-planning UI for both: adjustable multi-day calendar on larger screens and a single-day calendar on mobile. Toggle between **Vital** and **Other** views — vital-first planning is a cognitive protection mechanism against urgency bias. Tasks grouped by investment (in rank order) with orphans in a separate section. Any task can be dragged onto the calendar. The task workspace lives in the right sidebar on desktop and a right-edge drawer on mobile. **Me** shows tasks assigned to you; **Family** shows tasks that are family-visible (including those also on Me). **List sort order is separate** per surface so priorities can differ. **Calendar placement is singular** — a task appears once on the grid regardless of Me/Family.
6. **Ordered Task Lists** — Within each investment group, vital and other tasks are separately ranked. Drag to reorder (persists Me order vs Family order independently). Shortcut buttons: bump to top, drop by 10. Complete or icebox inline. Size badges, deadline flags, and staleness indicators visible. Tasks needing a time block (M/L) get a subtle visual accent within the list to aid scanning during planning.
7. **Google Calendar Integration** — Read-only. Fetch today’s events via iCal feed URLs. Supports multiple calendars. Reads busy/free availability. Never writes back. *(Roadmap: feeds owned by the person who added them; optional sharing to Family + other members’ Me views without duplicate mirror reads — see engineering spec.)*
8. **API + MCP Server** — All functionality via the app data layer and MCP server. The MCP server exposes the investment/initiative/task model to external assistants, so capture, decomposition, cleanup, triage assistance, and productivity auditing can happen through conversation rather than app-specific features. *(MCP may lag new household/family fields until explicitly updated.)*

### P1 — Next

9. **Multi-account household** — Invite or join a second (or more) household member; shared household data; UI to assign tasks to multiple individuals. Builds on family-visible investments/tasks already in P0.
10. **Planning Calendar Refinement** — Multi-day view for tentatively slotting tasks onto upcoming days. Rough sketch, not deadlines. Personal and shared views.
11. **Periodic Task Cleanup UI** — Dedicated batch review of stale tasks. (Can be done via assistant workflows in MVP.)
12. **Mobile Capture UI** — Dedicated lightweight capture interface. (Assistant/MCP workflow is sufficient for MVP.)

### P2 — Later

13. **Productivity Auditing** — An assistant reviews completion patterns and investment distribution. (Enabled by MCP, just a conversation pattern.)
14. **Android Widget** — Calendar-only, showing today's scheduled tasks and events.
15. **Push Notifications** — Not needed; pull-based is sufficient.

## 6. Non-Goals

### Out of Scope
- **Enterprise/team features**: no org charts, no complex roles — household scale only
- **Cross-assignment (v1)**: tasks still default to the creator as assignee; multi-assignee UX and invites are P1
- **Task nesting or dependencies**: tasks are always flat — initiatives provide one level of grouping, not hierarchy
- **Deep nesting**: investments cannot nest within investments; initiatives cannot nest within initiatives. One level only.
- **AI baked into the app**: no prompts, no API keys, no ML in the codebase — any AI interaction happens externally via MCP
- **Writing to Google Calendar**: read-only integration only
- **Native mobile app**: web app is sufficient; mobile capture can happen through an assistant workflow

### Intentional Constraints
- **Desktop-first UI**: Desktop remains the primary planning experience, but core mobile flows should remain usable through focused layouts such as single-day calendars and overlay drawers.
- **Household v1 = solo member**: Data model supports a household and family visibility; adding a second account and multi-assignee workflows is P1. Email/password auth remains the gate today.
- **One level of nesting only**: Investments contain initiatives; initiatives contain tasks. No deeper nesting. This is a hard constraint in the data model, not a convention.
- **Free hosting**: Firebase free tier. No paid services.
- **No heavy real-time collaboration**: Firestore handles persistence and live updates, but the product is not optimized for simultaneous editing wars or enterprise concurrency.

---

## Resolved Questions

1. **Recurring tasks**: Completing a recurring task auto-generates the next occurrence near the top of its task list. Iceboxing stops future generation.
2. **Sort persistence**: Sort order is persistent. **Me** and **Family** maintain **independent** orderings for the same task where both surfaces apply. New tasks use top-of-list placement for the relevant surface (see engineering spec for fractional indexing).
3. **Calendar auth**: iCal feed URLs for MVP (no OAuth). Supports multiple feeds. Reads busy/free. Can be 30+ min stale — acceptable for morning planning.
4. **Hosting / database**: Firebase (Firestore). Free tier. Household documents back solo users today; Google SSO remains a P1 positioning option if needed.
5. **Family vs individual**: A task is never “family-only”; it always belongs to at least one person. Investments cannot be family-only either. Family visibility layers on top; tasks can opt out of family even inside a family-visible investment.
6. **One schedule**: Regardless of Me/Family visibility, a task has at most one time block on the planner calendar.
7. **Vital is a flag, not a category**: A task is either marked vital or it isn't. “Other” is used only as a UI toggle label, not as an explicit classification. This avoids forcing a decision on every task — unmarked is the default.
8. **Size is required**: Every task gets a size (S/M/L). Anything larger than L should be decomposed into an initiative with multiple tasks.
9. **Terminology is intentional**: “Investment,” “initiative,” “vital,” and sizing (S/M/L) were chosen to guide behavior. See Success Principles #8.
