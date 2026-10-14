// Opens the Stripe customer portal so subscribers can switch plans, update
// their card, see invoices, or cancel without emailing anyone.
// Turn the portal on in Stripe: Settings → Billing → Customer portal.

const { guard } = require('./lib/guard');
const { getSignedInUser } = require('./lib/auth');
const { stripe, siteUrl } = require('./lib/billing');

const handler = async (event) => {
  const g = guard(event, { name: 'portal', limit: 20, maxBytes: 4 * 1024 });
  if (g.response) return g.response;
  const { headers } = g;
  const reply = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  const who = await getSignedInUser(event);
  if (!who.user) return reply(who.status, { error: who.error, code: who.code });

  const customer = (who.user.app_metadata || {}).stripe_customer_id;
  if (!customer) return reply(404, { error: 'No subscription found for this account.', code: 'no_subscription' });

  const s = stripe();
  if (!s) return reply(503, { error: 'Payments are not set up yet.', code: 'billing_unconfigured' });

  try {
    const session = await s.billingPortal.sessions.create({ customer, return_url: siteUrl() + '/app.html' });
    return reply(200, { url: session.url });
  } catch (err) {
    console.error(JSON.stringify({ event: 'portal_failed', user: who.user.id, error: err.message }));
    return reply(500, { error: 'Could not open billing. Please try again.' });
  }
};

module.exports = { handler };
