// Opens a Stripe Checkout session for the signed-in user.
//
// Two prices, because the pricing modal offers two: $15/month and $99/year.
// The earlier version of this file read a single STRIPE_PRICE_ID, so picking
// "Annual" in the UI and paying monthly in Stripe was the only possible
// outcome. That is still accepted as the monthly fallback so an existing
// configuration keeps working.

const { guard } = require('./lib/guard');
const { getUser, entitlement, TRIAL_DAYS, configured } = require('./lib/auth');

function priceFor(plan) {
  const annual = process.env.STRIPE_PRICE_ANNUAL;
  const monthly = process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_ID;
  return plan === 'annual' ? annual : monthly;
}

const handler = async (event) => {
  const g = guard(event, { name: 'checkout', limit: 20, maxBytes: 16 * 1024 });
  if (g.response) return g.response;
  const { headers: cors, body } = g;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !configured()) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'Billing is not set up yet.', code: 'billing_unconfigured' }) };
  }

  const user = await getUser(event);
  if (!user) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in first.', code: 'signin_required' }) };
  }

  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const price = priceFor(plan);
  if (!price) {
    return {
      statusCode: 503, headers: cors,
      body: JSON.stringify({ error: 'That plan is not available yet.', code: 'price_missing' }),
    };
  }

  const ent = entitlement(user);
  if (ent.isPro) {
    // Already paying. Sending them through checkout again would open a second
    // subscription on the same account and bill them twice.
    return {
      statusCode: 409, headers: cors,
      body: JSON.stringify({ error: 'You are already subscribed.', code: 'already_subscribed' }),
    };
  }

  const stripe = require('stripe')(stripeKey);
  const siteUrl = (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '') || 'https://studlit.app';

  try {
    const params = {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      // Stripe rejects a session that sets both customer and customer_email.
      // Reusing the existing customer keeps one person's payment history on
      // one record rather than scattering it across duplicates.
      ...(ent.customerId ? { customer: ent.customerId } : { customer_email: user.email }),
      metadata: { user_id: user.id, plan },
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
      allow_promotion_codes: true,
      success_url: siteUrl + '/app.html?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: siteUrl + '/app.html?payment=cancelled',
    };

    // The trial is offered once. Without this check, cancelling and
    // resubscribing would hand out a fresh free trial every time.
    if (TRIAL_DAYS > 0 && !ent.trialStart) {
      params.subscription_data.trial_period_days = TRIAL_DAYS;
    }

    const session = await stripe.checkout.sessions.create(params);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: session.url, plan }) };
  } catch (err) {
    console.error('checkout_failed', err.message);
    return {
      statusCode: 500, headers: cors,
      body: JSON.stringify({ error: 'Could not start checkout. Please try again.' }),
    };
  }
};

module.exports = { handler };
