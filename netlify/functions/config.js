// Public browser config. The Supabase URL and anon key are designed to be
// public — row-level security and the server-only service key are what protect
// data — so they're served from env vars rather than hardcoded in app.html.
const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      // Plausible site domain (e.g. studlit.app). Empty = no analytics loaded.
      plausibleDomain: process.env.PLAUSIBLE_DOMAIN || '',
      billing: {
        monthly: !!(process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_ID),
        annual: !!process.env.STRIPE_PRICE_ANNUAL,
      },
    }),
  };
};

module.exports = { handler };
