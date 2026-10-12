// Stripe → Supabase: keeps each account's plan in step with its subscription.
//
// Subscribe these events in Stripe (Developers → Webhooks → this endpoint):
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Access follows the subscription's status (see planForStatus in lib/billing):
// trialing, active and past_due are Pro; anything else is free. A failed card
// therefore doesn't cut access the same minute — Stripe retries first, and the
// subscription.updated event that follows its final attempt does.
//
// If Supabase can't be updated this returns 500, so Stripe retries the event
// instead of a paying customer silently staying locked out.

const { stripe, planForStatus, updateAppMetadata } = require('./lib/billing');

function rawBody(event) {
  // Signature checks need the exact bytes Stripe sent.
  return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : (event.body || '');
}

function userIdFrom(obj) {
  return (obj && (obj.client_reference_id || (obj.metadata && obj.metadata.user_id))) || null;
}

async function applySubscription(sub, userIdHint) {
  const userId = userIdHint || userIdFrom(sub);
  if (!userId) {
    console.warn(JSON.stringify({ event: 'webhook_no_user', subscription: sub.id }));
    return;
  }
  const item = sub.items && sub.items.data && sub.items.data[0];
  const interval = item && item.price && item.price.recurring && item.price.recurring.interval;
  const fields = {
    plan: planForStatus(sub.status),
    sub_status: sub.status,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id),
    stripe_subscription_id: sub.id,
    billing_interval: interval || null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
  // Once any subscription has existed, a later checkout gets no second trial.
  fields.had_trial = true;
  await updateAppMetadata(userId, fields);
  console.log(JSON.stringify({ event: 'plan_updated', user: userId, plan: fields.plan, status: sub.status }));
}

const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const s = stripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !webhookSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe is not configured' }) };
  }

  const h = event.headers || {};
  const sig = h['stripe-signature'] || h['Stripe-Signature'];
  let stripeEvent;
  try {
    stripeEvent = s.webhooks.constructEvent(rawBody(event), sig, webhookSecret);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Webhook signature verification failed' }) };
  }

  try {
    const obj = stripeEvent.data.object;
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription' || !obj.subscription) break;
        const sub = await s.subscriptions.retrieve(obj.subscription);
        await applySubscription(sub, userIdFrom(obj));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(obj);
        break;
      case 'invoice.payment_failed': {
        // Re-read the subscription so the plan reflects Stripe's current status.
        // Newer Stripe API versions moved the field under parent.subscription_details.
        const ref = obj.subscription ||
          (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
        const subId = typeof ref === 'string' ? ref : (ref && ref.id);
        if (subId) await applySubscription(await s.subscriptions.retrieve(subId));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'webhook_failed', type: stripeEvent.type, id: stripeEvent.id, error: err.message }));
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not update the account' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

module.exports = { handler };
