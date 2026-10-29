// FilmGo streaming edge Worker — lightweight proxy.
//
//   Browser -> Cloudflare edge (this Worker) -> origin backend -> Telegram
//
// This Worker NEVER touches Telegram and never reads, buffers, decodes or
// rewrites video bytes. It only validates the request, forwards the Range
// header to the origin, and hands the origin's response body straight back to
// the browser. CPU per request is ~1 ms, so it fits the Workers Free plan
// (10 ms CPU) and the same Worker can serve many viewers at once.
//
// The previous version ran the GramJS Telegram SDK inside the Worker. That
// needs far more CPU than the free plan allows (log: outcome "exceededCpu").

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const ROUTE = /^\/(stream|download)\/([a-zA-Z0-9_-]{1,80})$/;
const FIRST_BYTE_TIMEOUT_MS = 30000; // time allowed for the origin to answer with headers
const RETRY_DELAY_MS = 250;

// Response headers that must reach the player unchanged for seeking to work.
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'retry-after'];
// Request headers forwarded to the origin (nothing else: no cookies, no auth).
const FORWARD_HEADERS = ['range', 'if-range', 'if-none-match', 'if-modified-since'];

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

function originBase(env) {
  const raw = String(env.ORIGIN_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/i.test(raw)) return null; // https origin only, no path
  return raw;
}

function corsHeaders(env) {
  const h = {};
  if (env.PUBLIC_ORIGIN) {
    h['Access-Control-Allow-Origin'] = env.PUBLIC_ORIGIN;
    h['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length, Accept-Ranges';
    h['Vary'] = 'Origin';
  }
  return h;
}

// Fetch from the origin with a timeout that covers ONLY the wait for response
// headers. The timer is cleared once headers arrive so a long movie is never cut off.
async function fetchOrigin(target, method, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    return await fetch(target, {
      method,
      headers,
      redirect: 'manual',
      signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false } // video ranges are never cached at the edge
    });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (url.pathname === '/health') {
      return json({ status: 'ok', mode: 'proxy', origin_configured: Boolean(originBase(env)) });
    }

    const match = ROUTE.exec(url.pathname);
    if (!match || !ID_PATTERN.test(match[2])) return json({ error: 'Not found' }, 404);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);

    const browserOrigin = request.headers.get('origin');
    if (env.PUBLIC_ORIGIN && browserOrigin && browserOrigin !== env.PUBLIC_ORIGIN) return json({ error: 'Origin not allowed' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-Range', 'Access-Control-Max-Age': '86400' }
      });
    }

    const base = originBase(env);
    if (!base) return json({ error: 'Streaming gateway is not configured' }, 503);

    const [, kind, id] = match;
    const quality = url.searchParams.get('quality');
    if (quality && !/^(?:360|480|720|1080|1440|2160)p$/i.test(quality)) return json({ error: 'Invalid quality' }, 400);
    const target = base + (kind === 'download' ? '/api/download/' : '/api/stream/') + id + (quality ? '?quality=' + encodeURIComponent(quality) : '');

    // MODE=redirect: the browser fetches bytes straight from the origin. The Worker
    // only validates the request, so no video bytes pass through Cloudflare at all.
    if (String(env.MODE || 'proxy').toLowerCase() === 'redirect') {
      return new Response(null, { status: 307, headers: { Location: target, 'cache-control': 'no-store', ...cors } });
    }

    // MODE=proxy (default): pass-through.
    const upstreamHeaders = new Headers({ 'accept-encoding': 'identity' }); // never compress video
    for (const name of FORWARD_HEADERS) {
      const value = request.headers.get(name);
      if (value) upstreamHeaders.set(name, value);
    }

    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        upstream = await fetchOrigin(target, request.method, upstreamHeaders);
        // Retry once on transient origin errors; safe because no body has been sent yet.
        if (attempt === 0 && (upstream.status === 502 || upstream.status === 503 || upstream.status === 504)) {
          await upstream.body?.cancel();
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      } catch (err) {
        console.error('FilmGo origin fetch failed', JSON.stringify({ attempt, name: err?.name, message: String(err?.message || '').slice(0, 160) }));
        if (attempt === 1) {
          return json({ error: err?.name === 'AbortError' ? 'Origin timed out' : 'Origin unavailable' }, err?.name === 'AbortError' ? 504 : 502, cors);
        }
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    if (!upstream) return json({ error: 'Origin unavailable' }, 502, cors);

    const headers = new Headers(cors);
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('Accept-Ranges', 'bytes');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) headers.set('Content-Disposition', kind === 'download' ? disposition.replace(/^inline/i, 'attachment') : disposition);

    if (upstream.status >= 400) {
      // Small JSON error body from the origin; pass it on with its status.
      headers.set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    }

    // upstream.body is passed through untouched: it is streamed, never buffered,
    // and cancelling the browser connection cancels the origin request.
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  }
};
