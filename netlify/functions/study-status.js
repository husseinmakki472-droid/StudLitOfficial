// Polling endpoint — frontend calls this every 3s to check if study-background.js has finished.
const { createClient } = require('@supabase/supabase-js');

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Storage not configured' }) };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.storage.from('study-jobs').download(requestId + '.json');

    if (error || !data) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: 'pending', progress: 'Waiting to start…' }) };
    }

    const text = await data.text();
    const result = JSON.parse(text);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
