/**
 * Cloudflare Worker: iCal calendar proxy for Task Queue.
 * Fetches iCal feeds, parses events for today, returns JSON.
 * Replaces Firebase Cloud Functions — free tier, no CORS issues.
 *
 * Calendar feed URLs are stored as Cloudflare Worker secrets (KV not needed
 * for a small list). Set them via:
 *   npx wrangler secret put CALENDAR_FEEDS
 *   (paste JSON array: [{"url":"https://...","name":"Work","color":"#4285f4"}])
 */

import { parseICal } from './ical-parser';

interface Env {
  CALENDAR_FEEDS?: string; // JSON string of CalendarFeed[]
  ALLOWED_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
}

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

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedSigningKeys: CachedSigningKeys | null = null;

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS, PUT',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) {
    return 3600;
  }

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
    if (typeof jwk.kid !== 'string') {
      continue;
    }
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

  if (!verified) {
    throw new Error('Invalid token signature');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;

  if (payload.aud !== env.FIREBASE_PROJECT_ID) {
    throw new Error('Invalid token audience');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Invalid token issuer');
  }
  if (!payload.sub || payload.sub.length === 0) {
    throw new Error('Invalid token subject');
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Expired token');
  }
  if (!payload.iat || payload.iat > nowSeconds + 60) {
    throw new Error('Invalid token issue time');
  }

  return payload;
}

/**
 * Convert a date string + time string in a given timezone to a UTC Date.
 * E.g. getTimezoneDate("2026-03-25", "00:00:00", "America/Los_Angeles")
 * returns the UTC Date that corresponds to midnight PT on March 25.
 */
function getTimezoneDate(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  
  const parts = dtf.formatToParts(utcDate);
  const p: any = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  
  // Construct a date as if the target timezone's components were UTC
  const localAsUtc = new Date(`${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}T${p.hour.padStart(2, '0')}:${p.minute.padStart(2, '0')}:${p.second.padStart(2, '0')}Z`);
  const offset = localAsUtc.getTime() - utcDate.getTime();
  
  return new Date(utcDate.getTime() - offset);
}

async function handleTodayEvents(request: Request, env: Env): Promise<Response> {
  // Parse feeds from secret
  let feeds: CalendarFeed[] = [];
  try {
    feeds = env.CALENDAR_FEEDS ? JSON.parse(env.CALENDAR_FEEDS) : [];
  } catch {
    return jsonResponse({ error: 'Invalid CALENDAR_FEEDS config' }, env, 500);
  }

  if (feeds.length === 0) {
    return jsonResponse({ events: [], message: 'No calendar feeds configured.' }, env);
  }

  // Client sends ?tz=America/Los_Angeles so we know what "today" means locally.
  const url = new URL(request.url);
  const tz = url.searchParams.get('tz') || 'America/Los_Angeles';
  const now = new Date();

  // Support ?date=YYYY-MM-DD for fetching a specific day (defaults to today)
  const todayStr = url.searchParams.get('date') || now.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD

  // Build midnight-to-midnight in the user's timezone as UTC instants
  const todayStart = getTimezoneDate(todayStr, '00:00:00', tz);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const allEvents: CalendarEvent[] = [];

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'TaskQueue-Calendar/1.0' },
          // Add a timeout if possible, but Workers fetch doesn't support signal easily here without more boilerplate
        });
        if (!res.ok) {
          console.error(`Feed "${feed.name}" returned ${res.status}`);
          return [];
        }

        const text = await res.text();
        const events = parseICal(text, todayStart, todayEnd);

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
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value);
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return jsonResponse({ events: allEvents }, env);
}

async function handleFeeds(env: Env): Promise<Response> {
  let feeds: CalendarFeed[] = [];
  try {
    feeds = env.CALENDAR_FEEDS ? JSON.parse(env.CALENDAR_FEEDS) : [];
  } catch {
    return jsonResponse({ feeds: [] }, env);
  }

  return jsonResponse({
    feeds: feeds.map((f) => ({ name: f.name, color: f.color, hasUrl: !!f.url })),
  }, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(env) });
      }

      if (url.pathname === '/calendar/today' || url.pathname === '/calendar/feeds') {
        try {
          await authenticateRequest(request, env);
        } catch (error) {
          console.error('Calendar auth failed:', error);
          return jsonResponse({ error: 'Unauthorized', message: (error as Error).message }, env, 401);
        }
      }

      // Route
      if (url.pathname === '/calendar/today' && request.method === 'GET') {
        return await handleTodayEvents(request, env);
      }

      if (url.pathname === '/calendar/feeds' && request.method === 'GET') {
        return await handleFeeds(env);
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
        stack: err.stack 
      }, env, 500);
    }
  },
};
