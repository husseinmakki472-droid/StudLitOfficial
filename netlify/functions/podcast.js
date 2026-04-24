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
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 1000, temperature: 0.75,
messages: [
{ role: 'system', content: 'Write a short engaging educational podcast script 400-600 words. Style: conversational, friendly, brief intro, 3-4 key points, real-world analogy, quick recap. Return ONLY the spoken script text, no labels or stage directions.' },
{ role: 'user', content: 'Topic: ' + topic + (contextStr ? '\n\nLesson context:\n' + contextStr.slice(0, 3000) : '') }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI error' }) };
}
const data = await response.json();
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ script: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '' }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
