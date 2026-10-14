// Stripe's side of the truth, written into Supabase app_metadata.
//
// The subscription object is treated as authoritative rather than the checkout
// session: checkout tells you someone started paying, but only the
// subscription tells you they still are. Everything the gate reads — status,
// period end, pending cancellation — is kept in sync from these events.

const { createClient } = require('@supabase/supabase-js');

function admin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// app_metadata is replaced wholesale by updateUserById, so anything not read
// first is silently dropped. Merge, never overwrite.
async function patchUser(userId, patch) {
  const supa = admin();
  const { data, error } = await supa.auth.admin.getUserById(userId);
  if (error || !data || !data.user) throw new Error('user not found: ' + userId);
  const existing = data.user.app_metadata || {};
  await supa.auth.admin.updateUserById(userId, {
    app_metadata: Object.assign({}, existing, patch),
  });
}

function iso(unixSeconds) {
  return Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000).toISOString() : null;
}

// Stripe moved current_period_end onto the subscription item in its 2025 API
// versions and left it on the subscription in older ones. Reading both means
// the expiry check in lib/auth.js keeps working across an API version bump.
function periodEnd(sub) {
  if (Number.isFinite(sub.current_period_end)) return iso(sub.current_period_end);
  const item = sub.items && sub.items.data && sub.items.data[0];
  if (item && Number.isFinite(item.current_period_end)) return iso(item.current_period_end);
  return null;
}

function intervalOf(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price;
  return (price && price.recurring && price.recurring.interval) || null;
}

function userIdOf(obj) {
  return (obj.metadata && obj.metadata.user_id) || obj.client_reference_id || null;
}

// Anything that still entitles the holder to use the product.
const LIVE = ['trialing', 'active', 'past_due'];

async function syncSubscription(sub) {
  const userId = userIdOf(sub);
  if (!userId) {
    console.error('webhook_no_user_id', sub.id);
    return;
  }

  const live = LIVE.indexOf(sub.status) !== -1;
  const patch = {
    plan: live ? 'pro' : 'free',
    plan_status: sub.status,
    plan_interval: intervalOf(sub),
    current_period_end: periodEnd(sub),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null,
    stripe_subscription_id: sub.id,
  };

  // Stamped once and never cleared, so the one free trial cannot be claimed
  // again by cancelling and signing back up.
  if (sub.trial_start) patch.trial_start = iso(sub.trial_start);

  await patchUser(userId, patch);
  console.log(JSON.stringify({ event: 'plan_synced', userId, status: sub.status, plan: patch.plan }));
}

const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  const stripe = require('stripe')(stripeKey);
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  // The signature is computed over the exact bytes Stripe sent. Netlify
  // base64-encodes some request bodies, and handing the encoded string
  // straight to constructEvent fails verification on every one of those.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : (event.body || '');

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error('webhook_bad_signature', err.message);
    return { statusCode: 400, body: JSON.stringify({ error: 'Signature verification failed' }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('webhook_supabase_unconfigured', stripeEvent.type);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const userId = userIdOf(session);
        if (!userId) break;
        // Re-fetch rather than trusting the thin session object: it carries a
        // subscription id but not the status, interval or period end.
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          );
          if (!userIdOf(sub)) sub.metadata = Object.assign({}, sub.metadata, { user_id: userId });
          await syncSubscription(sub);
        } else {
          await patchUser(userId, { plan: 'pro', plan_status: 'active' });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(stripeEvent.data.object);
        break;

      case 'invoice.payment_failed':
        // No plan change here on purpose. Stripe flips the subscription to
        // past_due and then canceled on its own schedule, and those arrive as
        // subscription.updated events above. Acting on the first failed charge
        // would cut off customers Stripe is still successfully retrying.
        console.log(JSON.stringify({
          event: 'payment_failed',
          customer: stripeEvent.data.object.customer,
        }));
        break;

      default:
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry with backoff, which is what we want for a
    // transient Supabase failure — the alternative is an account that paid and
    // never got access.
    console.error('webhook_handler_failed', stripeEvent.type, err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Handler failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

module.exports = { handler };
