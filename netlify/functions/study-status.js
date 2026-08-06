// Polling endpoint — frontend calls this every 3s to check if study-background.js has finished.
const { getStore } = require('@netlify/blobs');

const handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
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
