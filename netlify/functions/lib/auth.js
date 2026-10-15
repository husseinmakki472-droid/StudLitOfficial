// Identity and entitlement for the paid endpoints.
//
// guard.js answers "is this request abusive?" using the origin and the caller's
// IP. That was the right check while the app had no accounts, but an IP is not
// a customer: it is shared by a school's whole network and it changes when a
// phone moves between wifi and cellular. This module answers the question that
// actually decides whether to spend money — "who is this, and have they paid?"
//
// The plan lives in Supabase `app_metadata`, which only the service role can
// write. `user_metadata` would have been the wrong home: the browser can edit
// that, so a user could grant themselves Pro from the console.

const { createClient } = require('@supabase/supabase-js');
const { getStore } = require('@netlify/blobs');

// ── Configuration ──────────────────────────────────────────────────────────
// Every limit is an env var so these can be tightened the day abuse appears,
// without a deploy.
// Four, because the most expensive single mode is weighted four. At three, a
// new account that picked Tutor — the mode most likely to sell the product —
// hit the paywall having been shown nothing at all. The free tier exists to
// demonstrate the thing; a demo that never runs converts nobody.
//
// The exposure this accepts: one free account can cost about $1.10 in the
// worst case (a tutor lesson over a long chapter). Lower it to 2 if sign-up
// abuse ever outpaces conversion.
const FREE_GENERATIONS = num(process.env.FREE_GENERATION_LIMIT, 4);
const PRO_MONTHLY_UNITS = num(process.env.PRO_MONTHLY_LIMIT, 1200);
// Three days. Short enough to keep urgency, long enough to span a weekend,
// which is when most studying actually happens. Raise it with the TRIAL_DAYS
// env var — no deploy needed — if signups start trialling and lapsing without
// ever generating a second time.
const TRIAL_DAYS = num(process.env.TRIAL_DAYS, 3);

function num(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function round2(n) { return Math.round(n * 100) / 100; }

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

// ── Token verification ─────────────────────────────────────────────────────
// Verified over the network rather than by checking the JWT signature locally.
// Slower by roughly 150ms, but it reads the *current* app_metadata, so a user
// who subscribes thirty seconds ago is Pro on their next request instead of
// waiting out the lifetime of a cached token. On a request that then spends
// 20+ seconds in a model API, that trade is free.
//
// Short cache so the 3-second status poll doesn't turn into a Supabase flood.
const tokenCache = new Map();
const TOKEN_TTL_MS = 60 * 1000;

function cacheSweep(now) {
  if (tokenCache.size < 500) return;
  for (const [k, v] of tokenCache) if (now > v.expires) tokenCache.delete(k);
}

function bearer(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

/**
 * Resolves the caller. Returns null when there is no usable token — callers
 * decide whether that is fatal.
 */
async function getUser(event) {
  const token = bearer(event);
  if (!token || !configured()) return null;

  const now = Date.now();
  cacheSweep(now);
  const hit = tokenCache.get(token);
  if (hit && now < hit.expires) return hit.user;

  try {
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data || !data.user) return null;
    tokenCache.set(token, { user: data.user, expires: now + TOKEN_TTL_MS });
    return data.user;
  } catch (e) {
    // Supabase unreachable. Returning null means "not signed in", which the
    // callers below turn into a 401 rather than free access.
    console.error('auth_lookup_failed', e.message);
    return null;
  }
}

// ── Entitlement ────────────────────────────────────────────────────────────
// `past_due` keeps access on purpose. Stripe retries a declined card over
// about two weeks before giving up and moving the subscription to `canceled`,
// and the overwhelming majority of those declines are expired cards rather
// than people trying to dodge payment. Cutting a paying customer off on the
// first failed retry costs more in refunds and support than two weeks of
// usage does.
const ENTITLED_STATUSES = ['trialing', 'active', 'past_due'];

function entitlement(user) {
  const meta = (user && user.app_metadata) || {};
  const plan = meta.plan === 'pro' ? 'pro' : 'free';
  const status = meta.plan_status || null;

  let isPro = plan === 'pro' && ENTITLED_STATUSES.indexOf(status) !== -1;

  // A period end in the past means the webhook that should have downgraded
  // this account never arrived. Trust the clock over the flag.
  const endsAt = meta.current_period_end ? Date.parse(meta.current_period_end) : NaN;
  if (isPro && Number.isFinite(endsAt)) {
    const grace = 24 * 60 * 60 * 1000;
    if (Date.now() > endsAt + grace) isPro = false;
  }

  return {
    plan,
    status,
    isPro,
    interval: meta.plan_interval || null,
    currentPeriodEnd: meta.current_period_end || null,
    cancelAtPeriodEnd: Boolean(meta.cancel_at_period_end),
    trialStart: meta.trial_start || null,
    customerId: meta.stripe_customer_id || null,
    subscriptionId: meta.stripe_subscription_id || null,
  };
}

// ── Usage ──────────────────────────────────────────────────────────────────
// Netlify Blobs rather than the in-memory buckets in guard.js: a free quota
// that resets whenever a function cold-starts is not a quota.
//
// Cost is weighted because the modes are nowhere near equal — a tutor lesson
// measured at $1.10 against $0.03 for flashcards on the same chapter. Counting
// both as "one generation" would let the free tier run up 35x what it looks
// like it costs.
function usageStore() {
  const opts = { name: 'usage' };
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_TOKEN;
  if (siteID && token) { opts.siteID = siteID; opts.token = token; }
  return getStore(opts);
}

function monthKey(d) {
  const t = d || new Date();
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0');
}

async function readUsage(userId) {
  try {
    const store = usageStore();
    const rec = await store.get('u/' + userId, { type: 'json' });
    return rec || { lifetime: 0, month: monthKey(), monthUnits: 0 };
  } catch (e) {
    return null;              // null means "could not read", not "zero used"
  }
}

async function writeUsage(userId, rec) {
  try {
    await usageStore().setJSON('u/' + userId, rec);
    return true;
  } catch (e) {
    console.error('usage_write_failed', e.message);
    return false;
  }
}

/**
 * Records `units` of spend and reports whether the caller was already over
 * their allowance. Counted before the model call rather than after, so a
 * request that dies mid-generation still costs the user their quota — the
 * money was spent either way.
 */
// A generation is attempted on the background function first and retried on
// the synchronous one when the background job never reports in. Both paths
// charge, so without a shared key the same piece of work bills twice — which
// on a three-unit free allowance is the difference between two generations
// and one.
async function alreadyCharged(key) {
  try { return Boolean(await usageStore().get('idem/' + key)); }
  catch (e) { return false; }
}

async function markCharged(key, units) {
  try { await usageStore().setJSON('idem/' + key, { units, at: new Date().toISOString() }); }
  catch (e) { /* a missed marker risks one double charge, not a broken request */ }
}

async function consume(userId, isPro, units, idemKey) {
  // Fractional on purpose. A chat reply costs a small fraction of a full
  // generation, and rounding it up to one would spend a free user's whole
  // allowance on three follow-up questions about a deck they just made.
  const u = typeof units === 'number' && units > 0 ? units : 1;

  if (idemKey && await alreadyCharged(userId + ':' + idemKey)) {
    return { allowed: true, remaining: null, repeat: true };
  }

  const rec = await readUsage(userId);

  if (!rec) {
    // Blobs unavailable. Paying customers keep working; free accounts do not,
    // because an unreadable counter would otherwise mean an unlimited one.
    // This splits the risk the right way: an outage degrades the free tier,
    // never the tier that is paying for the outage.
    return { allowed: isPro, reason: isPro ? null : 'storage', remaining: null, degraded: true };
  }

  const nowMonth = monthKey();
  if (rec.month !== nowMonth) { rec.month = nowMonth; rec.monthUnits = 0; }

  if (isPro) {
    if (rec.monthUnits + u > PRO_MONTHLY_UNITS) {
      return { allowed: false, reason: 'pro_cap', remaining: 0, limit: PRO_MONTHLY_UNITS };
    }
  } else if (rec.lifetime + u > FREE_GENERATIONS) {
    return {
      allowed: false, reason: 'free_cap',
      remaining: Math.max(0, FREE_GENERATIONS - rec.lifetime), limit: FREE_GENERATIONS,
    };
  }

  // Rounded to keep float drift out of a number that is compared against a
  // limit thousands of times.
  rec.lifetime = round2((rec.lifetime || 0) + u);
  rec.monthUnits = round2((rec.monthUnits || 0) + u);
  rec.updatedAt = new Date().toISOString();
  await writeUsage(userId, rec);
  if (idemKey) await markCharged(userId + ':' + idemKey, u);

  return {
    allowed: true,
    remaining: round2(isPro ? PRO_MONTHLY_UNITS - rec.monthUnits : FREE_GENERATIONS - rec.lifetime),
    limit: isPro ? PRO_MONTHLY_UNITS : FREE_GENERATIONS,
  };
}

async function peekUsage(userId, isPro) {
  const rec = await readUsage(userId);
  if (!rec) return { used: 0, limit: isPro ? PRO_MONTHLY_UNITS : FREE_GENERATIONS, remaining: null };
  const used = isPro ? (rec.month === monthKey() ? rec.monthUnits || 0 : 0) : rec.lifetime || 0;
  const limit = isPro ? PRO_MONTHLY_UNITS : FREE_GENERATIONS;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// ── The gate ───────────────────────────────────────────────────────────────
// Mode weights, from the per-chapter costs measured on a 114k-character
// upload. Anything absent counts as one unit.
const MODE_UNITS = {
  // quiz is 3, not 2: its batch count now scales with the length of the
  // upload, up to twelve calls on a long chapter instead of a flat five.
  tutor: 4, podcast: 4, practicetest: 3, quiz: 3, notes: 2,
  solve: 1, flashcards: 1, summary: 1, keyconcepts: 1, fitb: 1, studyplan: 1,
};

// A single chat turn, as a fraction of one generation.
const CHAT_UNITS = 0.2;

function unitsFor(modes) {
  if (!Array.isArray(modes) || !modes.length) return 1;
  return modes.reduce((sum, m) => sum + (MODE_UNITS[m] || 1), 0);
}

function payload(headers, status, obj) {
  return { statusCode: status, headers, body: JSON.stringify(obj) };
}

/**
 * The money gate. Run it after guard() and before any model call.
 *
 * `opts.units` fixes the cost, or `opts.modes` derives it from what was asked
 * for. `opts.charge: false` checks entitlement without spending quota, for
 * cheap endpoints that still should not be open to the world.
 *
 * Returns { response } to reject, or { ok, user, ent, usage } to proceed.
 */
async function requirePlan(event, headers, opts) {
  const o = opts || {};

  // Unconfigured means local development or a half-finished setup. Staying
  // open here keeps `netlify dev` usable; the moment SUPABASE_URL exists in
  // the environment, every endpoint below is closed by default.
  if (!configured()) return { ok: true, user: null, ent: null, usage: null, unconfigured: true };

  const user = await getUser(event);
  if (!user) {
    return {
      response: payload(headers, 401, {
        error: 'Please sign in to continue.',
        code: 'signin_required',
      }),
    };
  }

  const ent = entitlement(user);

  if (o.charge === false) {
    return { ok: true, user, ent, usage: null };
  }

  const units = o.units || unitsFor(o.modes);
  const usage = await consume(user.id, ent.isPro, units, o.idemKey);

  if (!usage.allowed) {
    if (usage.reason === 'pro_cap') {
      return {
        response: payload(headers, 429, {
          error: 'You have reached this month\'s fair-use limit. Email studlitofficial@gmail.com and we will lift it.',
          code: 'pro_cap', limit: usage.limit,
        }),
      };
    }
    if (usage.reason === 'storage') {
      return {
        response: payload(headers, 503, {
          error: 'We cannot check your usage right now. Please try again in a minute.',
          code: 'usage_unavailable',
        }),
      };
    }
    return {
      response: payload(headers, 402, {
        error: 'You have used all ' + usage.limit + ' of your free generations. Start your free trial to keep going.',
        code: 'upgrade_required',
        limit: usage.limit, remaining: 0,
      }),
    };
  }

  return { ok: true, user, ent, usage };
}

module.exports = {
  getUser, entitlement, requirePlan, consume, peekUsage, unitsFor,
  configured, admin, monthKey,
  FREE_GENERATIONS, PRO_MONTHLY_UNITS, TRIAL_DAYS, MODE_UNITS, CHAT_UNITS,
};
