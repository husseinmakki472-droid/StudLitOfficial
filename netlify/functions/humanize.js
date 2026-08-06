const { guard } = require('./lib/guard');

const handler = async (event) => {
const g = guard(event, { name: 'humanize', limit: 25, maxBytes: 512 * 1024 });
if (g.response) return g.response;
const { headers: cors, body } = g;
const { text } = body;
if (!text || !text.trim()) {
return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'text is required' }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 2000, temperature: 0.85,
messages: [
{ role: 'system', content: 'Rewrite the text to sound natural and human. Use contractions, vary sentence length, remove AI filler phrases, use active voice. Keep the same meaning. Return ONLY the rewritten text.' },
{ role: 'user', content: text }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, headers: cors, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
}
const data = await response.json();
return { statusCode: 200, headers: cors, body: JSON.stringify({ result: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '' }) };
} catch (err) {
return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
