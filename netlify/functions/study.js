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
      if (f.textContent) fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 15000) + '\n';
      else if (!f.imageData) fileCtx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
    }
  }
  if (urlsArr.length) {
    fileCtx += '\n\nURLs:\n';
    for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
  }

  const modeList = modesArr.length ? modesArr.join(', ') : 'solve';

  const systemPrompt = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks, no extra text. Keep responses concise: notes = 4-5 sections with 3 bullets each; quiz = 6 questions; flashcards = 10 cards; tutor = 3-4 sections with 2 short paragraphs each; fitb = 6 sentences; keyconcepts = 8 terms; practicetest = 4 questions; studyplan = 5 days. Fill every field. Never leave arrays empty.';

  const modeMap = {
    flashcards: '"flashcards":{"cards":[{"front":"term","back":"definition"}]}',
    quiz: '"quiz":{"questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct","difficulty":"Medium"}]}',
    fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"]}]}',
    summary: '"summary":{"overview":"3-4 sentence overview","keyPoints":["key point 1","key point 2","key point 3","key point 4","key point 5"],"mustRemember":"single most important concept"}',
    notes: '"notes":{"sections":[{"heading":"Section Title","content":"Brief paragraph.","bullets":["bullet 1","bullet 2","bullet 3"]}]}',
    tutor: '"tutor":{"title":"Lesson title","sections":[{"number":1,"heading":"Section Title","paragraphs":["Clear explanation paragraph.","Follow-up detail paragraph."],"keyTakeaway":"One key insight.","thinkAboutIt":"A reflective question?"}]}',
    practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"question","sampleAnswer":"sample answer"}]}]}',
    keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"definition","importance":"why it matters"}]}',
    studyplan: '"studyplan":{"totalDays":5,"steps":[{"day":1,"title":"Introduction","tasks":["task 1","task 2"],"duration":"30 min"}]}',
    solve: '"solve":{"quickAnswer":"direct answer","stepByStep":[{"step":1,"title":"step title","content":"explanation"}],"keyInsight":"key insight","examples":["example 1"]}'
  };

  let modeStructures = '';
  for (let i = 0; i < modesArr.length; i++) {
    const m = modesArr[i];
    modeStructures += (modeMap[m] || ('"' + m + '":{"content":"study material"}'));
    if (i < modesArr.length - 1) modeStructures += ',\n    ';
  }

  const difficultyModes = ['quiz', 'practicetest', 'fitb'];
  const hasDifficultyMode = modesArr.some(function(m) { return difficultyModes.indexOf(m) !== -1; });
  const difficultyInstruction = hasDifficultyMode
    ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. easy=simple recall; medium=understanding required; hard=analysis and application. Every question must match this level.'
    : '';

  const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate: ' + modeList + difficultyInstruction + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';

  const heavyModes = ['tutor', 'notes', 'practicetest', 'studyplan'];
  const maxTokens = modesArr.some(function(m) { return heavyModes.indexOf(m) !== -1; }) ? 4000 : 2500;

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
        model: 'gpt-4o-mini',
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
      return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }
    const data = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content) return { statusCode: 500, body: JSON.stringify({ error: 'No content from OpenAI' }) };
    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) {
      try { parsed = JSON.parse(repairJson(content)); }
      catch (e2) { return { statusCode: 500, body: JSON.stringify({ error: 'Response was too long. Try a shorter topic.' }) }; }
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
