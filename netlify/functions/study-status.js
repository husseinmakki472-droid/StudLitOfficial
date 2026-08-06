// Polling endpoint — frontend calls this every 3s to check if study-background.js has finished.
const { getStore } = require('@netlify/blobs');
const { originAllowed, corsHeaders: buildCors } = require('./lib/guard');

const handler = async (event) => {
  // Origin check only, deliberately no rate limit: a single 14-minute job polls
  // this a few hundred times, so a per-IP budget here would break generation.
  // There's no model spend behind this endpoint — it reads one blob by an
  // unguessable request id.
  const org = originAllowed(event);
  const corsHeaders = buildCors(org.ok ? org.origin : '');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  // Method before origin, matching guard(). Reversed, a plain browser GET —
  // which carries whatever Referer the user clicked from — answered "not
  // allowed from this origin" and looked like a misconfiguration when it was
  // only ever a wrong verb.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!org.ok) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Requests are not allowed from this origin.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { requestId } = body;
  if (!requestId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'requestId required' }) };
  }

  try {
    // Only pass siteID/token when BOTH are set — passing them as undefined puts
    // @netlify/blobs into manual mode with no credentials instead of letting it
    // auto-configure from the Netlify Functions runtime.
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_TOKEN;
    const storeOpts = { name: 'study-results' };
    if (siteID && token) { storeOpts.siteID = siteID; storeOpts.token = token; }
    const store = getStore(storeOpts);
    const result = await store.get(requestId, { type: 'json' });

    if (!result) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: 'pending', progress: 'Waiting to start…' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
