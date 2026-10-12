// Account checks for the paid endpoints.
//
// StudLit is a hard paywall: every model call needs a signed-in user whose
// subscription is trialing or active. The plan lives in Supabase app_metadata,
// which only the server (service-role key) can write — the Stripe webhook sets
// it. Users can read their own app_metadata but can't change it, so the browser
// can't promote itself.
//
// Fails closed: if Supabase isn't configured, nothing paid runs.

const { createClient } = require('@supabase/supabase-js');
const { guard, rateLimit } = require('./guard');

let admin = null;
function supabaseAdmin() {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

function bearer(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  return raw.replace(/^Bearer\s+/i, '').trim();
}

// Emails that always count as Pro — for the owner and testers. Comma-separated.
function isComplimentary(email) {
  const list = (process.env.PRO_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return !!email && list.indexOf(String(email).toLowerCase()) !== -1;
}

function hasPro(user) {
  const meta = (user && user.app_metadata) || {};
  return meta.plan === 'pro' || isComplimentary(user && user.email);
}

/**
 * Who is calling? Resolves to { user } or { status, code, error }.
 * Doesn't look at the plan — checkout and the portal need signed-in free users too.
 */
async function getSignedInUser(event) {
  const sb = supabaseAdmin();
  if (!sb) return { status: 503, code: 'auth_unconfigured', error: 'Sign-in is not set up on the server yet.' };

  const token = bearer(event);
  if (!token) return { status: 401, code: 'auth_required', error: 'Please sign in to use StudLit.' };

  let user;
  try {
    const res = await sb.auth.getUser(token);
    user = res && res.data && res.data.user;
  } catch (e) {
    return { status: 503, code: 'auth_unavailable', error: 'Could not check your account. Try again in a moment.' };
  }
  if (!user) return { status: 401, code: 'auth_required', error: 'Your session has expired. Please sign in again.' };
  return { user };
}

/**
 * Who is calling, and may they use paid features?
 * Resolves to { user } on success or { status, code, error } on failure.
 */
async function checkAccount(event) {
  const who = await getSignedInUser(event);
  if (!who.user) return who;
  if (!hasPro(who.user)) {
    return { status: 402, code: 'upgrade_required', error: 'Start your free trial to use this.' };
  }
  return who;
}

/**
 * guard() plus the account check and a per-user rate limit.
 * Same contract as guard(): { response } to return, or { ok, headers, body, user }.
 */
async function guardPro(event, opts) {
  const o = Object.assign({}, opts, { perUser: true });
  const g = guard(event, o);
  if (g.response) return g;

  const acct = await checkAccount(event);
  if (!acct.user) {
    return {
      response: {
        statusCode: acct.status, headers: g.headers,
        body: JSON.stringify({ error: acct.error, code: acct.code })
      }
    };
  }

  const rl = rateLimit(event, o.name || 'fn', o.limit || 30, o.windowMs || 60 * 60 * 1000, 'u:' + acct.user.id);
  if (rl.limited) {
    const mins = Math.max(1, Math.ceil(rl.retryAfter / 60));
    return {
      response: {
        statusCode: 429,
        headers: Object.assign({}, g.headers, { 'Retry-After': String(rl.retryAfter) }),
        body: JSON.stringify({ error: 'You have hit the hourly limit. Try again in about ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.', code: 'rate_limited' })
      }
    };
  }

  return Object.assign({}, g, { user: acct.user });
}

module.exports = { supabaseAdmin, bearer, getSignedInUser, checkAccount, guardPro, hasPro };
