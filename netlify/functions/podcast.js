function safeBlocks(blocks) {
return blocks.filter(function(b) { return b.type !== 'text' || (b.text && b.text.trim()); });
}

const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { topic, context } = body;
const contextStr = context || '';
if (!topic) {
return { statusCode: 400, body: JSON.stringify({ error: 'topic is required' }) };
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
}
const userContent = safeBlocks([
{ type: 'text', text: contextStr.slice(0, 3000), cache_control: { type: 'ephemeral' } },
{ type: 'text', text: 'Topic: ' + topic }
]);
try {
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001', max_tokens: 1000, temperature: 0.75,
system: 'Write a short engaging educational podcast script 400-600 words. Style: conversational, friendly, brief intro, 3-4 key points, real-world analogy, quick recap. Return ONLY the spoken script text, no labels or stage directions.',
messages: [{ role: 'user', content: userContent }]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'Claude API error' }) };
}
const data = await response.json();
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ script: (data.content && data.content[0] && data.content[0].text) || '' }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
