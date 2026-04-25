const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { topic, modes, files, urls, options } = body;
const modesArr = modes || [];
const filesArr = files || [];
const urlsArr = urls || [];
const opts = options || {};
if (!topic && !filesArr.length) {
return { statusCode: 400, body: JSON.stringify({ error: 'topic or files required' }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
let fileCtx = '';
if (filesArr.length) {
fileCtx += '\n\n--- UPLOADED MATERIALS ---\n';
for (let i = 0; i < filesArr.length; i++) {
const f = filesArr[i];
if (f.textContent) {
fileCtx += '\n[Document: ' + f.name + ']\n' + f.textContent.slice(0, 12000) + '\n';
} else {
fileCtx += '\n[File: ' + f.name + ' (type: ' + (f.type || 'unknown') + ') — no text content extracted]\n';
}
}
}
if (urlsArr.length) {
fileCtx += '\n\n--- URL SOURCES ---\n';
for (let i = 0; i < urlsArr.length; i++) {
const url = urlsArr[i];
try {
const urlRes = await fetch(url, {
headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudLitBot/1.0)' },
redirect: 'follow'
});
if (urlRes.ok) {
const html = await urlRes.text();
const text = html
.replace(/<script[\s\S]*?<\/script>/gi, '')
.replace(/<style[\s\S]*?<\/style>/gi, '')
.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
.replace(/<nav[\s\S]*?<\/nav>/gi, '')
.replace(/<footer[\s\S]*?<\/footer>/gi, '')
.replace(/<header[\s\S]*?<\/header>/gi, '')
.replace(/<!--[\s\S]*?-->/g, '')
.replace(/<[^>]+>/g, ' ')
.replace(/&nbsp;/g, ' ')
.replace(/&amp;/g, '&')
.replace(/&lt;/g, '<')
.replace(/&gt;/g, '>')
.replace(/&quot;/g, '"')
.replace(/\s{2,}/g, ' ')
.trim()
.slice(0, 10000);
fileCtx += '\n[URL: ' + url + ']\n' + text + '\n';
} else {
fileCtx += '\n[URL: ' + url + ' — HTTP ' + urlRes.status + ']\n';
}
} catch (e) {
fileCtx += '\n[URL: ' + url + ' — could not be fetched: ' + e.message + ']\n';
}
}
}
const modeList = modesArr.length ? modesArr.join(', ') : 'solve';
const optionHints = [];
if (opts.fcCount) optionHints.push('Generate exactly ' + opts.fcCount + ' flashcards');
if (opts.quizCount) optionHints.push('Generate exactly ' + opts.quizCount + ' quiz questions');
if (opts.ptCount) optionHints.push('Generate exactly ' + opts.ptCount + ' practice test questions');
if (opts.fitbCount) optionHints.push('Generate exactly ' + opts.fitbCount + ' fill-in-the-blank sentences');
if (opts.difficulty && opts.difficulty !== 'mixed') optionHints.push('All items should be ' + opts.difficulty + ' difficulty');
const optionInstructions = optionHints.length ? '\n\nIMPORTANT QUANTITY/DIFFICULTY REQUIREMENTS:\n' + optionHints.map(h => '- ' + h).join('\n') : '';
const systemPrompt = 'You are StudLit AI, an expert study material generator. Analyze the provided content thoroughly and create comprehensive, accurate study materials that cover ALL key concepts. Return ONLY valid JSON, no markdown, no backticks. Generate as many items as needed to fully cover the lesson unless a specific count is requested. Never use a fixed number limit unless told to.';
const modeMap = {
flashcards: '"flashcards":{"cards":[{"front":"term or question","back":"definition or answer","difficulty":"Easy|Medium|Hard"}]}',
quiz: '"quiz":{"questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct","difficulty":"Easy|Medium|Hard"}]}',
fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"],"difficulty":"Easy|Medium|Hard"}]}',
summary: '"summary":{"overview":"3-5 sentence overview","keyPoints":["point 1","point 2"],"mustRemember":"most important takeaway"}',
notes: '"notes":{"sections":[{"heading":"section title","content":"detailed notes","bullets":["bullet 1"]}]}',
tutor: '"tutor":{"messages":[{"text":"explanation","type":"explain"}]}',
practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"...","sampleAnswer":"...","difficulty":"Easy|Medium|Hard"}]}]}',
keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"full definition","importance":"why it matters"}]}',
studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Introduction","tasks":["task 1"],"duration":"45 min"}]}',
solve: '"solve":{"quickAnswer":"direct answer","stepByStep":[{"step":1,"title":"step title","content":"explanation"}],"keyInsight":"most important thing","examples":["example 1"]}'
};
let modeStructures = '';
for (let i = 0; i < modesArr.length; i++) {
const m = modesArr[i];
modeStructures += (modeMap[m] || ('"' + m + '":{"content":"study material"}'));
if (i < modesArr.length - 1) modeStructures += ',\n    ';
}
const userPrompt = 'Topic: ' + (topic || 'the uploaded content') + fileCtx + optionInstructions + '\n\nGenerate these study modes: ' + modeList + '\n\nReturn this JSON:\n{\n  "topic": "specific topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 16000, temperature: 0.4,
response_format: { type: 'json_object' },
messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI error' }) };
}
const data = await response.json();
const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
if (!content) return { statusCode: 500, body: JSON.stringify({ error: 'No content from OpenAI' }) };
let parsed;
try { parsed = JSON.parse(content); }
catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'Invalid JSON from AI' }) }; }
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
