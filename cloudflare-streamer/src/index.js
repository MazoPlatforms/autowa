import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// ---------------------------------------------------------------------------
// FilmGo Telegram streaming Worker (experimental)
//
// Design rules (learned from Cloudflare logs):
//  * A Telegram connection belongs to ONE request. Never keep clients, sockets
//    or GramJS promises in module scope (causes "promise resolved from a
//    different request context" and "Worker code had hung" cancellations).
//  * Every network step has a hard timeout, including each streamed chunk.
//  * Every exit path closes the client (fire-and-forget, via ctx.waitUntil).
// ---------------------------------------------------------------------------

const CHUNK = 512 * 1024;
const MAX_RANGE = 8 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 12000;
const RPC_TIMEOUT_MS = 12000;
const DIALOG_TIMEOUT_MS = 20000;
const CHUNK_TIMEOUT_MS = 20000;
const CATALOG_TTL_MS = 60000;

// Only the catalog (plain JSON, no sockets) is cached across requests.
let cachedCatalog = null;
let cachedAt = 0;

class GatewayError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

function diagnostic(stage, err) {
  const type = err?.name || 'Error';
  const code = typeof err?.code === 'string' || typeof err?.code === 'number' ? String(err.code) : 'none';
  const raw = String(err?.message || '');
  const message = raw
    .replace(/\b\d{7,}\b/g, '[number]')
    .replace(/(?:[A-Za-z0-9_+\/-]{24,}={0,2})/g, '[redacted]')
    .slice(0, 240);
  console.error('FilmGo gateway failure', JSON.stringify({ stage, type, code, message }));
}

function stage(name) {
  console.info('FilmGo Telegram stage', name);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}
function failure(status, message, extra) { return json({ error: message }, status, extra); }

// Race an operation against a timer. The timer is always cleared.
// A timeout rejects with err.isTimeout = true so callers can tell it apart.
async function bounded(operation, ms, name, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          diagnostic(name + '-timeout', new Error('Operation exceeded time limit'));
          try { onTimeout?.(); } catch {}
          const err = new Error(name + ' timed out');
          err.isTimeout = true;
          reject(err);
        }, ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function readConfig(env) {
  const apiId = Number(String(env.TELEGRAM_API_ID ?? '').trim());
  const apiHash = String(env.TELEGRAM_API_HASH ?? '').trim();
  const session = String(env.TELEGRAM_SESSION ?? '').trim();
  const channelRaw = String(env.TELEGRAM_CHANNEL_ID ?? '').trim();
  const status = {
    apiIdValid: Number.isSafeInteger(apiId) && apiId > 0,
    apiHashPresent: Boolean(apiHash),
    sessionPresent: Boolean(session),
    channelPresent: Boolean(channelRaw)
  };
  const ok = Object.values(status).every(Boolean);
  // Numeric channel ids (-100...) MUST be passed as numbers; as strings GramJS
  // treats them as usernames and the lookup fails.
  const channel = /^-?\d+$/.test(channelRaw) ? Number(channelRaw) : channelRaw;
  return { ok, status, apiId, apiHash, session, channel };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
async function catalog(env) {
  if (cachedCatalog && Date.now() - cachedAt < CATALOG_TTL_MS) return cachedCatalog;
  try {
    const response = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 60 } });
    if (!response.ok) throw new Error('Catalog unavailable (' + response.status + ')');
    const data = await response.json();
    if (!Array.isArray(data.movies)) throw new Error('Invalid catalog');
    cachedCatalog = data.movies;
    cachedAt = Date.now();
    return cachedCatalog;
  } catch (err) {
    // Serve a stale copy rather than failing playback when GitHub raw hiccups.
    if (cachedCatalog) { diagnostic('catalog-stale', err); return cachedCatalog; }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Range / header helpers
// ---------------------------------------------------------------------------
function rangeOf(value, size) {
  if (!value) return { start: 0, end: Math.min(size - 1, MAX_RANGE - 1) };
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(size - 1, requestedEnd, start + MAX_RANGE - 1) };
}
function safeName(movie) {
  const raw = String(movie.file_name || (movie.title || 'video') + '.mp4');
  return raw.replace(/[^a-zA-Z0-9 ._()-]/g, '_').slice(0, 180) || 'video.mp4';
}
function mime(name, movie) {
  const ext = name.toLowerCase().split('.').pop();
  return ({ mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime' })[ext] || movie.mime_type || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Telegram session (one per request)
// ---------------------------------------------------------------------------
function openClient(config, ctx) {
  const client = new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
    connectionRetries: 0, autoReconnect: false, timeout: 10000
  });
  try { client.setLogLevel(globalThis.__GRAMJS_LOG_LEVEL || 'warn'); } catch {}

  let closed = false;
  // Idempotent, never throws, never blocks the response, and is kept alive by
  // waitUntil so the runtime does not cancel the disconnect mid-flight.
  const close = () => {
    if (closed) return;
    closed = true;
    const task = Promise.resolve().then(() => client.disconnect()).catch(() => {});
    try { ctx?.waitUntil(task); } catch {}
  };
  return { client, close };
}

async function connectClient(session) {
  stage('connect-start');
  // connect() already performs the InitConnection/GetConfig round trip, which
  // proves the transport works. An extra getMe() probe is NOT needed: an
  // unauthorized session fails on the first real RPC with AUTH_KEY_UNREGISTERED,
  // which describeError() reports clearly.
  await bounded(() => session.client.connect(), CONNECT_TIMEOUT_MS, 'connect', session.close);
  stage('connect-complete');
}

async function resolveChannel(client, channel) {
  stage('channel-lookup-start');
  try {
    const entity = await bounded(() => client.getEntity(channel), RPC_TIMEOUT_MS, 'channel-lookup');
    stage('channel-lookup-complete');
    return entity;
  } catch (err) {
    // Same strategy as the proven Telethon backend: a fresh StringSession has
    // no entity cache, so load recent dialogs and match the channel there.
    if (err?.isTimeout || typeof channel !== 'number') throw err;
    diagnostic('channel-lookup-direct', err);
  }
  stage('dialog-lookup-start');
  const dialogs = await bounded(() => client.getDialogs({ limit: 100 }), DIALOG_TIMEOUT_MS, 'dialog-lookup');
  const raw = String(Math.abs(channel));
  const bareId = raw.startsWith('100') ? raw.slice(3) : raw;
  const hit = dialogs.find(d => String(d.id) === String(channel) || String(d.entity?.id) === bareId);
  if (!hit?.entity) throw new GatewayError(502, 'Telegram channel not found for this session');
  stage('dialog-lookup-complete');
  return hit.entity;
}

// ---------------------------------------------------------------------------
// Media endpoint
// ---------------------------------------------------------------------------
async function media(request, env, ctx, id, download) {
  let movies;
  try { movies = await catalog(env); } catch (err) { diagnostic('catalog', err); throw err; }
  const movie = movies.find(m => m.slug_id === id);
  if (!movie || !Number.isSafeInteger(movie.telegram_message_id) || !Number.isSafeInteger(movie.file_size) || movie.file_size <= 0) return failure(404, 'Movie unavailable');

  const size = movie.file_size;
  const selected = rangeOf(request.headers.get('range'), size);
  if (!selected) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  const { start, end } = selected;
  const length = end - start + 1;
  const name = safeName(movie);
  const headers = new Headers({
    'Content-Type': mime(name, movie),
    'Content-Length': String(length),
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + name + '"'
  });
  if (env.PUBLIC_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.PUBLIC_ORIGIN);
    headers.set('Vary', 'Origin');
  }
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers });

  const config = readConfig(env);
  if (!config.ok) {
    console.error('FilmGo configuration check', JSON.stringify(config.status));
    return failure(503, 'Streaming gateway is not configured');
  }

  globalThis.__GRAMJS_LOG_LEVEL = String(env.GRAMJS_LOG_LEVEL || 'warn');
  const session = openClient(config, ctx);
  const { client } = session;
  let handedOff = false; // true once the stream owns the client lifecycle
  try {
    await connectClient(session);
    const entity = await resolveChannel(client, config.channel);

    stage('message-lookup-start');
    const messages = await bounded(() => client.getMessages(entity, { ids: [movie.telegram_message_id] }), RPC_TIMEOUT_MS, 'message-lookup');
    stage('message-lookup-complete');
    const document = messages?.[0]?.media?.document;
    if (!(document instanceof Api.Document)) return failure(404, 'Telegram document unavailable');
    stage('document-resolved');

    // Explicit TL location avoids GramJS "Cannot cast Document to any kind of
    // InputFileLocation" (seen in logs on 2026-10-28 21:34).
    const location = new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize: ''
    });
    const iterator = client.iterDownload({
      file: location, offset: BigInt(start),
      limit: Math.ceil(length / CHUNK),
      chunkSize: CHUNK, requestSize: CHUNK,
      dcId: document.dcId, fileSize: document.size
    })[Symbol.asyncIterator]();

    // Fetch the first chunk before answering so failures return a real error
    // status instead of an empty 206.
    stage('first-chunk-start');
    let first;
    try {
      first = await bounded(() => iterator.next(), RPC_TIMEOUT_MS, 'first-chunk');
    } catch (err) {
      diagnostic('telegram-first-chunk', err);
      return failure(err?.isTimeout ? 504 : 502, 'Telegram media fetch failed');
    }
    if (first.done || !first.value?.length) return failure(502, 'Telegram returned no media bytes');
    stage('first-chunk-complete');

    let remaining = length;
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      try { await Promise.race([iterator.return?.(), new Promise(r => setTimeout(r, 2000))]); } catch {}
      session.close();
    };

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          let result;
          if (first) { result = first; first = null; }
          else result = await bounded(() => iterator.next(), CHUNK_TIMEOUT_MS, 'chunk');

          if (result.done) {
            if (remaining !== 0) controller.error(new Error('Incomplete Telegram stream'));
            else controller.close();
            await finish();
            return;
          }
          const bytes = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
          const part = bytes.subarray(0, remaining);
          remaining -= part.byteLength;
          controller.enqueue(part);
          if (remaining <= 0) { controller.close(); await finish(); }
        } catch (err) {
          diagnostic('stream-chunk', err);
          controller.error(err);
          await finish();
        }
      },
      async cancel() { await finish(); }
    });
    handedOff = true;
    return new Response(stream, { status: 206, headers });
  } finally {
    // Any early return or throw before the stream exists must release Telegram.
    if (!handedOff) session.close();
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------
function describeError(err) {
  if (err instanceof GatewayError) return failure(err.status, err.message);
  const msg = String(err?.message || '');
  if (/AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|unauthorized/i.test(msg)) {
    return failure(503, 'Telegram session invalid or expired; regenerate TELEGRAM_SESSION');
  }
  const flood = /FLOOD_?WAIT\D*(\d+)|wait of (\d+) seconds/i.exec(msg);
  if (flood) return failure(429, 'Telegram rate limit; retry later', { 'Retry-After': String(flood[1] || flood[2]) });
  if (err?.isTimeout) return failure(504, 'Telegram request timed out');
  return failure(502, 'Streaming gateway unavailable');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', provider: 'cloudflare-worker', experimental: true, configured: readConfig(env).ok });
    const match = /^\/(stream|download)\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    if (!match) return failure(404, 'Not found');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return failure(405, 'Method not allowed');
    if (env.PUBLIC_ORIGIN && request.headers.get('origin') && request.headers.get('origin') !== env.PUBLIC_ORIGIN) return failure(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': env.PUBLIC_ORIGIN || 'null', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' } });
    try { return await media(request, env, ctx, match[2], match[1] === 'download'); }
    catch (err) { diagnostic('request', err); return describeError(err); }
  }
};
