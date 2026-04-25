const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { message, history = [], context = '' } = body;
if (!message || !message.trim()) {
return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
}
const systemText = 'You are StudLit AI, a friendly expert study assistant.' + (context ? '\n\nStudy context:\n' + context : '');
const messages = [
...history.slice(-10).map(function(msg) { return { role: msg.role, content: msg.content }; }),
{ role: 'user', content: message }
];
try {
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, temperature: 0.7, system: systemText, messages: messages })
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'Claude API error' }) };
}
const data = await response.json();
const reply = (data.content && data.content[0] && data.content[0].text) || 'No response.';
return {
statusCode: 200,
headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
body: JSON.stringify({ reply: reply })
};
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
