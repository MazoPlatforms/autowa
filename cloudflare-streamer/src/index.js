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

const CONNECT_TIMEOUT_MS = 12000;
const RPC_TIMEOUT_MS = 12000;

async function bounded(operation, ms, stage, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          diagnostic(stage + '-timeout', new Error('Operation exceeded time limit'));
          try { onTimeout?.(); } catch {}
          reject(new Error(stage + ' timed out'));
        }, ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function getClient(env) {
  const apiId = Number(String(env.TELEGRAM_API_ID ?? '').trim());
  const apiHash = String(env.TELEGRAM_API_HASH ?? '').trim();
  const session = String(env.TELEGRAM_SESSION ?? '').trim();
  
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !session) {
    throw Error('Telegram Worker bindings missing or invalid');
  }
  
  if (!pending) {
    pending = (async () => {
      let client;
      try {
        client = new TelegramClient(new StringSession(session), apiId, apiHash, {
          connectionRetries: 5, 
          useWSSecure: true, 
          autoReconnect: true,
          timeout: 15000
        });
        
        await bounded(() => client.connect(), CONNECT_TIMEOUT_MS, 'connect', () => { 
          void client.disconnect().catch(() => {}); 
        });
        
        return client;
      } catch (err) {
        diagnostic('telegram-client-lifecycle', err);
        if (client) { try { void client.disconnect().catch(() => {}); } catch {} }
        throw err;
      }
    })().catch(err => { pending = null; throw err; });
  }
  
  const client = await pending;
  if (!client.connected) {
    pending = null;
    throw Error('Telegram client disconnected; retry request');
  }
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

async function media(request, env, slugId, download) {
  let movies;
  try { movies = await catalog(env); } catch (err) { diagnostic('catalog', err); throw err; }
  
  // AES-GCM நீக்கப்பட்டு, நேரடியாக கேட்லாக் slug_id கொண்டு தேடப்படுகிறது
  const movie = movies.find(m => m.slug_id === slugId);
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
  
  let client, messages;
  try { client = await getClient(env); } catch (err) { diagnostic('telegram-connect', err); throw err; }

  let channelTarget = env.TELEGRAM_CHANNEL_ID;
  if (typeof channelTarget === 'string') {
    channelTarget = channelTarget.trim();
    if (!channelTarget.startsWith('-100') && /^\d+$/.test(channelTarget)) {
      channelTarget = '-100' + channelTarget;
    }
  }
  
  try { 
    console.info('FilmGo Telegram stage', 'message-lookup-start'); 
    messages = await bounded(() => client.getMessages(channelTarget, { ids: [movie.telegram_message_id] }), RPC_TIMEOUT_MS, 'message-lookup'); 
    console.info('FilmGo Telegram stage', 'message-lookup-complete'); 
  } catch (err) { 
    diagnostic('telegram-message', err); 
    throw err; 
  }
  
  const message = (messages && Array.isArray(messages)) ? messages[0] : (messages ? messages : null);
  const document = message?.media?.document;
  if (!(document instanceof Api.Document)) return failure(404, 'Telegram document unavailable');
  console.info('FilmGo Telegram stage', 'document-resolved');
  
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
  
  let first;
  try { 
    console.info('FilmGo Telegram stage', 'first-chunk-start'); 
    first = await bounded(() => iterator.next(), RPC_TIMEOUT_MS, 'first-chunk'); 
    console.info('FilmGo Telegram stage', 'first-chunk-complete'); 
  } catch (err) { 
    diagnostic('telegram-first-chunk', err); 
    return failure(502, 'Telegram media fetch failed'); 
  }
  
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
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204, 
        headers: { 
          'Access-Control-Allow-Origin': env.PUBLIC_ORIGIN || 'null', 
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 
          'Access-Control-Allow-Headers': 'Range' 
        } 
      });
    }
    
    try { 
      return await media(request, env, match[2], match[1] === 'download'); 
    } catch (err) { 
      diagnostic('request', err); 
      return failure(502, 'Streaming gateway unavailable'); 
    }
  }
};
