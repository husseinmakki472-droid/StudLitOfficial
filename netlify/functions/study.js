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

// These modes always use gpt-4o; everything else always uses gpt-4o-mini
const GPT4O_MODES = new Set(['quiz', 'solve', 'tutor', 'practicetest']);

async function callOpenAI(apiKey, model, systemPrompt, userContent, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(function() { return {}; });
    throw new Error((err.error && err.error.message) || 'OpenAI API error ' + response.status);
  }
  const data = await response.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  if (!content) throw new Error('No content from OpenAI');
  try { return JSON.parse(content); }
  catch (e) {
    try { return JSON.parse(repairJson(content)); }
    catch (e2) { throw new Error('Response was too long. Try a shorter topic.'); }
  }
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
      if (typeof f.textContent === 'string' && f.textContent) fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 30000) + '\n';
      else if (!f.imageData) fileCtx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
    }
  }
  if (urlsArr.length) {
    fileCtx += '\n\nURLs:\n';
    for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
  }

  const systemPrompt = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks, no extra text. Be EXHAUSTIVE: extract and cover EVERY concept, term, topic, and detail present in the content. Do not summarise or skip anything. For notes: generate a section for every major topic with 5-7 detailed bullets each. For quiz: generate 1 question per key concept — aim for 15-25 questions. For flashcards: generate 1 card per term/concept — aim for 25-40 cards. For tutor: cover every section of the content with 3-4 full paragraphs each. For fitb: 12-18 sentences covering all key terms. For keyconcepts: every important term, aim for 15-25. For practicetest: 8-12 detailed questions. For studyplan: 7 days minimum. For solve: give a thorough multi-step explanation with all necessary detail. Fill every field. Never leave arrays empty. Never truncate.';

  const modeMap = {
    flashcards: '"flashcards":{"cards":[{"front":"term or question — one card per concept in the content","back":"thorough definition or full answer"}]}',
    quiz: '"quiz":{"questions":[{"question":"specific question about a key concept — generate one per concept","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"clear explanation of why the correct answer is right","difficulty":"Medium"}]}',
    fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"]}]}',
    summary: '"summary":{"overview":"comprehensive 6-8 sentence overview covering all main ideas","keyPoints":["detailed key point — include one per major concept from the content"],"mustRemember":"the single most critical concept to remember"}',
    notes: '"notes":{"sections":[{"heading":"Section Title — one section per major topic","content":"Thorough paragraph explaining this topic with full detail and context.","bullets":["Detailed bullet 1 with full explanation","Detailed bullet 2","Detailed bullet 3","Detailed bullet 4","Detailed bullet 5"]}]}',
    tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"Section heading","paragraphs":["In-depth paragraph explaining this concept thoroughly with examples and context.","Continue with sub-concepts, nuances, and real-world applications.","Add as many paragraphs as needed to fully explain this section."],"keyTakeaway":"Key insight for this section.","thinkAboutIt":"A reflective question to deepen understanding?"}]}',
    practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"detailed question requiring full explanation","sampleAnswer":"comprehensive sample answer covering all key points"}]}]}',
    keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"complete, detailed definition","importance":"why this concept matters and how it connects to other ideas"}]}',
    studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Topic Introduction","tasks":["specific task 1","specific task 2","specific task 3"],"duration":"45 min"}]}',
    solve: '"solve":{"quickAnswer":"direct, complete answer","stepByStep":[{"step":1,"title":"step title","content":"thorough explanation of this step with all necessary detail"}],"keyInsight":"the most important insight","examples":["concrete example 1","concrete example 2","concrete example 3"]}'
  };

  // Split modes into two buckets by model
  const gpt4oModes = modesArr.filter(m => GPT4O_MODES.has(m));
  const miniModes  = modesArr.filter(m => !GPT4O_MODES.has(m));

  const difficultyModes = ['quiz', 'practicetest', 'fitb'];
  const difficultyInstruction = modesArr.some(m => difficultyModes.includes(m))
    ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. easy=simple recall; medium=understanding required; hard=analysis and application. Every question must match this level.'
    : '';

  const imageBlocks = filesArr
    .filter(function(f) { return f.imageData && f.mimeType; })
    .map(function(f) { return { type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }; });
  const sharedCtxBlock = fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : [];

  function buildCall(arr, model) {
    const list = arr.join(', ');
    const structures = arr.map(m => modeMap[m] || ('"' + m + '":{"content":"study material"}')).join(',\n    ');
    const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate: ' + list + difficultyInstruction + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + structures + '\n  }\n}';
    const userContent = [...imageBlocks, ...sharedCtxBlock, { type: 'text', text: queryText }];
    const maxTokens = model === 'gpt-4o' ? 4096 : 4096;
    return callOpenAI(apiKey, model, systemPrompt, userContent, maxTokens);
  }

  try {
    // Run both calls in parallel; skip a call if its bucket is empty
    const [gpt4oResult, miniResult] = await Promise.all([
      gpt4oModes.length ? buildCall(gpt4oModes, 'gpt-4o')      : Promise.resolve(null),
      miniModes.length  ? buildCall(miniModes,  'gpt-4o-mini')  : Promise.resolve(null),
    ]);

    // Merge results from both calls
    const mergedResults = Object.assign(
      {},
      miniResult  && miniResult.results,
      gpt4oResult && gpt4oResult.results
    );
    const topicName = (gpt4oResult && gpt4oResult.topic) || (miniResult && miniResult.topic) || (topic || 'Study Material');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ topic: topicName, results: mergedResults })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
