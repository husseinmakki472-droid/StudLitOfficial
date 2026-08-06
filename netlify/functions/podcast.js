const { guard } = require('./lib/guard');

const handler = async (event) => {
const g = guard(event, { name: 'podcast', limit: 15, maxBytes: 512 * 1024 });
if (g.response) return g.response;
const { headers: cors, body } = g;
const { topic, context } = body;
const contextStr = context || '';
if (!topic) {
return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'topic is required' }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
const userText = (contextStr ? contextStr.slice(0, 3000) + '\n\n' : '') + 'Topic: ' + topic;
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 1000, temperature: 0.75,
messages: [
{ role: 'system', content: 'Write a short engaging educational podcast script 400-600 words. Style: conversational, friendly, brief intro, 3-4 key points, real-world analogy, quick recap. Return ONLY the spoken script text, no labels or stage directions.' },
{ role: 'user', content: userText }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, headers: cors, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
}
const data = await response.json();
return { statusCode: 200, headers: cors, body: JSON.stringify({ script: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '' }) };
} catch (err) {
return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
