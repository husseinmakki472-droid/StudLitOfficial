function repairJson(str) {
  str = str.replace(/,\s*([}\]])/g, '$1');
  const quoteCount = (str.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) str += '"';
  const stack = [];
  for (const ch of str) {
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) stack.pop();
  }
  return str + stack.reverse().join('');
}

const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { topic, modes, files, urls, difficulty } = body;
const difficultyLevel = (difficulty || 'medium').toLowerCase();
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
if (f.textContent) fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 25000) + '\n';
else if (!f.imageData) fileCtx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
}
}
if (urlsArr.length) {
fileCtx += '\n\nURLs:\n';
for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
}
const modeList = modesArr.length ? modesArr.join(', ') : 'solve';
const systemPrompt = 'You are StudLit AI, an expert study material generator. Return ONLY valid JSON matching the schema exactly — no markdown, no backticks. Be comprehensive and detailed: for notes generate at least 8 sections each with 4-6 detailed bullet points; for quiz generate at least 10 questions covering different concepts; for flashcards generate at least 18 cards. Cover every major concept from the content. Never leave arrays empty. Fill every field.';
const modeMap = {
flashcards: '"flashcards":{"cards":[{"front":"term or question","back":"detailed definition or full answer"}]}',
quiz: '"quiz":{"questions":[{"question":"specific, clear question about a key concept","options":["A) first option","B) second option","C) third option","D) fourth option"],"correct":0,"explanation":"clear explanation of why the correct answer is right"}]}',
fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"]}]}',
summary: '"summary":{"overview":"comprehensive 5-7 sentence overview covering all main ideas","keyPoints":["detailed key point 1","detailed key point 2","detailed key point 3","detailed key point 4","detailed key point 5","detailed key point 6","detailed key point 7","detailed key point 8"],"mustRemember":"the single most critical concept to remember"}',
notes: '"notes":{"sections":[{"heading":"Section Title","content":"Thorough paragraph explaining this section with details and context.","bullets":["Detailed bullet point 1 with full explanation","Detailed bullet point 2 with full explanation","Detailed bullet point 3 with full explanation","Detailed bullet point 4 with full explanation","Detailed bullet point 5 with full explanation"]}]}',
tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"1. Section Title","paragraphs":["Thorough paragraph explaining this concept in depth with examples. Wrap key terms in <strong>strong tags</strong>. Write as many sentences as needed to fully explain.","Continue with more detail, sub-concepts, real-world applications, and nuances.","Add more paragraphs as needed until this section is completely covered."],"keyTakeaway":"One-sentence key insight for this section.","thinkAboutIt":"A reflective question to deepen understanding?"}]}',
practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"detailed question requiring explanation","sampleAnswer":"comprehensive sample answer with key points"}]}]}',
keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"complete, detailed definition","importance":"why this concept matters and how it connects to other ideas"}]}',
studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Introduction","tasks":["specific task 1","specific task 2"],"duration":"45 min"}]}',
solve: '"solve":{"quickAnswer":"direct, complete answer","stepByStep":[{"step":1,"title":"step title","content":"detailed explanation of this step"}],"keyInsight":"most important insight","examples":["concrete example 1","concrete example 2"]}'
};
let modeStructures = '';
for (let i = 0; i < modesArr.length; i++) {
const m = modesArr[i];
modeStructures += (modeMap[m] || ('"' + m + '":{"content":"study material"}'));
if (i < modesArr.length - 1) modeStructures += ',\n    ';
}
const difficultyModes = ['quiz', 'practicetest', 'fitb'];
const hasDifficultyMode = modesArr.some(function(m) { return difficultyModes.indexOf(m) !== -1; });
const difficultyInstruction = hasDifficultyMode ? '\n\nDIFFICULTY REQUIREMENT (strictly follow this): ' + difficultyLevel.toUpperCase() + '.\n- easy: simple recall, single-concept questions, obvious answers from the text, very short fill-in-the-blanks\n- medium: requires understanding and inference, multi-step reasoning, moderate vocabulary\n- hard: analysis, synthesis, edge cases, application to new scenarios, nuanced distinctions\nEvery question MUST match this difficulty. Tag each quiz question "difficulty" field as "' + (difficultyLevel.charAt(0).toUpperCase()+difficultyLevel.slice(1)) + '".' : '';
const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate these study modes: ' + modeList + difficultyInstruction + '\n\nReturn this JSON:\n{\n  "topic": "specific topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';
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
const heavyModes = ['tutor', 'notes', 'practicetest', 'studyplan'];
const maxTokens = modesArr.some(function(m){ return heavyModes.indexOf(m) !== -1; }) ? 8000 : 4096;
body: JSON.stringify({
model: 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.3,
response_format: { type: 'json_object' },
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
catch (e) {
try { parsed = JSON.parse(repairJson(content)); }
catch (e2) { return { statusCode: 500, body: JSON.stringify({ error: 'Try selecting fewer modes or a shorter topic and generate again.' }) }; }
}
return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
