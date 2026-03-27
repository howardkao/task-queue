import { Router } from "express";
import * as admin from "firebase-admin";
import net from "node:net";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ical = require("node-ical");

const router = Router();

interface CalendarFeed {
  url: string;
  name: string;
  color: string;
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  busy: boolean;
  calendarName: string;
  color: string;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isDisallowedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb");
}

function validateCalendarFeed(feed: unknown, index: number): string | null {
  if (!feed || typeof feed !== "object") {
    return `Feed ${index + 1} must be an object`;
  }

  const candidate = feed as Partial<CalendarFeed>;
  if (!candidate.url || typeof candidate.url !== "string") {
    return `Feed ${index + 1} must include a URL`;
  }
  if (!candidate.name || typeof candidate.name !== "string") {
    return `Feed ${index + 1} must include a name`;
  }
  if (!candidate.color || typeof candidate.color !== "string") {
    return `Feed ${index + 1} must include a color`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return `Feed ${index + 1} has an invalid URL`;
  }

  if (parsed.protocol !== "https:") {
    return `Feed ${index + 1} must use HTTPS`;
  }
  if (parsed.username || parsed.password) {
    return `Feed ${index + 1} must not include embedded credentials`;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return `Feed ${index + 1} must include a hostname`;
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return `Feed ${index + 1} targets a disallowed hostname`;
  }

  if (net.isIP(hostname) === 4 && isPrivateIpv4(hostname)) {
    return `Feed ${index + 1} targets a private or reserved IPv4 address`;
  }
  if (net.isIP(hostname) === 6 && isDisallowedIpv6(hostname)) {
    return `Feed ${index + 1} targets a private or reserved IPv6 address`;
  }

  return null;
}

/**
 * GET /calendar/today
 * Fetches all configured iCal feeds, merges events for today, returns them.
 */
router.get("/today", async (_req, res) => {
  try {
    // Get calendar feeds from settings
    const settingsDoc = await admin.firestore().collection("settings").doc("main").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    const feeds: CalendarFeed[] = settings?.calendarFeeds || [];

    if (feeds.length === 0) {
      res.json({ events: [], message: "No calendar feeds configured." });
      return;
    }

    // Determine today's bounds
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Fetch all feeds in parallel
    const allEvents: CalendarEvent[] = [];

    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const data = await ical.async.fromURL(feed.url);
          const events: CalendarEvent[] = [];

          for (const key in data) {
            const event = data[key];
            if (event.type !== "VEVENT") continue;

            const start = new Date(event.start);
            const end = new Date(event.end);

            // Check if event falls on today (including multi-day events that span today)
            if (end <= todayStart || start >= todayEnd) continue;

            // Clamp to today's bounds for display
            const displayStart = start < todayStart ? todayStart : start;
            const displayEnd = end > todayEnd ? todayEnd : end;

            // TRANSP property: TRANSPARENT means free, OPAQUE (default) means busy
            const transp = (event.transparency || "OPAQUE").toUpperCase();
            const busy = transp !== "TRANSPARENT";

            events.push({
              title: event.summary || "(No title)",
              start: displayStart.toISOString(),
              end: displayEnd.toISOString(),
              busy,
              calendarName: feed.name,
              color: feed.color,
            });
          }

          return events;
        } catch (err) {
          console.error(`Failed to fetch feed "${feed.name}":`, err);
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allEvents.push(...result.value);
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    res.json({ events: allEvents });
  } catch (err) {
    console.error("Calendar fetch error:", err);
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

/**
 * GET /calendar/feeds
 * Returns the configured calendar feeds (without full URLs for security — just names and colors).
 */
router.get("/feeds", async (_req, res) => {
  try {
    const settingsDoc = await admin.firestore().collection("settings").doc("main").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    const feeds: CalendarFeed[] = settings?.calendarFeeds || [];
    res.json({
      feeds: feeds.map((f) => ({ name: f.name, color: f.color, hasUrl: !!f.url })),
    });
  } catch (err) {
    console.error("Error fetching feeds:", err);
    res.status(500).json({ error: "Failed to fetch feeds" });
  }
});

/**
 * PUT /calendar/feeds
 * Update the list of iCal feed URLs.
 * Body: { feeds: [{ url, name, color }] }
 */
router.put("/feeds", async (req, res) => {
  try {
    const { feeds } = req.body;
    if (!Array.isArray(feeds)) {
      res.status(400).json({ error: "feeds must be an array" });
      return;
    }

    for (const [index, feed] of feeds.entries()) {
      const validationError = validateCalendarFeed(feed, index);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
    }

    await admin.firestore().collection("settings").doc("main").set(
      { calendarFeeds: feeds },
      { merge: true }
    );

    res.json({ ok: true, count: feeds.length });
  } catch (err) {
    console.error("Error updating feeds:", err);
    res.status(500).json({ error: "Failed to update feeds" });
  }
});

export const calendarRoutes = router;
