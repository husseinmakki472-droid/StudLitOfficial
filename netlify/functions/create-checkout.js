// Starts a Stripe Checkout session for StudLit Pro.
//
// Body: { plan: 'monthly' | 'annual' }. The card is collected up front and the
// subscription starts with a 2-day trial (first-time subscribers only), which is
// what the Terms promise. The webhook flips the account to Pro once Stripe
// confirms; this function never grants access itself.

const { guard } = require('./lib/guard');
const { getSignedInUser } = require('./lib/auth');
const { stripe, priceFor, siteUrl } = require('./lib/billing');

const TRIAL_DAYS = 2;

const handler = async (event) => {
  const g = guard(event, { name: 'checkout', limit: 20, maxBytes: 4 * 1024 });
  if (g.response) return g.response;
  const { headers, body } = g;
  const reply = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  const who = await getSignedInUser(event);
  if (!who.user) return reply(who.status, { error: who.error, code: who.code });
  const user = who.user;

  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const price = priceFor(plan);
  const s = stripe();
  if (!s || !price) {
    return reply(503, { error: 'Payments are not set up yet (' + plan + ' price missing).', code: 'billing_unconfigured' });
  }

  const meta = user.app_metadata || {};

  try {
    // Already subscribed: send them to manage the subscription instead of
    // opening a second one.
    if (meta.plan === 'pro' && meta.stripe_customer_id) {
      const portal = await s.billingPortal.sessions.create({
        customer: meta.stripe_customer_id,
        return_url: siteUrl() + '/app.html',
      });
      return reply(200, { url: portal.url, portal: true });
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      allow_promotion_codes: true,
      success_url: siteUrl() + '/app.html?payment=success',
      cancel_url: siteUrl() + '/app.html?payment=cancelled',
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
    };
    // One trial per account. had_trial is set by the webhook the first time a
    // subscription starts, so cancelling and resubscribing doesn't restart it.
    if (!meta.had_trial) params.subscription_data.trial_period_days = TRIAL_DAYS;
    // Reuse the Stripe customer for returning subscribers so their history stays in one place.
    if (meta.stripe_customer_id) params.customer = meta.stripe_customer_id;
    else params.customer_email = user.email;

    const session = await s.checkout.sessions.create(params);
    return reply(200, { url: session.url });
  } catch (err) {
    console.error(JSON.stringify({ event: 'checkout_failed', user: user.id, error: err.message }));
    return reply(500, { error: 'Could not start checkout. Please try again.' });
  }
};

module.exports = { handler };
