import { Router, Request, Response } from "express";
import * as admin from "firebase-admin";

// Helper to safely extract string from query params
function queryStr(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

// Helper to safely extract string from route params
function paramStr(val: unknown): string {
  if (typeof val === "string") return val;
  throw new Error("Invalid route parameter");
}

const router = Router();
const db = admin.firestore();
const tasksCollection = db.collection("tasks");

// Create a task
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      title,
      notes = "",
      classification = "unclassified",
      status = "active",
      deadline = null,
      recurrence = null,
      projectId = null,
    } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    // For new pebbles, calculate sortOrder (position 4, or end if fewer than 4 exist)
    let sortOrder = 0;
    if (classification === "pebble") {
      sortOrder = await getNewPebbleSortOrder();
    }

    const now = admin.firestore.Timestamp.now();
    const taskData = {
      title: title.trim(),
      notes,
      classification,
      status,
      deadline: deadline ? admin.firestore.Timestamp.fromDate(new Date(deadline)) : null,
      recurrence,
      projectId,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await tasksCollection.add(taskData);
    res.status(201).json({ id: docRef.id, ...taskData });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// List tasks with filters
router.get("/", async (req: Request, res: Response) => {
  try {
    let query: admin.firestore.Query = tasksCollection;

    // Filter by classification
    const classification = queryStr(req.query.classification);
    if (classification) {
      query = query.where("classification", "==", classification);
    }

    // Filter by status
    const status = queryStr(req.query.status);
    if (status) {
      query = query.where("status", "==", status);
    }

    // Filter by projectId
    const projectId = queryStr(req.query.projectId);
    if (projectId) {
      query = query.where("projectId", "==", projectId);
    }

    const snapshot = await query.get();
    const tasks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort pebbles by sortOrder, others by createdAt
    tasks.sort((a: any, b: any) => {
      if (a.classification === "pebble" && b.classification === "pebble") {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      }
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });

    res.json(tasks);
  } catch (error) {
    console.error("Error listing tasks:", error);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// Get a single task
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const doc = await tasksCollection.doc(paramStr(req.params.id)).get();
    if (!doc.exists) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Error getting task:", error);
    res.status(500).json({ error: "Failed to get task" });
  }
});

// Update a task
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const doc = await tasksCollection.doc(paramStr(req.params.id)).get();
    if (!doc.exists) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const allowedFields = [
      "title", "notes", "classification", "status",
      "deadline", "recurrence", "projectId", "sortOrder",
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "deadline" && req.body[field]) {
          updates[field] = admin.firestore.Timestamp.fromDate(new Date(req.body[field]));
        } else {
          updates[field] = req.body[field];
        }
      }
    }

    // When classifying as pebble, assign sort order if not already set
    if (updates.classification === "pebble" && !updates.sortOrder) {
      const currentData = doc.data();
      if (currentData?.classification !== "pebble") {
        updates.sortOrder = await getNewPebbleSortOrder();
      }
    }

    updates.updatedAt = admin.firestore.Timestamp.now();
    await tasksCollection.doc(paramStr(req.params.id)).update(updates);

    const updated = await tasksCollection.doc(paramStr(req.params.id)).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// Complete a task
router.post("/:id/complete", async (req: Request, res: Response) => {
  try {
    const doc = await tasksCollection.doc(paramStr(req.params.id)).get();
    if (!doc.exists) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const taskData = doc.data()!;
    await tasksCollection.doc(paramStr(req.params.id)).update({
      status: "completed",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // If recurring, create next occurrence
    let nextTask = null;
    if (taskData.recurrence) {
      const nextDeadline = calculateNextOccurrence(taskData.recurrence, taskData.deadline);
      const newSortOrder = await getNewPebbleSortOrder();
      const now = admin.firestore.Timestamp.now();
      const newTaskData = {
        title: taskData.title,
        notes: taskData.notes,
        classification: taskData.classification,
        status: "active",
        deadline: nextDeadline,
        recurrence: taskData.recurrence,
        projectId: taskData.projectId,
        sortOrder: taskData.classification === "pebble" ? newSortOrder : 0,
        createdAt: now,
        updatedAt: now,
      };
      const newDoc = await tasksCollection.add(newTaskData);
      nextTask = { id: newDoc.id, ...newTaskData };
    }

    res.json({
      completed: { id: doc.id, ...taskData, status: "completed" },
      nextOccurrence: nextTask,
    });
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// Batch reorder pebbles
router.post("/reorder", async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // Array of { id, sortOrder }
    if (!Array.isArray(order)) {
      res.status(400).json({ error: "order must be an array of { id, sortOrder }" });
      return;
    }

    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();
    for (const item of order) {
      batch.update(tasksCollection.doc(item.id), {
        sortOrder: item.sortOrder,
        updatedAt: now,
      });
    }
    await batch.commit();

    res.json({ updated: order.length });
  } catch (error) {
    console.error("Error reordering tasks:", error);
    res.status(500).json({ error: "Failed to reorder tasks" });
  }
});

// Delete a task (soft delete via icebox, but also support hard delete)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const doc = await tasksCollection.doc(paramStr(req.params.id)).get();
    if (!doc.exists) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    // Soft delete: set status to iceboxed
    await tasksCollection.doc(paramStr(req.params.id)).update({
      status: "iceboxed",
      updatedAt: admin.firestore.Timestamp.now(),
    });
    res.json({ id: doc.id, status: "iceboxed" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// Helper: calculate sort order for new pebble (position 4, or end if < 4 exist)
async function getNewPebbleSortOrder(): Promise<number> {
  const pebbles = await tasksCollection
    .where("classification", "==", "pebble")
    .where("status", "==", "active")
    .orderBy("sortOrder", "asc")
    .get();

  if (pebbles.empty) return 1000;

  const orders = pebbles.docs.map((d) => d.data().sortOrder as number);

  if (orders.length < 4) {
    // Fewer than 4 pebbles, add at end
    return orders[orders.length - 1] + 1000;
  }

  // Insert at position 4 (between index 2 and 3)
  const before = orders[2];
  const after = orders[3];
  return before + (after - before) / 2;
}

// Helper: calculate next occurrence for recurring tasks
const DAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function findNextDayOfWeek(from: Date, days: string[]): Date {
  const targetDays = days.map(d => DAY_INDEX[d]).filter(d => d !== undefined).sort((a, b) => a - b);
  if (targetDays.length === 0) {
    const next = new Date(from);
    next.setDate(next.getDate() + 7);
    return next;
  }
  const currentDay = from.getDay();
  const nextDay = targetDays.find(d => d > currentDay);
  const daysToAdd = nextDay !== undefined
    ? nextDay - currentDay
    : 7 - currentDay + targetDays[0];
  const next = new Date(from);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

function calculateNextOccurrence(
  recurrence: any,
  currentDeadline: admin.firestore.Timestamp | null
): admin.firestore.Timestamp | null {
  if (!recurrence || !recurrence.freq) return null;

  const now = new Date();

  switch (recurrence.freq) {
    case "daily": {
      const base = currentDeadline ? currentDeadline.toDate() : now;
      const next = new Date(base);
      next.setDate(next.getDate() + (recurrence.interval || 1));
      return admin.firestore.Timestamp.fromDate(next);
    }
    case "weekly": {
      const base = currentDeadline ? currentDeadline.toDate() : now;
      if (recurrence.days && recurrence.days.length > 0) {
        return admin.firestore.Timestamp.fromDate(findNextDayOfWeek(base, recurrence.days));
      }
      const next = new Date(base);
      next.setDate(next.getDate() + 7);
      return admin.firestore.Timestamp.fromDate(next);
    }
    case "monthly": {
      const base = currentDeadline ? currentDeadline.toDate() : now;
      const next = new Date(base);
      next.setMonth(next.getMonth() + (recurrence.interval || 1));
      return admin.firestore.Timestamp.fromDate(next);
    }
    case "yearly": {
      const base = currentDeadline ? currentDeadline.toDate() : now;
      const next = new Date(base);
      next.setFullYear(next.getFullYear() + (recurrence.interval || 1));
      return admin.firestore.Timestamp.fromDate(next);
    }
    case "periodically": {
      const next = new Date(now);
      next.setDate(next.getDate() + (recurrence.interval || 7));
      return admin.firestore.Timestamp.fromDate(next);
    }
    case "custom": {
      const base = currentDeadline ? currentDeadline.toDate() : now;
      const interval = recurrence.interval || 1;
      if (recurrence.customUnit === "monthly") {
        const next = new Date(base);
        next.setMonth(next.getMonth() + interval);
        return admin.firestore.Timestamp.fromDate(next);
      }
      if (recurrence.days && recurrence.days.length > 0) {
        const jumped = new Date(base);
        jumped.setDate(jumped.getDate() + 7 * (interval - 1));
        return admin.firestore.Timestamp.fromDate(findNextDayOfWeek(jumped, recurrence.days));
      }
      const next = new Date(base);
      next.setDate(next.getDate() + 7 * interval);
      return admin.firestore.Timestamp.fromDate(next);
    }
    default:
      return null;
  }
}

export { router as taskRoutes };
