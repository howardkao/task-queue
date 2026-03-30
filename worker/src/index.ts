/**
 * Cloudflare Worker: iCal calendar proxy for Task Queue.
 * Fetches iCal feeds, parses events for today, returns JSON.
 *
 * Calendar feed configs are stored in Cloudflare KV (CALENDAR_KV).
 * Falls back to CALENDAR_FEEDS env secret for backward compatibility.
 *
 * CRUD endpoints for managing feeds (admin-only for writes).
 * iCal responses are cached in KV with a 15-minute TTL.
 */

import { parseICal } from './ical-parser';

// ── Types ────────────────────────────────────────────────────────────────────

interface Env {
  CALENDAR_KV: KVNamespace;
  CALENDAR_FEEDS?: string; // Legacy: JSON string of CalendarFeed[]
  ALLOWED_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  ADMIN_UID?: string;
}

interface StoredCalendarFeed {
  id: string;
  name: string;
  color: string;
  url: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the frontend sees — never includes the URL */
interface CalendarFeedMeta {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  busy: boolean;
  calendarName: string;
  color: string;
}

interface FirebaseTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface FirebaseTokenPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  user_id?: string;
  email?: string;
}

interface JsonWebKeySet {
  keys: Array<JsonWebKey & { kid?: string }>;
}

interface CachedSigningKeys {
  expiresAt: number;
  keys: Map<string, CryptoKey>;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedSigningKeys: CachedSigningKeys | null = null;

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 3600;
}

function base64UrlToUint8Array(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(input))) as T;
}

async function importSigningKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function getSigningKeys(): Promise<Map<string, CryptoKey>> {
  if (cachedSigningKeys && Date.now() < cachedSigningKeys.expiresAt) {
    return cachedSigningKeys.keys;
  }

  const response = await fetch(FIREBASE_JWKS_URL, {
    headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase signing keys (${response.status})`);
  }

  const jwks = await response.json<JsonWebKeySet>();
  const keys = new Map<string, CryptoKey>();

  for (const jwk of jwks.keys) {
    if (typeof jwk.kid !== 'string') continue;
    keys.set(jwk.kid, await importSigningKey(jwk));
  }

  cachedSigningKeys = {
    expiresAt: Date.now() + parseMaxAgeSeconds(response.headers.get('cache-control')) * 1000,
    keys,
  };

  return keys;
}

async function authenticateRequest(request: Request, env: Env): Promise<FirebaseTokenPayload> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Malformed token');
  }

  const header = decodeBase64UrlJson<FirebaseTokenHeader>(encodedHeader);
  const payload = decodeBase64UrlJson<FirebaseTokenPayload>(encodedPayload);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token header');
  }

  const signingKeys = await getSigningKeys();
  const signingKey = signingKeys.get(header.kid);
  if (!signingKey) {
    cachedSigningKeys = null;
    throw new Error('Unknown signing key');
  }

  const signedContent = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToUint8Array(encodedSignature);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    signature,
    signedContent,
  );

  if (!verified) throw new Error('Invalid token signature');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;

  if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error('Invalid token audience');
  if (payload.iss !== expectedIssuer) throw new Error('Invalid token issuer');
  if (!payload.sub || payload.sub.length === 0) throw new Error('Invalid token subject');
  if (!payload.exp || payload.exp <= nowSeconds) throw new Error('Expired token');
  if (!payload.iat || payload.iat > nowSeconds + 60) throw new Error('Invalid token issue time');

  return payload;
}

function isAdmin(payload: FirebaseTokenPayload, env: Env): boolean {
  if (!env.ADMIN_UID) return false;
  return payload.sub === env.ADMIN_UID;
}

// ── Response helpers ─────────────────────────────────────────────────────────

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// ── Feed storage (KV with env fallback) ──────────────────────────────────────

async function getFeeds(env: Env): Promise<StoredCalendarFeed[]> {
  // Try KV first
  const kvFeeds = await env.CALENDAR_KV.get<StoredCalendarFeed[]>('feeds', 'json');
  if (kvFeeds && kvFeeds.length > 0) return kvFeeds;

  // Fall back to legacy env secret and auto-migrate to KV
  if (!env.CALENDAR_FEEDS) return [];
  try {
    const legacy: Array<{ url: string; name: string; color: string }> = JSON.parse(env.CALENDAR_FEEDS);
    const now = new Date().toISOString();
    const migrated: StoredCalendarFeed[] = legacy.map(f => ({
      id: crypto.randomUUID(),
      name: f.name,
      color: f.color,
      url: f.url,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }));

    // Persist to KV so future reads skip the env fallback
    await saveFeeds(env, migrated);
    console.log(`Migrated ${migrated.length} feeds from CALENDAR_FEEDS env to KV`);

    return migrated;
  } catch {
    return [];
  }
}

async function saveFeeds(env: Env, feeds: StoredCalendarFeed[]): Promise<void> {
  await env.CALENDAR_KV.put('feeds', JSON.stringify(feeds));
}

function stripUrl(feed: StoredCalendarFeed): CalendarFeedMeta {
  return { id: feed.id, name: feed.name, color: feed.color, enabled: feed.enabled };
}

// ── URL validation ───────────────────────────────────────────────────────────

function validateFeedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  if (parsed.protocol !== 'https:') {
    return 'URL must use HTTPS';
  }

  // Block private/internal IPs
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return 'URL must not point to a private/internal address';
  }

  // Block URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return 'URL must not contain embedded credentials';
  }

  return null; // valid
}

// ── iCal cache ───────────────────────────────────────────────────────────────

const ICAL_CACHE_TTL = 900; // 15 minutes

async function getCachedIcal(env: Env, feedId: string): Promise<string | null> {
  return env.CALENDAR_KV.get(`ical-cache:${feedId}`);
}

async function setCachedIcal(env: Env, feedId: string, text: string): Promise<void> {
  await env.CALENDAR_KV.put(`ical-cache:${feedId}`, text, { expirationTtl: ICAL_CACHE_TTL });
}

async function deleteCachedIcal(env: Env, feedId: string): Promise<void> {
  await env.CALENDAR_KV.delete(`ical-cache:${feedId}`);
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

function getTimezoneDate(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(utcDate);
  const p: any = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }

  const localAsUtc = new Date(
    `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}T${p.hour.padStart(2, '0')}:${p.minute.padStart(2, '0')}:${p.second.padStart(2, '0')}Z`,
  );
  const offset = localAsUtc.getTime() - utcDate.getTime();
  return new Date(utcDate.getTime() - offset);
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleGetFeeds(env: Env): Promise<Response> {
  const feeds = await getFeeds(env);
  return jsonResponse({ feeds: feeds.map(stripUrl) }, env);
}

async function handleCreateFeed(request: Request, env: Env, payload: FirebaseTokenPayload): Promise<Response> {
  if (!isAdmin(payload, env)) {
    return jsonResponse({ error: 'Admin access required' }, env, 403);
  }

  let body: { name?: string; url?: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, env, 400);
  }

  const { name, url, color } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return jsonResponse({ error: 'Name is required' }, env, 400);
  }
  if (!url || typeof url !== 'string') {
    return jsonResponse({ error: 'URL is required' }, env, 400);
  }
  if (!color || typeof color !== 'string') {
    return jsonResponse({ error: 'Color is required' }, env, 400);
  }

  const urlError = validateFeedUrl(url);
  if (urlError) {
    return jsonResponse({ error: urlError }, env, 400);
  }

  const feeds = await getFeeds(env);
  const now = new Date().toISOString();
  const newFeed: StoredCalendarFeed = {
    id: crypto.randomUUID(),
    name: name.trim(),
    color,
    url,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  feeds.push(newFeed);
  await saveFeeds(env, feeds);

  return jsonResponse({ feed: stripUrl(newFeed) }, env, 201);
}

async function handleUpdateFeed(
  request: Request,
  env: Env,
  payload: FirebaseTokenPayload,
  feedId: string,
): Promise<Response> {
  if (!isAdmin(payload, env)) {
    return jsonResponse({ error: 'Admin access required' }, env, 403);
  }

  let body: { name?: string; url?: string; color?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, env, 400);
  }

  const feeds = await getFeeds(env);
  const index = feeds.findIndex(f => f.id === feedId);
  if (index === -1) {
    return jsonResponse({ error: 'Feed not found' }, env, 404);
  }

  const feed = feeds[index];
  let urlChanged = false;

  if (body.name !== undefined) feed.name = String(body.name).trim();
  if (body.color !== undefined) feed.color = String(body.color);
  if (body.enabled !== undefined) feed.enabled = Boolean(body.enabled);
  if (body.url !== undefined && body.url.length > 0) {
    const urlError = validateFeedUrl(body.url);
    if (urlError) {
      return jsonResponse({ error: urlError }, env, 400);
    }
    feed.url = body.url;
    urlChanged = true;
  }

  feed.updatedAt = new Date().toISOString();
  feeds[index] = feed;
  await saveFeeds(env, feeds);

  // Invalidate iCal cache if URL changed
  if (urlChanged) {
    await deleteCachedIcal(env, feedId);
  }

  return jsonResponse({ feed: stripUrl(feed) }, env);
}

async function handleDeleteFeed(
  env: Env,
  payload: FirebaseTokenPayload,
  feedId: string,
): Promise<Response> {
  if (!isAdmin(payload, env)) {
    return jsonResponse({ error: 'Admin access required' }, env, 403);
  }

  const feeds = await getFeeds(env);
  const filtered = feeds.filter(f => f.id !== feedId);
  if (filtered.length === feeds.length) {
    return jsonResponse({ error: 'Feed not found' }, env, 404);
  }

  await saveFeeds(env, filtered);
  await deleteCachedIcal(env, feedId);

  return jsonResponse({ success: true }, env);
}

async function handleTodayEvents(request: Request, env: Env): Promise<Response> {
  const feeds = await getFeeds(env);
  const enabledFeeds = feeds.filter(f => f.enabled);

  if (enabledFeeds.length === 0) {
    return jsonResponse({ events: [], message: 'No calendar feeds configured.' }, env);
  }

  const url = new URL(request.url);
  const tz = url.searchParams.get('tz') || 'America/Los_Angeles';
  const now = new Date();
  const todayStr = url.searchParams.get('date') || now.toLocaleDateString('en-CA', { timeZone: tz });

  const todayStart = getTimezoneDate(todayStr, '00:00:00', tz);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const allEvents: CalendarEvent[] = [];

  const results = await Promise.allSettled(
    enabledFeeds.map(async (feed) => {
      try {
        // Try KV cache first
        let icalText = await getCachedIcal(env, feed.id);

        if (!icalText) {
          // Cache miss — fetch live
          const res = await fetch(feed.url, {
            headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' },
          });
          if (!res.ok) {
            console.error(`Feed "${feed.name}" returned ${res.status}`);
            return [];
          }
          icalText = await res.text();

          // Store in cache (fire-and-forget for speed, but await to ensure it completes)
          await setCachedIcal(env, feed.id, icalText);
        }

        const events = parseICal(icalText, todayStart, todayEnd);

        return events.map(event => {
          const displayStart = event.start < todayStart ? todayStart : event.start;
          const displayEnd = event.end > todayEnd ? todayEnd : event.end;

          return {
            title: event.summary || '(No title)',
            start: displayStart.toISOString(),
            end: displayEnd.toISOString(),
            busy: event.transparency !== 'TRANSPARENT',
            calendarName: feed.name,
            color: feed.color,
          };
        });
      } catch (err) {
        console.error(`Failed to fetch/parse feed "${feed.name}":`, err);
        return [];
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value);
    }
  }

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return jsonResponse({ events: allEvents }, env);
}

// ── Router ───────────────────────────────────────────────────────────────────

function parseRoute(pathname: string): { base: string; id?: string } {
  const parts = pathname.split('/').filter(Boolean);
  // /calendar/feeds/:id → base = "/calendar/feeds", id = parts[2]
  // /calendar/feeds     → base = "/calendar/feeds", id = undefined
  // /calendar/today     → base = "/calendar/today", id = undefined
  if (parts.length >= 3 && parts[0] === 'calendar' && parts[1] === 'feeds') {
    return { base: '/calendar/feeds', id: parts[2] };
  }
  return { base: pathname, id: undefined };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(env) });
      }

      const route = parseRoute(url.pathname);

      // All /calendar/* routes require auth
      if (url.pathname.startsWith('/calendar/')) {
        let payload: FirebaseTokenPayload;
        try {
          payload = await authenticateRequest(request, env);
        } catch (error) {
          console.error('Calendar auth failed:', error);
          return jsonResponse({ error: 'Unauthorized', message: (error as Error).message }, env, 401);
        }

        // GET /calendar/today
        if (route.base === '/calendar/today' && request.method === 'GET') {
          return await handleTodayEvents(request, env);
        }

        // GET /calendar/feeds
        if (route.base === '/calendar/feeds' && request.method === 'GET' && !route.id) {
          return await handleGetFeeds(env);
        }

        // POST /calendar/feeds
        if (route.base === '/calendar/feeds' && request.method === 'POST' && !route.id) {
          return await handleCreateFeed(request, env, payload);
        }

        // PUT /calendar/feeds/:id
        if (route.base === '/calendar/feeds' && request.method === 'PUT' && route.id) {
          return await handleUpdateFeed(request, env, payload, route.id);
        }

        // DELETE /calendar/feeds/:id
        if (route.base === '/calendar/feeds' && request.method === 'DELETE' && route.id) {
          return await handleDeleteFeed(env, payload, route.id);
        }
      }

      // Health check
      if (url.pathname === '/' || url.pathname === '/health') {
        return jsonResponse({ status: 'ok', service: 'task-queue-calendar' }, env);
      }

      return jsonResponse({ error: 'Not found' }, env, 404);
    } catch (err: any) {
      console.error('Worker global error:', err);
      return jsonResponse({
        error: 'Internal Server Error',
        message: err.message,
        stack: err.stack,
      }, env, 500);
    }
  },
};
