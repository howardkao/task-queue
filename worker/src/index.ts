/**
 * Cloudflare Worker: thin iCal proxy for Task Queue (fetch + conditional revalidation).
 */

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

interface FeedSyncMeta {
  etag?: string;
  lastModified?: string;
  sha256?: string;
}

interface SyncFeedResult {
  id: string;
  status: 'unchanged' | 'updated' | 'error';
  ical?: string;
  message?: string;
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

// ── Sync metadata (conditional GET + body hash) ─────────────────────────────

async function getFeedSyncMeta(env: Env, feedId: string): Promise<FeedSyncMeta | null> {
  try {
    const raw = await env.CALENDAR_KV.get<FeedSyncMeta>(`sync-meta:${feedId}`, 'json');
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

async function setFeedSyncMeta(env: Env, feedId: string, meta: FeedSyncMeta): Promise<void> {
  await env.CALENDAR_KV.put(`sync-meta:${feedId}`, JSON.stringify(meta));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleCalendarSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const bust = url.searchParams.get('bust') === 'true';
  const feeds = await getFeeds(env);
  const enabledFeeds = feeds.filter((f) => f.enabled);
  const results: SyncFeedResult[] = [];

  for (const feed of enabledFeeds) {
    try {
      const meta = await getFeedSyncMeta(env, feed.id);
      const headers: Record<string, string> = { 'User-Agent': 'TaskQueue-Calendar/1.0' };
      if (!bust && meta?.etag) headers['If-None-Match'] = meta.etag;
      if (!bust && meta?.lastModified) headers['If-Modified-Since'] = meta.lastModified;

      const res = await fetch(feed.url, { headers });
      if (res.status === 304) {
        results.push({ id: feed.id, status: 'unchanged' });
        continue;
      }
      if (!res.ok) {
        results.push({ id: feed.id, status: 'error', message: `Failed to fetch calendar (HTTP ${res.status})` });
        continue;
      }

      const icalText = await res.text();
      const newEtag = res.headers.get('ETag') || undefined;
      const newLM = res.headers.get('Last-Modified') || undefined;
      const sha256 = await sha256Hex(icalText);

      if (!bust && meta?.sha256 === sha256) {
        await setFeedSyncMeta(env, feed.id, {
          sha256,
          etag: newEtag ?? meta.etag,
          lastModified: newLM ?? meta.lastModified,
        });
        results.push({ id: feed.id, status: 'unchanged' });
        continue;
      }

      await setFeedSyncMeta(env, feed.id, { etag: newEtag, lastModified: newLM, sha256 });
      results.push({ id: feed.id, status: 'updated', ical: icalText });
    } catch (err: any) {
      results.push({ id: feed.id, status: 'error', message: err?.message || 'Fetch failed' });
    }
  }

  return jsonResponse({ feeds: results }, env, 200, request);
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

        if (base === '/calendar/sync' && request.method === 'GET') return await handleCalendarSync(request, env);

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
          return jsonResponse({ feed: stripUrl(newFeed) }, env, 201, request);
        }

        if (parts.length === 3 && parts[0] === 'calendar' && parts[1] === 'feeds') {
          const feedId = parts[2];
          if (request.method === 'DELETE') {
            if (!isAdmin(payload, env)) return errorResponse('Admin only', env, 403, request);
            const feeds = await getFeeds(env);
            await saveFeeds(env, feeds.filter((f) => f.id !== feedId));
            await env.CALENDAR_KV.delete(`sync-meta:${feedId}`);
            return jsonResponse({ success: true }, env, 200, request);
          }
          if (request.method === 'PUT') {
            if (!isAdmin(payload, env)) return errorResponse('Admin only', env, 403, request);
            const body = await request.json() as any;
            const feeds = await getFeeds(env);
            const idx = feeds.findIndex((f) => f.id === feedId);
            if (idx === -1) return errorResponse('Not found', env, 404, request);
            if (body.name) feeds[idx].name = body.name;
            if (body.color) feeds[idx].color = body.color;
            if (body.enabled !== undefined) feeds[idx].enabled = body.enabled;
            if (body.url) {
              feeds[idx].url = body.url;
              await env.CALENDAR_KV.delete(`sync-meta:${feedId}`);
            }
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
  },
};
