// What the page needs to render itself: who you are, what you are paying for,
// and how much of your allowance is left.
//
// The frontend uses this to decide what to show. It is deliberately not what
// decides what you can *do* — every paid endpoint re-checks the same facts
// server-side, because anything this endpoint returns can be edited in a
// browser console.

const { guard } = require('./lib/guard');
const {
  getUser, entitlement, peekUsage, configured,
  FREE_GENERATIONS, TRIAL_DAYS,
} = require('./lib/auth');

const handler = async (event) => {
  const g = guard(event, { name: 'me', limit: 120, maxBytes: 8 * 1024 });
  if (g.response) return g.response;
  const { headers: cors } = g;

  if (!configured()) {
    // Local development with no Supabase project wired up: report the open
    // state honestly rather than pretending there is a signed-out user.
    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({ signedIn: false, unconfigured: true, freeLimit: FREE_GENERATIONS, trialDays: TRIAL_DAYS }),
    };
  }

  const user = await getUser(event);
  if (!user) {
    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({ signedIn: false, freeLimit: FREE_GENERATIONS, trialDays: TRIAL_DAYS }),
    };
  }

  const ent = entitlement(user);
  const usage = await peekUsage(user.id, ent.isPro);

  return {
    statusCode: 200, headers: cors,
    body: JSON.stringify({
      signedIn: true,
      email: user.email,
      plan: ent.plan,
      status: ent.status,
      isPro: ent.isPro,
      interval: ent.interval,
      currentPeriodEnd: ent.currentPeriodEnd,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      hasBilling: Boolean(ent.customerId),
      usage,
      freeLimit: FREE_GENERATIONS,
      trialDays: TRIAL_DAYS,
    }),
  };
};

module.exports = { handler };
