/**
 * Cloudflare Worker: iCal calendar proxy for Task Queue.
 * Fetches iCal feeds, parses events for a date range, returns JSON.
 *
 * Calendar feed configs are stored in Cloudflare KV (CALENDAR_KV).
 * Falls back to CALENDAR_FEEDS env secret for backward compatibility.
 *
 * CRUD endpoints for managing feeds (admin-only for writes).
 * iCal responses are cached in KV with a 15-minute TTL (raw) or 5-minute (parsed).
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
  allDay?: boolean;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
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

function corsHeaders(env: Env, request?: Request): Record<string, string> {
  const requestOrigin = request?.headers.get('Origin');
  
  // Use a fallback if env.ALLOWED_ORIGIN is missing during deployment propagation
  const allowedOriginStr = env?.ALLOWED_ORIGIN || '*';
  const allowedOrigins = allowedOriginStr.split(',').map(o => o.trim());

  let headerOrigin = allowedOrigins[0] || '*';

  if (allowedOriginStr === '*') {
    headerOrigin = requestOrigin || '*';
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headerOrigin = requestOrigin;
  }

  return {
    'Access-Control-Allow-Origin': headerOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data: unknown, env: Env, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json', 
      ...corsHeaders(env, request) 
    },
  });
}

function errorResponse(message: string, env: Env, status = 500, request?: Request): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, request),
    },
  });
}

// ── Feed storage (KV with env fallback) ──────────────────────────────────────

async function getFeeds(env: Env): Promise<StoredCalendarFeed[]> {
  try {
    const kvFeeds = await env.CALENDAR_KV.get<StoredCalendarFeed[]>('feeds', 'json');
    if (kvFeeds && kvFeeds.length > 0) return kvFeeds;
  } catch (err) {
    console.error('KV Read Error:', err);
  }

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
    await saveFeeds(env, migrated);
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
  if (parsed.protocol !== 'https:') return 'URL must use HTTPS';
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
  if (parsed.username || parsed.password) return 'URL must not contain embedded credentials';
  return null;
}

// ── iCal cache ───────────────────────────────────────────────────────────────

const ICAL_CACHE_TTL = 900; // 15 minutes (raw iCal)
const PARSED_CACHE_TTL = 300; // 5 minutes (parsed JSON)

async function getCachedIcal(env: Env, feedId: string): Promise<string | null> {
  return env.CALENDAR_KV.get(`ical-cache:${feedId}`);
}

async function setCachedIcal(env: Env, feedId: string, text: string): Promise<void> {
  await env.CALENDAR_KV.put(`ical-cache:${feedId}`, text, { expirationTtl: ICAL_CACHE_TTL });
}

async function getCachedParsedEvents(env: Env, cacheKey: string): Promise<CalendarEvent[] | null> {
  return env.CALENDAR_KV.get<CalendarEvent[]>(`parsed-cache:${cacheKey}`, 'json');
}

async function setCachedParsedEvents(env: Env, cacheKey: string, events: CalendarEvent[]): Promise<void> {
  await env.CALENDAR_KV.put(`parsed-cache:${cacheKey}`, JSON.stringify(events), { expirationTtl: PARSED_CACHE_TTL });
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

function getTimezoneDate(dateStr: string, timeStr: string, tz: string): Date {
  try {
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
    for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
    const localAsUtc = new Date(
      `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}T${p.hour.padStart(2, '0')}:${p.minute.padStart(2, '0')}:${p.second.padStart(2, '0')}Z`,
    );
    const offset = localAsUtc.getTime() - utcDate.getTime();
    return new Date(utcDate.getTime() - offset);
  } catch (err) {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleGetFeeds(request: Request, env: Env): Promise<Response> {
  const feeds = await getFeeds(env);
  return jsonResponse({ feeds: feeds.map(stripUrl) }, env, 200, request);
}

async function handleGetEvents(request: Request, env: Env): Promise<Response> {
  const feeds = await getFeeds(env);
  const enabledFeeds = feeds.filter(f => f.enabled);
  if (enabledFeeds.length === 0) return jsonResponse({ events: [] }, env, 200, request);

  const url = new URL(request.url);
  const tz = url.searchParams.get('tz') || 'America/Los_Angeles';
  const startDateStr = url.searchParams.get('start') || new Date().toISOString().split('T')[0];
  const days = parseInt(url.searchParams.get('days') || '1', 10);

  const rangeStart = getTimezoneDate(startDateStr, '00:00:00', tz);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const allEvents: CalendarEvent[] = [];

  for (const feed of enabledFeeds) {
    const cacheKey = `${feed.id}:${startDateStr}:${days}:${tz}`;
    const cached = await getCachedParsedEvents(env, cacheKey);
    if (cached) {
      allEvents.push(...cached);
      continue;
    }

    try {
      let icalText = await getCachedIcal(env, feed.id);
      if (!icalText) {
        const res = await fetch(feed.url, { headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' } });
        if (!res.ok) continue;
        icalText = await res.text();
        await setCachedIcal(env, feed.id, icalText);
      }

      const rawEvents = parseICal(icalText, rangeStart, rangeEnd);
      const feedEvents: CalendarEvent[] = rawEvents.map(event => {
        if (event.isAllDay) {
          // Find which day this all-day occurrence belongs to in the requested range.
          // We anchor it to the full 24h of the day it starts on within the range.
          const dayStart = new Date(event.start.getTime());
          dayStart.setUTCHours(0, 0, 0, 0); // Normalized to UTC midnight for the ISO string

          return {
            title: event.summary || '(No title)',
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            busy: event.transparency !== 'TRANSPARENT',
            calendarName: feed.name,
            color: feed.color,
            allDay: true,
            description: event.description,
            location: event.location,
            uid: event.uid,
            rrule: event.rrule,
            rawStart: event.rawStart,
            rawEnd: event.rawEnd,
          };
        }

        const displayStart = event.start < rangeStart ? rangeStart : event.start;
        const displayEnd = event.end > rangeEnd ? rangeEnd : event.end;

        return {
          title: event.summary || '(No title)',
          start: displayStart.toISOString(),
          end: displayEnd.toISOString(),
          busy: event.transparency !== 'TRANSPARENT',
          calendarName: feed.name,
          color: feed.color,
          description: event.description,
          location: event.location,
          uid: event.uid,
          rrule: event.rrule,
          rawStart: event.rawStart,
          rawEnd: event.rawEnd,
        };
      });

      await setCachedParsedEvents(env, cacheKey, feedEvents);
      allEvents.push(...feedEvents);
    } catch (err) {
      console.error(`Feed Error [${feed.name}]:`, err);
    }
  }

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return jsonResponse({ events: allEvents }, env, 200, request);
}

// ── Router ───────────────────────────────────────────────────────────────────

function parseRoute(pathname: string): { base: string; id?: string } {
  const parts = pathname.split('/').filter(Boolean);
  const normalized = '/' + parts.join('/');
  if (parts.length >= 3 && parts[0] === 'calendar' && parts[1] === 'feeds') {
    return { base: '/calendar/feeds', id: parts[2] };
  }
  return { base: normalized, id: undefined };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });

      const route = parseRoute(url.pathname);

      if (url.pathname.startsWith('/calendar/')) {
        let payload: FirebaseTokenPayload;
        try {
          payload = await authenticateRequest(request, env);
        } catch (error) {
          return jsonResponse({ error: 'Unauthorized', message: (error as Error).message }, env, 401, request);
        }

        if (route.base === '/calendar/events' && request.method === 'GET') return await handleGetEvents(request, env);
        if (route.base === '/calendar/today' && request.method === 'GET') return await handleGetEvents(request, env); // Legacy support
        if (route.base === '/calendar/feeds' && request.method === 'GET' && !route.id) return await handleGetFeeds(request, env);
        if (route.base === '/calendar/feeds' && request.method === 'POST' && !route.id) return await (async (req, ev, p) => {
          if (!isAdmin(p, ev)) return jsonResponse({ error: 'Admin access required' }, ev, 403, req);
          let body = await req.json() as any;
          if (!body.name || !body.url || !body.color) return jsonResponse({ error: 'Missing fields' }, ev, 400, req);
          const feeds = await getFeeds(ev);
          const newFeed = { id: crypto.randomUUID(), name: body.name.trim(), color: body.color, url: body.url, enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          feeds.push(newFeed);
          await saveFeeds(ev, feeds);
          return jsonResponse({ feed: stripUrl(newFeed) }, ev, 201, req);
        })(request, env, payload);

        if (route.base === '/calendar/feeds' && request.method === 'PUT' && route.id) return await (async (req, ev, p, fid) => {
          if (!isAdmin(p, ev)) return jsonResponse({ error: 'Admin access required' }, ev, 403, req);
          let body = await req.json() as any;
          const feeds = await getFeeds(ev);
          const index = feeds.findIndex(f => f.id === fid);
          if (index === -1) return jsonResponse({ error: 'Not found' }, ev, 404, req);
          const feed = feeds[index];
          if (body.name) feed.name = body.name.trim();
          if (body.color) feed.color = body.color;
          if (body.enabled !== undefined) feed.enabled = body.enabled;
          if (body.url) { feed.url = body.url; await deleteCachedIcal(ev, fid); }
          feed.updatedAt = new Date().toISOString();
          await saveFeeds(ev, feeds);
          return jsonResponse({ feed: stripUrl(feed) }, ev, 200, req);
        })(request, env, payload, route.id);

        if (route.base === '/calendar/feeds' && request.method === 'DELETE' && route.id) return await (async (req, ev, p, fid) => {
          if (!isAdmin(p, ev)) return jsonResponse({ error: 'Admin access required' }, ev, 403, req);
          const feeds = await getFeeds(ev);
          const filtered = feeds.filter(f => f.id !== fid);
          await saveFeeds(ev, filtered);
          await deleteCachedIcal(ev, fid);
          return jsonResponse({ success: true }, ev, 200, req);
        })(request, env, payload, route.id);
      }

      if (url.pathname === '/' || url.pathname === '/health') return jsonResponse({ status: 'ok', service: 'task-queue-calendar' }, env, 200, request);
      return jsonResponse({ error: 'Not found' }, env, 404, request);
    } catch (err: any) {
      console.error('Global Error:', err);
      return errorResponse(err.message || 'Internal Server Error', env, 500, request);
    }
  },
};