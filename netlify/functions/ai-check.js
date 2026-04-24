function escHtml(s) {
return String(s).replace(/&/g,’&’).replace(/</g,’<’).replace(/>/g,’>’).replace(/”/g,’"’);
}

const handler = async (event) => {
if (event.httpMethod !== ‘POST’) {
return { statusCode: 405, body: JSON.stringify({ error: ‘Method not allowed’ }) };
}
let body;
try { body = JSON.parse(event.body || ‘{}’); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: ‘Invalid JSON’ }) }; }
const { text } = body;
if (!text || !text.trim()) {
return { statusCode: 400, body: JSON.stringify({ error: ‘text is required’ }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: ‘OPENAI_API_KEY not set’ }) };
}
try {
const response = await fetch(‘https://api.openai.com/v1/chat/completions’, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, ‘Authorization’: ’Bearer ’ + apiKey },
body: JSON.stringify({
model: ‘gpt-4o-mini’,
max_tokens: 1000,
temperature: 0.3,
messages: [
{ role: ‘system’, content: ‘Analyze this text for AI-generated patterns. Return ONLY valid JSON no markdown:\n{\n  “score”: <0-100>,\n  “verdict”: “<Likely AI-Generated | Mixed — Partially AI | Mostly Human>”,\n  “verdictSub”: “<one sentence>”,\n  “aiPhrases”: [“phrase1”],\n  “variety”: <0-100>,\n  “passive”: <count>,\n  “flaggedPhrases”: [“exact phrase”],\n  “passivePhrases”: [“exact phrase”]\n}’ },
{ role: ‘user’, content: ‘Analyze:\n\n’ + text }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || ‘OpenAI error’ }) };
}
const data = await response.json();
const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ‘’;
let parsed;
try { parsed = JSON.parse(raw.replace(/`json|`/g, ‘’).trim()); }
catch (e) { return { statusCode: 500, body: JSON.stringify({ error: ‘Failed to parse response’ }) }; }
let flaggedHtml = escHtml(text);
(parsed.flaggedPhrases || []).forEach(function(phrase) {
if (!phrase) return;
const esc = escHtml(phrase);
flaggedHtml = flaggedHtml.replace(new RegExp(esc.replace(/[.*+?^${}()|[]\]/g, ‘\$&’), ‘gi’), ‘<span class="ai-flag-span">’ + esc + ‘</span>’);
});
(parsed.passivePhrases || []).forEach(function(phrase) {
if (!phrase) return;
const esc = escHtml(phrase);
flaggedHtml = flaggedHtml.replace(new RegExp(esc.replace(/[.*+?^${}()|[]\]/g, ‘\$&’), ‘gi’), ‘<span class="ai-flag-span-med">’ + esc + ‘</span>’);
});
return {
statusCode: 200,
headers: { ‘Content-Type’: ‘application/json’, ‘Access-Control-Allow-Origin’: ‘*’ },
body: JSON.stringify({ score: parsed.score, verdict: parsed.verdict, verdictSub: parsed.verdictSub, aiPhrases: parsed.aiPhrases || [], variety: parsed.variety, passive: parsed.passive, flaggedHtml: flaggedHtml })
};
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
