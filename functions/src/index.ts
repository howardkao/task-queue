import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { taskRoutes } from "./routes/tasks";
import { calendarRoutes } from "./routes/calendar";

admin.initializeApp();

const app = express();

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredOrigins,
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json());

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.locals.user = {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}

async function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const uid = res.locals.user?.uid;
  if (!uid) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const adminDoc = await admin.firestore().collection("admins").doc(uid).get();
    if (!adminDoc.exists) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch (error) {
    console.error("Admin check failed:", error);
    res.status(500).json({ error: "Failed to verify admin access" });
  }
}

// Mount routes
app.use("/tasks", requireAuth, taskRoutes);
app.use("/calendar", requireAuth, requireAdmin, calendarRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export const api = functions.https.onRequest(app);
