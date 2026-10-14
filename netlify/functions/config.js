// Public front-end configuration, served at runtime.
//
// The alternative was hard-coding the Supabase project URL and anon key into
// app.html. Both are public by design — the anon key is meant to ship to
// browsers and is useless without Row Level Security permitting the action —
// but baking them into a committed file means a different build for every
// environment and a code change to rotate them. Reading them from the Netlify
// environment keeps one file working across production, deploy previews and
// local development.
//
// Nothing secret is ever returned here. The service role key, which can read
// and write any row and edit any user's plan, is only ever used server-side.

const { corsHeaders, originAllowed } = require('./lib/guard');

const handler = async (event) => {
  const org = originAllowed(event);
  const headers = Object.assign({}, corsHeaders(org.ok ? org.origin : '*'), {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    // Short cache: long enough to stay off the critical path on repeat loads,
    // short enough that rotating a key takes effect within a minute.
    'Cache-Control': 'public, max-age=60',
  });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      supabaseUrl,
      supabaseAnonKey: anonKey,
      // Lets the page say "sign in" only when signing in is actually possible.
      authEnabled: Boolean(supabaseUrl && anonKey),
      billingEnabled: Boolean(
        process.env.STRIPE_SECRET_KEY &&
        (process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRICE_ANNUAL)
      ),
    }),
  };
};

module.exports = { handler };
