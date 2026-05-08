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

  const { topic, modes, files, urls, difficulty, chunkIndex, totalChunks } = body;
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
      if (typeof f.textContent === 'string' && f.textContent) fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 20000) + '\n';
      else if (!f.imageData) fileCtx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
    }
  }
  if (urlsArr.length) {
    fileCtx += '\n\nURLs:\n';
    for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
  }

  const isNotesOnly = modesArr.length === 1 && modesArr[0] === 'notes';
  const hasNotes = modesArr.indexOf('notes') !== -1;
  const modeList = modesArr.length ? modesArr.join(', ') : 'solve';

  const chunkNote = (chunkIndex !== undefined && totalChunks !== undefined)
    ? '\n\nCHUNK: You are processing section ' + (chunkIndex + 1) + ' of ' + totalChunks + ' from this document. Focus exclusively on the content provided in this chunk. Do not summarise — expand every concept fully.'
    : '';

  const systemPrompt = hasNotes
    ? 'You are StudLit AI, a university-level study material generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. For notes mode: generate COMPREHENSIVE, TEXTBOOK-QUALITY notes. Do NOT summarise. Expand every concept fully with detailed explanations, examples, and definitions. Each section must be rich and educational. For other modes: quiz = 8 questions; flashcards = 12 cards; keyconcepts = 10 terms; summary = 6-8 key points; practicetest = 3 questions per section; fitb = 7 sentences; studyplan = 5-7 days; tutor = 4 sections.'
    : 'You are StudLit AI, a study content generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. Generate quality content: quiz = 8 questions with explanations; flashcards = 12 cards; fitb = 7 sentences; keyconcepts = 10 terms with definitions; practicetest = 3 questions per section; studyplan = 5 days; summary = 5 key points. Keep all answers clear and substantive.';

  const modeMap = {
    flashcards: '"flashcards":{"cards":[{"front":"term or concept","back":"thorough definition with context and example"}]}',
    quiz: '"quiz":{"questions":[{"question":"full question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"detailed explanation of why this answer is correct and why others are wrong","difficulty":"Medium"}]}',
    fitb: '"fitb":{"sentences":[{"text":"The ___ is responsible for ___ and plays a key role in ___.","blanks":["term1","term2","term3"]}]}',
    summary: '"summary":{"overview":"3-4 sentence overview covering all major themes","keyPoints":["detailed key point 1 with context","detailed key point 2","key point 3","key point 4","key point 5","key point 6","key point 7","key point 8"],"mustRemember":"the single most critical concept to understand"}',

    notes: '"notes":{"sections":[{"heading":"Section Title","overview":"2-3 sentence introduction explaining what this section covers and why it matters.","content":"Detailed explanatory paragraph 1 that fully explains the concept with context.\\n\\nParagraph 2 that builds on this with more depth, mechanisms, and nuance.\\n\\nParagraph 3 connecting this to broader ideas and implications.","bullets":["Key point 1 — full explanation of this concept with sufficient detail for a student","Key point 2 — another important aspect fully explained","Key point 3 — another key idea with context and explanation","Key point 4 — further elaboration","Key point 5 — additional important detail"],"keyTerms":[{"term":"important vocabulary word","definition":"precise and comprehensive definition of this term"}],"examples":["Concrete example 1 that illustrates the concept clearly","Concrete example 2 showing a different application or scenario"],"applications":["Real-world application or relevance of this concept","Another context where this knowledge is applied"],"causeEffect":"Explanation of cause-and-effect relationships, mechanisms, or sequences relevant to this section.","keyTakeaway":"The single most important insight a student must remember from this section."}]}',

    tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"Section Heading","paragraphs":["First detailed paragraph explaining the concept clearly with analogies.","Second paragraph building on this with examples and applications.","Third paragraph connecting to broader context and implications."],"keyTakeaway":"The one most important insight from this section.","thinkAboutIt":"A thought-provoking question to deepen understanding?"}]}',
    practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"question text","sampleAnswer":"comprehensive sample answer"}]},{"type":"multipleChoice","questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct"}]},{"type":"essayPrompt","questions":[{"question":"essay prompt","sampleAnswer":"detailed outline and key points to cover"}]}]}',
    keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"comprehensive 2-3 sentence definition","importance":"why this concept matters and real-world applications"}]}',
    studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Day Title","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"duration":"45 min","focus":"what to prioritise today"}]}',
    solve: '"solve":{"quickAnswer":"clear direct answer","stepByStep":[{"step":1,"title":"Step title","content":"detailed explanation of this step with examples"}],"keyInsight":"the most important insight or principle","examples":["worked example 1","worked example 2","worked example 3"],"commonMistakes":["mistake to avoid 1","mistake to avoid 2"]}'
  };

  let modeStructures = '';
  for (let i = 0; i < modesArr.length; i++) {
    const m = modesArr[i];
    modeStructures += (modeMap[m] || ('"' + m + '":{"content":"comprehensive study material"}'));
    if (i < modesArr.length - 1) modeStructures += ',\n    ';
  }

  const difficultyModes = ['quiz', 'practicetest', 'fitb'];
  const hasDifficultyMode = modesArr.some(function(m) { return difficultyModes.indexOf(m) !== -1; });
  const difficultyInstruction = hasDifficultyMode
    ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. easy=basic recall; medium=conceptual understanding; hard=deep analysis and synthesis.'
    : '';

  const notesQuantity = hasNotes
    ? '\n\nNOTES REQUIREMENTS: Generate 6-10 rich sections. Each section must have: a full overview paragraph, 2-3 detailed content paragraphs, 5+ detailed bullets, key terms with definitions, 2+ examples, real-world applications, cause-effect analysis, and a key takeaway. Do NOT summarise — fully expand every concept.'
    : '';

  const quantityInstruction = '\n\nQUANTITY: flashcards=12 cards; quiz=8 questions; fitb=7 sentences; keyconcepts=10 concepts; studyplan=5+ days; summary=6+ points; practicetest=3 questions per section; solve=2+ examples.' + notesQuantity;

  const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate: ' + modeList + chunkNote + difficultyInstruction + quantityInstruction + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';

  const isHeavyNotes = hasNotes;
  const maxTokens = isHeavyNotes ? 4000 : (modesArr.some(function(m) { return ['tutor','practicetest','studyplan','keyconcepts','flashcards'].indexOf(m) !== -1; }) ? 2000 : 1500);

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
      catch (e2) { return { statusCode: 500, body: JSON.stringify({ error: 'Response was too long. Try selecting fewer modes or a shorter topic.' }) }; }
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
