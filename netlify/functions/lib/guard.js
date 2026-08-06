// Shared request guard for the AI-backed functions.
//
// These endpoints call paid model APIs, so an unguarded one is a direct line
// from a stranger's terminal to the OpenAI bill. Three layers here, cheapest
// first: origin check (stops casual cross-site use), per-IP rate limit (stops
// scripted abuse), payload caps (stops one request costing as much as fifty).
//
// Lives in lib/ rather than beside the handlers because Netlify turns every
// top-level file in the functions directory into its own endpoint.

// In-memory buckets. These reset on cold start, which makes this a deterrent
// rather than a wall — the correct trade until there's an auth layer to hang
// real per-user quotas off. Netlify Blobs would make it durable.
const buckets = new Map();
const LAST_SWEEP = { at: Date.now() };
const SWEEP_EVERY_MS = 5 * 60 * 1000;

function sweep(now) {
  if (now - LAST_SWEEP.at < SWEEP_EVERY_MS) return;
  LAST_SWEEP.at = now;
  for (const [key, b] of buckets) {
    if (now - b.windowStart > b.windowMs * 2) buckets.delete(key);
  }
}

function clientIp(event) {
  const h = event.headers || {};
  const direct = h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'];
  if (direct) return direct;
  const fwd = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  return fwd.split(',')[0].trim() || 'unknown';
}

function headerOrigin(event) {
  const h = event.headers || {};
  return h.origin || h.Origin || '';
}

function headerReferer(event) {
  const h = event.headers || {};
  return h.referer || h.Referer || '';
}

// Allowed origins come from ALLOWED_ORIGINS (comma-separated) plus the URLs
// Netlify injects for the production site and the current deploy, so preview
// deploys keep working without extra configuration.
function allowedOrigins() {
  const out = [];
  const explicit = process.env.ALLOWED_ORIGINS || '';
  for (const o of explicit.split(',')) {
    const t = o.trim().replace(/\/$/, '');
    if (t) out.push(t);
  }
  for (const key of ['URL', 'DEPLOY_PRIME_URL', 'DEPLOY_URL']) {
    const v = (process.env[key] || '').trim().replace(/\/$/, '');
    if (v) out.push(v);
  }
  return out;
}

function originAllowed(event) {
  const allow = allowedOrigins();
  // Nothing configured (local dev, or env vars missing) — don't lock the app
  // out of its own backend. The rate limit still applies.
  if (!allow.length) return { ok: true, origin: '*' };

  const origin = headerOrigin(event).replace(/\/$/, '');
  if (origin) {
    return allow.indexOf(origin) !== -1
      ? { ok: true, origin }
      : { ok: false, origin };
  }

  // Some clients and proxies strip Origin. Fall back to Referer, then allow —
  // the rate limit is what actually bounds the damage here.
  const ref = headerReferer(event);
  if (ref) {
    const matched = allow.find(a => ref.indexOf(a) === 0);
    return matched ? { ok: true, origin: matched } : { ok: false, origin: ref };
  }
  return { ok: true, origin: allow[0] };
}

function corsHeaders(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

// Returns { limited, retryAfter } — callers decide how to report it.
function rateLimit(event, name, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  const key = name + ':' + clientIp(event);
  let b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    b = { count: 0, windowStart: now, windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) {
    return { limited: true, retryAfter: Math.ceil((b.windowStart + windowMs - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

const HOUR = 60 * 60 * 1000;

/**
 * Runs every check for a POST endpoint.
 *
 * Returns { response } when the request must be rejected — hand that straight
 * back from the handler. Returns { ok: true, origin, body } when it passes,
 * with the request body already parsed.
 */
function guard(event, opts) {
  const o = opts || {};
  const name = o.name || 'fn';
  const limit = o.limit || 30;
  const windowMs = o.windowMs || HOUR;
  const maxBytes = o.maxBytes || 5 * 1024 * 1024;
  const maxFiles = o.maxFiles || 10;

  const org = originAllowed(event);
  const headers = corsHeaders(org.ok ? org.origin : allowedOrigins()[0] || '*');

  if (event.httpMethod === 'OPTIONS') {
    return { response: { statusCode: 204, headers, body: '' } };
  }
  if (event.httpMethod !== 'POST') {
    return { response: { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) } };
  }
  if (!org.ok) {
    return { response: { statusCode: 403, headers, body: JSON.stringify({ error: 'Requests are not allowed from this origin.' }) } };
  }

  const raw = event.body || '';
  const size = Buffer.byteLength(raw, event.isBase64Encoded ? 'base64' : 'utf8');
  if (size > maxBytes) {
    return {
      response: {
        statusCode: 413, headers,
        body: JSON.stringify({ error: 'That upload is too large. Try fewer or smaller files.' })
      }
    };
  }

  const rl = rateLimit(event, name, limit, windowMs);
  if (rl.limited) {
    const mins = Math.max(1, Math.ceil(rl.retryAfter / 60));
    return {
      response: {
        statusCode: 429,
        headers: Object.assign({}, headers, { 'Retry-After': String(rl.retryAfter) }),
        body: JSON.stringify({ error: 'You have hit the usage limit. Try again in about ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.' })
      }
    };
  }

  let body;
  try { body = JSON.parse(raw || '{}'); }
  catch (e) {
    return { response: { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) } };
  }

  if (Array.isArray(body.files) && body.files.length > maxFiles) {
    return {
      response: {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Too many files at once. Upload up to ' + maxFiles + '.' })
      }
    };
  }

  return { ok: true, origin: org.ok ? org.origin : '*', headers, body };
}

module.exports = { guard, rateLimit, clientIp, corsHeaders, originAllowed, HOUR };
