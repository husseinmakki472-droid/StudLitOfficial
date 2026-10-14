// Stripe's hosted billing portal: update a card, see invoices, cancel.
//
// Not optional. The pricing modal promises "Cancel anytime", and a promise to
// cancel that has no button behind it is the kind of thing that generates
// chargebacks. This hands the whole flow to Stripe, which also means no card
// details ever touch this site.

const { guard } = require('./lib/guard');
const { getUser, entitlement, configured } = require('./lib/auth');

const handler = async (event) => {
  const g = guard(event, { name: 'portal', limit: 20, maxBytes: 8 * 1024 });
  if (g.response) return g.response;
  const { headers: cors } = g;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !configured()) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'Billing is not set up yet.' }) };
  }

  const user = await getUser(event);
  if (!user) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Please sign in first.', code: 'signin_required' }) };
  }

  const ent = entitlement(user);
  if (!ent.customerId) {
    return {
      statusCode: 400, headers: cors,
      body: JSON.stringify({ error: 'There is no billing history on this account yet.', code: 'no_customer' }),
    };
  }

  const stripe = require('stripe')(stripeKey);
  const siteUrl = (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '') || 'https://studlit.app';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: ent.customerId,
      return_url: siteUrl + '/app.html',
    });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('portal_failed', err.message);
    return {
      statusCode: 500, headers: cors,
      body: JSON.stringify({ error: 'Could not open the billing portal. Please try again.' }),
    };
  }
};

module.exports = { handler };
