import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

let pending = null;
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

let cachedCatalog = null;
let cachedAt = 0;
const CHUNK = 512 * 1024;
const MAX_RANGE = 8 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function failure(status, message) { return json({ error: message }, status); }
async function getClient(env) {
  if (!pending) {
    pending = (async () => {
      const client = new TelegramClient(new StringSession(env.TELEGRAM_SESSION), Number(env.TELEGRAM_API_ID), env.TELEGRAM_API_HASH, {
        connectionRetries: 1, useWSSecure: true, autoReconnect: true
      });
      await client.connect();
      if (!await client.isUserAuthorized()) throw Error('Telegram session unauthorized');
      return client;
    })().catch(err => { pending = null; throw err; });
  }
  const client = await pending;
  if (!client.connected) { pending = null; return getClient(env); }
  return client;
}
async function catalog(env) {
  if (cachedCatalog && Date.now() - cachedAt < 60000) return cachedCatalog;
  const response = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 60 } });
  if (!response.ok) throw Error('Catalog unavailable');
  const data = await response.json();
  if (!Array.isArray(data.movies)) throw Error('Invalid catalog');
  cachedCatalog = data.movies; cachedAt = Date.now();
  return cachedCatalog;
}
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
async function media(request, env, id, download) {
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
  let client, entity, messages;
  try { client = await getClient(env); } catch (err) { diagnostic('telegram-connect', err); throw err; }
  try { entity = await client.getEntity(env.TELEGRAM_CHANNEL_ID); } catch (err) { diagnostic('telegram-channel', err); throw err; }
  try { messages = await client.getMessages(entity, { ids: [movie.telegram_message_id] }); } catch (err) { diagnostic('telegram-message', err); throw err; }
  const message = messages?.[0];
  const document = message?.media?.document;
  if (!(document instanceof Api.Document)) return failure(404, 'Telegram document unavailable');
  // Start fetching before responding so failures do not produce an empty 206 response.
  const iterator = client.iterDownload({ file: document, offset: BigInt(start), limit: Math.ceil(length / CHUNK), chunkSize: CHUNK, requestSize: CHUNK })[Symbol.asyncIterator]();
  let first;
  try { first = await iterator.next(); } catch (err) { diagnostic('telegram-first-chunk', err); return failure(502, 'Telegram media fetch failed'); }
  if (first.done || !first.value?.length) return failure(502, 'Telegram returned no media bytes');
  let remaining = length;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const next = first ? (first.done ? null : first.value) : null;
        first = null;
        const result = next ? { value: next, done: false } : await iterator.next();
        if (result.done) {
          if (remaining !== 0) controller.error(new Error('Incomplete Telegram stream'));
          else controller.close();
          return;
        }
        const bytes = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
        const part = bytes.subarray(0, remaining);
        remaining -= part.byteLength;
        controller.enqueue(part);
        if (remaining <= 0) { controller.close(); await iterator.return?.(); }
      } catch (err) { controller.error(err); }
    },
    async cancel() { try { await iterator.return?.(); } catch {} }
  });
  return new Response(stream, { status: 206, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', provider: 'cloudflare-worker', experimental: true });
    const match = /^\/(stream|download)\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    if (!match) return failure(404, 'Not found');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return failure(405, 'Method not allowed');
    if (env.PUBLIC_ORIGIN && request.headers.get('origin') && request.headers.get('origin') !== env.PUBLIC_ORIGIN) return failure(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': env.PUBLIC_ORIGIN || 'null', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' } });
    try { return await media(request, env, match[2], match[1] === 'download'); }
    catch (err) { diagnostic('request', err); return failure(502, 'Streaming gateway unavailable'); }
  }
};
