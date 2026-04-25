const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { text } = body;
if (!text || !text.trim()) {
return { statusCode: 400, body: JSON.stringify({ error: 'text is required' }) };
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
}
try {
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001', max_tokens: 2000, temperature: 0.85,
system: 'Rewrite the text to sound natural and human. Use contractions, vary sentence length, remove AI filler phrases, use active voice. Keep the same meaning. Return ONLY the rewritten text.',
messages: [{ role: 'user', content: text }]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'Claude API error' }) };
}
const data = await response.json();
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ result: (data.content && data.content[0] && data.content[0].text) || '' }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
