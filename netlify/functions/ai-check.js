function escHtml(s) {
return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
const systemMsg = 'Analyze this text for AI-generated patterns. Return ONLY valid JSON no markdown:\n{"score":<0-100>,"verdict":"<Likely AI-Generated|Mixed Partially AI|Mostly Human>","verdictSub":"<one sentence>","aiPhrases":["phrase1"],"variety":<0-100>,"passive":<count>,"flaggedPhrases":["exact phrase"],"passivePhrases":["exact phrase"]}';
try {
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001', max_tokens: 1000, temperature: 0.3,
system: systemMsg,
messages: [{ role: 'user', content: 'Analyze:\n\n' + text }]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'Claude API error' }) };
}
const data = await response.json();
const raw = (data.content && data.content[0] && data.content[0].text) || '';
let parsed;
try { parsed = JSON.parse(raw.replace(/`json|`/g, '').trim()); }
catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse response' }) }; }
let flaggedHtml = escHtml(text);
const flagged = parsed.flaggedPhrases || [];
for (let i = 0; i < flagged.length; i++) {
const phrase = flagged[i];
if (!phrase) continue;
const esc = escHtml(phrase);
flaggedHtml = flaggedHtml.replace(new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<span class="ai-flag-span">' + esc + '</span>');
}
const passive = parsed.passivePhrases || [];
for (let j = 0; j < passive.length; j++) {
const phrase = passive[j];
if (!phrase) continue;
const esc = escHtml(phrase);
flaggedHtml = flaggedHtml.replace(new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<span class="ai-flag-span-med">' + esc + '</span>');
}
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ score: parsed.score, verdict: parsed.verdict, verdictSub: parsed.verdictSub, aiPhrases: parsed.aiPhrases || [], variety: parsed.variety, passive: parsed.passive, flaggedHtml: flaggedHtml }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
