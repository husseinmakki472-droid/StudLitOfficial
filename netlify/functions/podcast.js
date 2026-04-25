const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { topic, files, urls } = body;
if (!topic && !(files && files.length)) {
return { statusCode: 400, body: JSON.stringify({ error: 'topic or files required' }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
let materialCtx = '';
if (files && files.length) {
materialCtx += '\n\n--- SOURCE MATERIALS ---\n';
for (let i = 0; i < files.length; i++) {
const f = files[i];
if (f.textContent) materialCtx += '\n[Document: ' + f.name + ']\n' + f.textContent.slice(0, 10000) + '\n';
else materialCtx += '\n[File: ' + f.name + ' (' + (f.type || 'unknown') + ')]\n';
}
}
if (urls && urls.length) {
for (let i = 0; i < urls.length; i++) {
try {
const urlRes = await fetch(urls[i], { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (urlRes.ok) {
const html = await urlRes.text();
const text = html
.replace(/<script[\s\S]*?<\/script>/gi, '')
.replace(/<style[\s\S]*?<\/style>/gi, '')
.replace(/<[^>]+>/g, ' ')
.replace(/\s{2,}/g, ' ')
.trim()
.slice(0, 8000);
materialCtx += '\n\n[URL: ' + urls[i] + ']\n' + text + '\n';
}
} catch (e) { materialCtx += '\n[URL ' + urls[i] + ' could not be fetched]\n'; }
}
}
const hasMaterial = materialCtx.length > 0;
const systemPrompt = hasMaterial
? 'You are StudLit AI, an expert educational podcast host. The user has provided source materials. Your job is to create a full, comprehensive educational podcast script that:\n1. Summarizes and teaches ALL key concepts from the provided materials\n2. Uses a warm, engaging conversational tone (like a knowledgeable friend explaining)\n3. Covers every important topic, definition, example, and takeaway from the materials\n4. Uses natural transitions between topics\n5. Ends with a clear recap of the most important points\n\nWrite a COMPLETE script — as long as needed to cover the material thoroughly (aim for 800-1500 words). Return ONLY the spoken script text, no labels, no stage directions, no markdown.'
: 'You are StudLit AI, an expert educational podcast host. Create a comprehensive educational podcast script about the given topic. Use a warm, engaging conversational tone. Cover key concepts, definitions, real-world examples, and important takeaways. Write a complete, thorough script (aim for 800-1200 words). Return ONLY the spoken script text, no labels, no stage directions, no markdown.';
const userContent = 'Topic: ' + (topic || 'the provided lesson') + materialCtx;
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 4000, temperature: 0.7,
messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI error' }) };
}
const data = await response.json();
const script = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ script }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
