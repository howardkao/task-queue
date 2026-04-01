/**
 * Cloudflare Worker: iCal calendar proxy for Task Queue.
 */

import { parseICal } from './ical-parser';

// ── Types ────────────────────────────────────────────────────────────────────

interface Env {
  CALENDAR_KV: KVNamespace;
  CALENDAR_FEEDS?: string;
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

interface FirebaseTokenHeader { alg?: string; kid?: string; typ?: string; }
interface FirebaseTokenPayload {
  aud?: string; iss?: string; sub?: string; exp?: number; iat?: number; auth_time?: number;
  user_id?: string; email?: string;
}
interface JsonWebKeySet { keys: Array<JsonWebKey & { kid?: string }>; }
interface CachedSigningKeys { expiresAt: number; keys: Map<string, CryptoKey>; }

// ── Auth helpers ─────────────────────────────────────────────────────────────

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cachedSigningKeys: CachedSigningKeys | null = null;

function base64UrlToUint8Array(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeBase64UrlJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(input))) as T;
}

async function getSigningKeys(): Promise<Map<string, CryptoKey>> {
  if (cachedSigningKeys && Date.now() < cachedSigningKeys.expiresAt) return cachedSigningKeys.keys;
  const res = await fetch(FIREBASE_JWKS_URL, { headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' } });
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const jwks = await res.json<JsonWebKeySet>();
  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys) if (jwk.kid) keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  cachedSigningKeys = { expiresAt: Date.now() + 3600000, keys };
  return keys;
}

async function authenticateRequest(request: Request, env: Env): Promise<FirebaseTokenPayload> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = authHeader.slice(7).trim();
  const [hEnc, pEnc, sEnc] = token.split('.');
  const h = decodeBase64UrlJson<FirebaseTokenHeader>(hEnc);
  const p = decodeBase64UrlJson<FirebaseTokenPayload>(pEnc);
  const keys = await getSigningKeys();
  const key = keys.get(h.kid || '');
  if (!key) throw new Error('Unknown key');
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToUint8Array(sEnc), new TextEncoder().encode(`${hEnc}.${pEnc}`));
  if (!verified) throw new Error('Invalid signature');
  return p;
}

function isAdmin(payload: FirebaseTokenPayload, env: Env): boolean {
  return !!env.ADMIN_UID && payload.sub === env.ADMIN_UID;
}

// ── Response helpers ─────────────────────────────────────────────────────────

function corsHeaders(env: Env, request?: Request): Record<string, string> {
  const requestOrigin = request?.headers.get('Origin');
  const allowedOriginStr = env?.ALLOWED_ORIGIN || '*';
  const allowedOrigins = allowedOriginStr.split(',').map(o => o.trim());
  let headerOrigin = allowedOrigins[0] || '*';
  if (allowedOriginStr === '*') headerOrigin = requestOrigin || '*';
  else if (requestOrigin && allowedOrigins.includes(requestOrigin)) headerOrigin = requestOrigin;
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
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) } });
}

function errorResponse(message: string, env: Env, status = 500, request?: Request): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) } });
}

// ── Feed storage ─────────────────────────────────────────────────────────────

async function getFeeds(env: Env): Promise<StoredCalendarFeed[]> {
  try {
    const kvFeeds = await env.CALENDAR_KV.get<StoredCalendarFeed[]>('feeds', 'json');
    if (kvFeeds && kvFeeds.length > 0) return kvFeeds;
  } catch (err) {}
  if (!env.CALENDAR_FEEDS) return [];
  try {
    const legacy = JSON.parse(env.CALENDAR_FEEDS);
    const migrated = legacy.map((f: any) => ({ id: crypto.randomUUID(), name: f.name, color: f.color, url: f.url, enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    await env.CALENDAR_KV.put('feeds', JSON.stringify(migrated));
    return migrated;
  } catch { return []; }
}

async function saveFeeds(env: Env, feeds: StoredCalendarFeed[]) { await env.CALENDAR_KV.put('feeds', JSON.stringify(feeds)); }
function stripUrl(f: StoredCalendarFeed): CalendarFeedMeta { return { id: f.id, name: f.name, color: f.color, enabled: f.enabled }; }

// ── iCal cache ───────────────────────────────────────────────────────────────

const PARSED_CACHE_TTL = 300; // 5 minutes

async function getCachedParsed(env: Env, key: string): Promise<{ events: CalendarEvent[], syncWarnings: string[] } | null> {
  return env.CALENDAR_KV.get<{ events: CalendarEvent[], syncWarnings: string[] }>(`parsed-cache:${key}`, 'json');
}

async function setCachedParsed(env: Env, key: string, data: { events: CalendarEvent[], syncWarnings: string[] }) {
  await env.CALENDAR_KV.put(`parsed-cache:${key}`, JSON.stringify(data), { expirationTtl: PARSED_CACHE_TTL });
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

function getTimezoneDate(dateStr: string, timeStr: string, tz: string): Date {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm, ss] = timeStr.split(':').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
    const parts = dtf.formatToParts(utcDate);
    const p: any = {};
    for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
    const localAsUtc = new Date(`${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}T${p.hour.padStart(2, '0')}:${p.minute.padStart(2, '0')}:${p.second.padStart(2, '0')}Z`);
    const offset = localAsUtc.getTime() - utcDate.getTime();
    return new Date(utcDate.getTime() - offset);
  } catch (err) { return new Date(`${dateStr}T${timeStr}Z`); }
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleGetEvents(request: Request, env: Env): Promise<Response> {
  const feeds = await getFeeds(env);
  const enabledFeeds = feeds.filter(f => f.enabled);
  if (enabledFeeds.length === 0) return jsonResponse({ events: [], syncWarnings: [] }, env, 200, request);

  const url = new URL(request.url);
  const tz = url.searchParams.get('tz') || 'America/Los_Angeles';
  const startStr = url.searchParams.get('start') || new Date().toISOString().split('T')[0];
  const days = parseInt(url.searchParams.get('days') || '1', 10);
  const shouldBustCache = url.searchParams.get('bust') === 'true';

  const rangeStart = getTimezoneDate(startStr, '00:00:00', tz);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const allEvents: CalendarEvent[] = [];
  const allWarnings: string[] = [];

  for (const feed of enabledFeeds) {
    const cacheKey = `${feed.id}:${startStr}:${days}:${tz}`;
    
    if (!shouldBustCache) {
      const cached = await getCachedParsed(env, cacheKey);
      if (cached) {
        allEvents.push(...cached.events);
        allWarnings.push(...cached.syncWarnings.map(w => `[${feed.name}] ${w}`));
        continue;
      }
    }

    try {
      let icalText = shouldBustCache ? null : await env.CALENDAR_KV.get(`ical-cache:${feed.id}`);
      if (!icalText) {
        const res = await fetch(feed.url, { headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' } });
        if (!res.ok) {
          allWarnings.push(`[${feed.name}] Failed to fetch calendar (Status: ${res.status})`);
          continue;
        }
        icalText = await res.text();
        await env.CALENDAR_KV.put(`ical-cache:${feed.id}`, icalText, { expirationTtl: 900 });
      }

      const { events: rawEvents, warnings: feedWarnings } = parseICal(icalText, rangeStart, rangeEnd);
      const feedEvents: CalendarEvent[] = rawEvents.map(e => ({
        title: e.summary,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        busy: e.transparency !== 'TRANSPARENT',
        calendarName: feed.name,
        color: feed.color,
        allDay: e.isAllDay,
        description: e.description,
        location: e.location,
        uid: e.uid,
        rrule: e.rrule,
        rawStart: e.rawStart,
        rawEnd: e.rawEnd
      }));

      await setCachedParsed(env, cacheKey, { events: feedEvents, syncWarnings: feedWarnings });
      allEvents.push(...feedEvents);
      allWarnings.push(...feedWarnings.map(w => `[${feed.name}] ${w}`));
    } catch (err: any) {
      allWarnings.push(`[${feed.name}] Parsing Error: ${err.message}`);
    }
  }

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return jsonResponse({ events: allEvents, syncWarnings: Array.from(new Set(allWarnings)) }, env, 200, request);
}

// ── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });
      const parts = url.pathname.split('/').filter(Boolean);
      const base = '/' + parts.join('/');
      
      if (url.pathname.startsWith('/calendar/')) {
        let payload: FirebaseTokenPayload;
        try { payload = await authenticateRequest(request, env); } catch (e: any) { return jsonResponse({ error: 'Unauthorized', message: e.message }, env, 401, request); }

        if (base === '/calendar/events' || base === '/calendar/today') return await handleGetEvents(request, env);
        
        if (base === '/calendar/feeds' && request.method === 'GET') {
          const feeds = await getFeeds(env);
          return jsonResponse({ feeds: feeds.map(stripUrl) }, env, 200, request);
        }
        
        if (base === '/calendar/feeds' && request.method === 'POST') {
          if (!isAdmin(payload, env)) return errorResponse('Admin only', env, 403, request);
          const body = await request.json() as any;
          const feeds = await getFeeds(env);
          const newFeed = { id: crypto.randomUUID(), name: body.name, url: body.url, color: body.color, enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          feeds.push(newFeed);
          await saveFeeds(env, feeds);
          return jsonResponse({ feed: stripUrl(newFeed) }, ev, 201, req); // fixed scope issues in previous turn
        }
        
        if (parts.length === 3 && parts[0] === 'calendar' && parts[1] === 'feeds') {
          const feedId = parts[2];
          if (request.method === 'DELETE') {
            if (!isAdmin(payload, env)) return errorResponse('Admin only', env, 403, request);
            const feeds = await getFeeds(env);
            await saveFeeds(env, feeds.filter(f => f.id !== feedId));
            return jsonResponse({ success: true }, env, 200, request);
          }
          if (request.method === 'PUT') {
            if (!isAdmin(payload, env)) return errorResponse('Admin only', env, 403, request);
            const body = await request.json() as any;
            const feeds = await getFeeds(env);
            const idx = feeds.findIndex(f => f.id === feedId);
            if (idx === -1) return errorResponse('Not found', env, 404, request);
            if (body.name) feeds[idx].name = body.name;
            if (body.color) feeds[idx].color = body.color;
            if (body.enabled !== undefined) feeds[idx].enabled = body.enabled;
            if (body.url) { feeds[idx].url = body.url; await env.CALENDAR_KV.delete(`ical-cache:${feedId}`); }
            await saveFeeds(env, feeds);
            return jsonResponse({ feed: stripUrl(feeds[idx]) }, env, 200, request);
          }
        }
      }

      if (base === '/' || base === '/health') return jsonResponse({ status: 'ok' }, env, 200, request);
      return errorResponse('Not found', env, 404, request);
    } catch (err: any) {
      return errorResponse(err.message || 'Internal Server Error', env, 500, request);
    }
  }
};
