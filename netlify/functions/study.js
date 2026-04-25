const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { topic, modes, files, urls } = body;
const modesArr = modes || [];
const filesArr = files || [];
const urlsArr = urls || [];
if (!topic && !filesArr.length) {
return { statusCode: 400, body: JSON.stringify({ error: 'topic or files required' }) };
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
}
let fileCtx = '';
if (filesArr.length) {
fileCtx += '\n\nUploaded materials:\n';
for (let i = 0; i < filesArr.length; i++) {
const f = filesArr[i];
if (f.textContent) fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 80000) + '\n';
else if (!f.imageData) fileCtx += '\n[File: ' + f.name + ' (' + f.type + ')]\n';
}
}
if (urlsArr.length) {
fileCtx += '\n\nURLs:\n';
for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
}
const modeList = modesArr.length ? modesArr.join(', ') : 'solve';
const systemPrompt = 'You are StudLit AI, an expert study material generator. Return ONLY valid JSON, no markdown, no backticks. Cover the ENTIRE content thoroughly — do not skip, summarize, or truncate any part of the lesson. Generate as many sections, cards, questions, and paragraphs as needed to fully cover every concept. Never use a fixed number limit. When given uploaded material, teach ALL of it in depth.';
const modeMap = {
flashcards: '"flashcards":{"cards":[{"front":"term or question","back":"definition or answer"}]}',
quiz: '"quiz":{"questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct"}]}',
fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"]}]}',
summary: '"summary":{"overview":"3-5 sentence overview","keyPoints":["point 1","point 2"],"mustRemember":"most important takeaway"}',
notes: '"notes":{"sections":[{"heading":"section title","content":"detailed notes","bullets":["bullet 1"]}]}',
tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"1. Section Title","paragraphs":["Thorough paragraph explaining this concept in depth with examples. Wrap key terms in <strong>strong tags</strong>. Write as many sentences as needed to fully explain — do not summarize, elaborate completely.","Continue with more detail, sub-concepts, real-world applications, and any nuances the student needs to know.","Add more paragraphs as needed until this section is completely covered."],"keyTakeaway":"One-sentence key insight for this section.","thinkAboutIt":"A reflective question to deepen understanding?"}]}',
practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"...","sampleAnswer":"..."}]}]}',
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
const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate these study modes: ' + modeList + '\n\nReturn this JSON:\n{\n  "topic": "specific topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';
const imageBlocks = filesArr
.filter(function(f) { return f.imageData && f.mimeType; })
.map(function(f) { return { type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }; });
const userContent = [
...imageBlocks,
...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []),
{ type: 'text', text: queryText }
];
try {
const response = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: 16000, temperature: 0.4,
messages: [
{ role: 'system', content: systemPrompt },
{ role: 'user', content: userContent }
]
})
});
if (!response.ok) {
const err = await response.json().catch(function() { return {}; });
return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
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
