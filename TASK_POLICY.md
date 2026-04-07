# Task Policy

This document captures the expected user mental model for task visibility, responsibility, and ordering. It is intentionally product-facing rather than implementation-facing. UI and data model changes should follow these rules.

## 1. Roles

Creator:
The person who made the task.

Rules:
- A task always has exactly one Creator.
- The Creator is the person who originally made the task.
- The Creator is the only person who can change whether a task is private or shared inside a Family investment.

Responsible:
The person or people responsible for doing a Shared task.

Rules:
- Responsible applies only to Shared tasks.
- A Shared task can have zero, one, or many Responsible people.
- A Shared task with no Responsible people is called Unassigned.
- Private tasks do not use separate Responsible people. For a private task, the Creator is implicitly the person responsible.

Unassigned:
A Shared task with no Responsible people.

## 2. Sharing With Family

There are two investment types:

Individual investment:
Visible only to one person. Every task inside it is private.

Family investment:
Visible in shared family planning. Tasks inside it are Shared with family by default, unless the Creator turns on Don't share with family for a specific task.

Don't share with family:
The override that makes a task private even when it lives inside a Family investment.

Shared with family:
The default state for tasks in a Family investment.

### Individual investments

All tasks in an Individual investment are private.

Rules:
- The single visible person is the Creator.
- The task appears only in that person's `Me` view.
- The task never appears in `Family`.
- Responsibility is implicit: the Creator is also the person responsible.

### Family investments

Tasks in a Family investment are Shared with family by default.

Rules:
- Shared tasks always appear in `Family`.
- Shared tasks can be made private only by the Creator turning on Don't share with family.
- A private task in a Family investment is private to the Creator.
- A private task in a Family investment does not appear in `Family`.

### Conversion rules inside Family investments

Shared -> private:
- Allowed, but only by the Creator.
- Turn on Don't share with family.
- Clear all Responsible people.
- The task becomes private to the Creator.
- The task disappears from `Family`.

Private -> Shared:
- Allowed, but only by the Creator.
- Turn off Don't share with family.
- Responsible starts empty.
- The Creator is not auto-assigned.
- The task appears in `Family`.
- Because it is Unassigned, it also appears in everyone's `Me`.

## 3. Assignment

Assignment uses self-claimed responsibility.

Rules for Shared tasks:
- The Creator can mark themselves Responsible.
- The Creator can leave the task Unassigned.
- The Creator cannot assign another person directly.
- Any other family member can mark themselves Responsible.
- Any other family member can remove themselves from Responsible.
- People cannot assign another person.
- People cannot remove another person.

In plain language:
Responsibility is opt-in, not imposed on others.

### Editing, deleting, and completing Shared tasks

Shared tasks are collaborative.

Rules:
- Anyone who can see a Shared task can edit it.
- Anyone who can see a Shared task can delete it.
- Anyone who can see a Shared task can complete it.

If someone completes an Unassigned Shared task:
- Treat that as "this person did it."
- Completion can implicitly claim responsibility for history and attribution purposes.

## 4. Visibility And Sorting

### Visibility

`Family` view:
- Shows all Shared tasks in Family investments.
- Does not show private tasks.

`Me` view:
- Shows private tasks that belong to me.
- Shows Shared tasks where I am Responsible.
- Shows Unassigned Shared tasks.

### Sorting in Individual investments

All task ordering is personal.

Rules:
- Only one person can see the tasks.
- The task order is entirely that person's own order.

### Sorting in Family investments

Family investments contain two ordering layers:

Layer 1:
Shared-task order

Layer 2:
Per-person placement of that person's private tasks around the shared-task order

#### Shared tasks in Family investments

Rules:
- Shared tasks have one shared order for everyone.
- That order is the same in `Family` and in every person's `Me`.
- If a person moves a Shared task in `Me`, they are changing the shared order for everyone.
- Any family member can reorder Shared tasks.

#### Private tasks in Family investments

Rules:
- Private tasks are visible only to the Creator.
- Private tasks do not appear in `Family`.
- In the Creator's `Me`, private tasks can be placed before, between, or after Shared tasks.
- Multiple private tasks can exist in the same gap.

Important rule:
Private tasks in a Family investment are not ordered in one flat shared list.

Instead:
- Shared tasks form a shared backbone.
- Each person places their own private tasks into gaps around that backbone.

Those gaps are:
- Before the first Shared task
- Between any two Shared tasks
- After the last Shared task

### Stability when Shared tasks move

Private tasks should stay in the same priority band when Shared tasks move.

Example:
Shared order is:
A, B, C, D, E

My private task is:
X

My current `Me` order is:
A, B, X, C, D, E

Meaning:
X is lower priority than A and B, and higher priority than D and E.

If C moves elsewhere in the Shared order:
- X should not move with C.
- X should stay in the same gap relative to the surrounding Shared tasks that were not moved.

In plain language:
Private tasks are anchored to gaps between Shared tasks, not to absolute flat indexes.
