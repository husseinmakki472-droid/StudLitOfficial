const handler = async (event) => {
if (event.httpMethod !== ‘POST’) {
return { statusCode: 405, body: JSON.stringify({ error: ‘Method not allowed’ }) };
}
let body;
try { body = JSON.parse(event.body || ‘{}’); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: ‘Invalid JSON’ }) }; }
const { topic, modes = [], files = [], urls = [] } = body;
if (!topic && !files.length) {
return { statusCode: 400, body: JSON.stringify({ error: ‘topic or files required’ }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: ‘OPENAI_API_KEY not set’ }) };
}

let fileCtx = ‘’;
if (files.length) {
fileCtx += ‘\n\nUploaded materials:\n’;
files.forEach(function(f) {
if (f.textContent) fileCtx += ‘\n[File: ’ + f.name + ‘]\n’ + f.textContent.slice(0, 12000) + ‘\n’;
else fileCtx += ‘\n[File: ’ + f.name + ’ (’ + f.type + ‘)]\n’;
});
}
if (urls.length) fileCtx += ‘\n\nURLs:\n’ + urls.map(function(u) { return ‘- ’ + u; }).join(’\n’);

const modeList = modes.length ? modes.join(’, ’) : ‘solve’;

const systemPrompt = ‘You are StudLit AI, an expert study material generator.\n\nCRITICAL RULES:\n- Return ONLY valid JSON, no markdown, no backticks, no extra text\n- Cover the ENTIRE content provided — do not stop early\n- Generate as many items as needed to fully cover the lesson\n- Never limit yourself to a fixed number — completeness is the goal\n- Make all content specific to the actual topic/material provided, never generic\n\nFor flashcards: generate one card per distinct concept, term, definition, formula, or fact.\nFor quiz: generate one question per testable concept.\nFor fitb: generate one sentence per key fact or definition.\nFor keyconcepts: extract every important term and concept.’;

const modeInstructions = {
flashcards: ‘“flashcards”: { “cards”: [ { “front”: “term or question”, “back”: “definition or answer” } ] }’,
quiz: ‘“quiz”: { “questions”: [ { “question”: “question text”, “options”: [“A) option”, “B) option”, “C) option”, “D) option”], “correct”: 0, “explanation”: “why correct” } ] }’,
fitb: ‘“fitb”: { “sentences”: [ { “text”: “The ___ does ___.”, “blanks”: [“term1”, “term2”] } ] }’,
summary: ‘“summary”: { “overview”: “3-5 sentence overview”, “keyPoints”: [“point 1”, “point 2”], “mustRemember”: “most important takeaway” }’,
notes: ‘“notes”: { “sections”: [ { “heading”: “section title”, “content”: “detailed notes”, “bullets”: [“bullet 1”] } ] }’,
tutor: ‘“tutor”: { “messages”: [ { “text”: “explanation”, “type”: “explain” } ] }’,
practicetest: ‘“practicetest”: { “sections”: [ { “type”: “shortAnswer”, “questions”: [ { “question”: “…”, “sampleAnswer”: “…” } ] } ] }’,
keyconcepts: ‘“keyconcepts”: { “concepts”: [ { “term”: “term”, “definition”: “full definition”, “importance”: “why it matters” } ] }’,
studyplan: ‘“studyplan”: { “totalDays”: 7, “steps”: [ { “day”: 1, “title”: “Introduction”, “tasks”: [“task 1”], “duration”: “45 min” } ] }’,
solve: ‘“solve”: { “quickAnswer”: “direct answer”, “stepByStep”: [ { “step”: 1, “title”: “step title”, “content”: “explanation” } ], “keyInsight”: “most important thing”, “examples”: [“example 1”] }’
};

const modeStructures = modes.map(function(m) { return modeInstructions[m] || (’”’ + m + ‘”: { “content”: “study material” }’); }).join(’,\n    ’);

const userPrompt = ’Topic: ’ + (topic || ‘the uploaded content’) + fileCtx + ’\n\nGenerate the following study modes: ’ + modeList + ’\n\nReturn this exact JSON structure:\n{\n  “topic”: “specific topic name”,\n  “results”: {\n    ’ + modeStructures + ‘\n  }\n}’;

try {
const response = await fetch(‘https://api.openai.com/v1/chat/completions’, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’, ‘Authorization’: ’Bearer ’ + apiKey },
body: JSON.stringify({
model: ‘gpt-4o-mini’,
max_tokens: 16000,
temperature: 0.4,
response_format: { type: ‘json_object’ },
messages: [
{ role: ‘system’, content: systemPrompt },
{ role: ‘user’, content: userPrompt }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || ‘OpenAI error’ }) };
}
const data = await response.json();
const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
if (!content) return { statusCode: 500, body: JSON.stringify({ error: ‘No content from OpenAI’ }) };
let parsed;
try { parsed = JSON.parse(content); }
catch (e) { return { statusCode: 500, body: JSON.stringify({ error: ‘Invalid JSON from AI’, raw: content.slice(0, 500) }) }; }
return {
statusCode: 200,
headers: { ‘Content-Type’: ‘application/json’, ‘Access-Control-Allow-Origin’: ‘*’ },
body: JSON.stringify(parsed)
};
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
