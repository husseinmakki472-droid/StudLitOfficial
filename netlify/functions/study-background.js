// Netlify Background Function — runs up to 15 minutes, always returns 202 immediately.
// The frontend polls study-status.js for the result stored in Netlify Blobs.

const { getStore } = require('@netlify/blobs');

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

function splitIntoChunks(text, size) {
  if (!text || text.length <= size) return [text];
  const chunks = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > size && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, size)];
}

async function callOpenAI(apiKey, systemPrompt, userContent, maxTokens) {
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
    const err = await response.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'OpenAI error ' + response.status);
  }
  const data = await response.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  if (!content) throw new Error('No content from OpenAI');
  try { return JSON.parse(content); }
  catch (e) {
    try { return JSON.parse(repairJson(content)); }
    catch (e2) { throw new Error('JSON parse failed — response may have been cut off'); }
  }
}

const SYSTEM_NOTES = 'You are StudLit AI, a university-level study material generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. Generate COMPREHENSIVE, TEXTBOOK-QUALITY notes. Do NOT summarise. Expand every concept fully with detailed explanations, examples, and definitions. Each section must be rich and educational. More content is always better — fill every field completely.';
const SYSTEM_OTHER = 'You are StudLit AI, a study content generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. Generate rich, comprehensive content: quiz = 12 questions with detailed explanations; flashcards = 20 cards with thorough definitions; fitb = 12 sentences; keyconcepts = 15 terms with full definitions and importance; practicetest = 5 questions per section; studyplan = 7 days with 4-5 tasks each; summary = 8-10 detailed key points; tutor = 6 sections; solve = 3+ worked examples. All answers must be clear, detailed, and substantive — never truncate.';

const MODE_MAP = {
  flashcards: '"flashcards":{"cards":[{"front":"term or concept","back":"thorough definition with context and example"}]}',
  quiz: '"quiz":{"questions":[{"question":"full question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"detailed explanation of why this answer is correct and why others are wrong","difficulty":"Medium"}]}',
  fitb: '"fitb":{"sentences":[{"text":"The ___ is responsible for ___ and plays a key role in ___.","blanks":["term1","term2","term3"]}]}',
  summary: '"summary":{"overview":"3-4 sentence overview covering all major themes","keyPoints":["detailed key point 1 with context","detailed key point 2","key point 3","key point 4","key point 5","key point 6","key point 7","key point 8"],"mustRemember":"the single most critical concept to understand"}',
  notes: '"notes":{"sections":[{"heading":"Section Title","overview":"2-3 sentence introduction explaining what this section covers and why it matters.","content":"Detailed explanatory paragraph 1 that fully explains the concept with context.\\n\\nParagraph 2 building on this with more depth, mechanisms, and nuance.\\n\\nParagraph 3 connecting to broader ideas and implications.","bullets":["Key point 1 — full explanation with sufficient detail for a student","Key point 2 — another important aspect fully explained","Key point 3 — another key idea with context and explanation","Key point 4 — further elaboration","Key point 5 — additional important detail"],"keyTerms":[{"term":"important vocabulary word","definition":"precise and comprehensive definition of this term"}],"examples":["Concrete example 1 that illustrates the concept clearly","Concrete example 2 showing a different application"],"applications":["Real-world application of this concept","Another context where this knowledge is applied"],"causeEffect":"Explanation of cause-and-effect relationships or mechanisms relevant to this section.","keyTakeaway":"The single most important insight a student must remember from this section."}]}',
  tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"Section Heading","paragraphs":["First detailed paragraph explaining the concept clearly with analogies.","Second paragraph building on this with examples and applications.","Third paragraph connecting to broader context and implications."],"keyTakeaway":"The one most important insight from this section.","thinkAboutIt":"A thought-provoking question to deepen understanding?"}]}',
  practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"question text","sampleAnswer":"comprehensive sample answer"}]},{"type":"multipleChoice","questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct"}]},{"type":"essayPrompt","questions":[{"question":"essay prompt","sampleAnswer":"detailed outline and key points to cover"}]}]}',
  keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"comprehensive 2-3 sentence definition","importance":"why this concept matters and real-world applications"}]}',
  studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Day Title","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"duration":"45 min","focus":"what to prioritise today"}]}',
  solve: '"solve":{"quickAnswer":"clear direct answer","stepByStep":[{"step":1,"title":"Step title","content":"detailed explanation of this step with examples"}],"keyInsight":"the most important insight or principle","examples":["worked example 1","worked example 2","worked example 3"],"commonMistakes":["mistake to avoid 1","mistake to avoid 2"]}'
};

function buildModeStructures(modesArr) {
  return modesArr.map(m => MODE_MAP[m] || ('"' + m + '":{"content":"comprehensive study material"}')).join(',\n    ');
}

function buildFileCtx(filesArr, urlsArr, maxCharsPerFile) {
  let ctx = '';
  if (filesArr.length) {
    ctx += '\n\nUploaded materials:\n';
    for (const f of filesArr) {
      if (typeof f.textContent === 'string' && f.textContent) ctx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, maxCharsPerFile) + '\n';
      else if (!f.imageData) ctx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
    }
  }
  if (urlsArr && urlsArr.length) { ctx += '\n\nURLs:\n'; for (const u of urlsArr) ctx += '- ' + u + '\n'; }
  return ctx;
}

const handler = async (event) => {
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return; } // background functions always return 202

  const { requestId, topic, modes, files, urls, difficulty } = body;
  if (!requestId) return;

  const apiKey = process.env.OPENAI_API_KEY;
  const store = getStore({
    name: 'study-results',
    siteID: process.env.SITE_ID,
    token: process.env.NETLIFY_TOKEN
  });

  const modesArr = modes || [];
  const filesArr = files || [];
  const urlsArr = urls || [];
  const difficultyLevel = (difficulty || 'medium').toLowerCase();
  const topicStr = topic || 'the uploaded content';
  const hasNotes = modesArr.indexOf('notes') !== -1;
  const otherModes = modesArr.filter(m => m !== 'notes');

  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });

    if (!apiKey) {
      await store.setJSON(requestId, { status: 'error', error: 'OPENAI_API_KEY not set' }, { ttl: 7200 });
      return;
    }

    const combinedResults = {};
    let resolvedTopic = topic || 'Study Set';

    // ── NOTES ──────────────────────────────────────────────────────────────
    if (hasNotes) {
      const totalFileText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
      const imageFiles = filesArr.filter(f => f.imageData && f.mimeType);
      const CHUNK_SIZE = 8000;
      const useChunking = totalFileText.length > CHUNK_SIZE;

      const notesQty = '\n\nNOTES REQUIREMENTS: Generate 8-12 rich sections. Each section must have: a full overview paragraph (3-4 sentences), 3-4 detailed content paragraphs (each 4-6 sentences), 6+ detailed bullets with full explanations, key terms with comprehensive definitions, 3+ concrete examples, real-world applications, cause-effect analysis, and a key takeaway. Do NOT summarise — fully expand every concept. More depth is always better.';

      if (useChunking) {
        const chunks = splitIntoChunks(totalFileText, CHUNK_SIZE).slice(0, 20);
        const totalChunks = chunks.length;
        const allSections = [];

        for (let ci = 0; ci < chunks.length; ci++) {
          await store.setJSON(requestId, { status: 'processing', progress: 'Notes: section ' + (ci + 1) + ' of ' + totalChunks + '…' }, { ttl: 7200 });
          const chunkNote = '\n\nCHUNK ' + (ci + 1) + ' of ' + totalChunks + ': Process ONLY the content in this chunk. Do not summarise — expand every concept fully.';
          const imageBlocks = imageFiles.map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));
          const userContent = [
            ...imageBlocks,
            { type: 'text', text: '\n\nUploaded materials:\n\n[Chunk ' + (ci + 1) + ']\n' + chunks[ci] },
            { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: notes' + chunkNote + notesQty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}' }
          ];
          try {
            const parsed = await callOpenAI(apiKey, SYSTEM_NOTES, userContent, 16000);
            if (parsed.results && parsed.results.notes && parsed.results.notes.sections) {
              allSections.push(...parsed.results.notes.sections);
              if (parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
            }
          } catch (e) { /* continue with other chunks */ }
        }

        if (allSections.length) {
          combinedResults.notes = { sections: allSections };
        } else {
          await store.setJSON(requestId, { status: 'processing', progress: 'Generating notes (fallback)…' }, { ttl: 7200 });
          const fbContent = buildFileCtx([{ name: 'content.txt', textContent: totalFileText.slice(0, 12000) }], [], 12000);
          const fbUser = [{ type: 'text', text: fbContent }, { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: notes' + notesQty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}' }];
          try {
            const fbParsed = await callOpenAI(apiKey, SYSTEM_NOTES, fbUser, 16000);
            if (fbParsed.results && fbParsed.results.notes) combinedResults.notes = fbParsed.results.notes;
          } catch (e) { /* notes will be missing from result */ }
        }
      } else {
        await store.setJSON(requestId, { status: 'processing', progress: 'Generating notes…' }, { ttl: 7200 });
        const fileCtx = buildFileCtx(filesArr, urlsArr, 20000);
        const imageBlocks = imageFiles.map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));
        const userContent = [
          ...imageBlocks,
          ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []),
          { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: notes' + notesQty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}' }
        ];
        try {
          const parsed = await callOpenAI(apiKey, SYSTEM_NOTES, userContent, 16000);
          if (parsed.results && parsed.results.notes) combinedResults.notes = parsed.results.notes;
          if (parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
        } catch (e) { /* notes will be missing */ }
      }
    }

    // ── OTHER MODES ────────────────────────────────────────────────────────
    if (otherModes.length) {
      await store.setJSON(requestId, { status: 'processing', progress: 'Generating ' + otherModes.join(', ') + '…' }, { ttl: 7200 });
      const modeStructures = buildModeStructures(otherModes);
      const difficultyModes = ['quiz', 'practicetest', 'fitb'];
      const hasDiff = otherModes.some(m => difficultyModes.indexOf(m) !== -1);
      const diffInstr = hasDiff ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. easy=basic recall; medium=conceptual understanding; hard=deep analysis.' : '';
      const qty = '\n\nQUANTITY: flashcards=20 cards; quiz=12 questions; fitb=12 sentences; keyconcepts=15 terms; studyplan=7 days with 4-5 tasks each; summary=8-10 detailed points; practicetest=5 per section; solve=3+ worked examples; tutor=6 sections. Do NOT stop early — generate the full quantity requested.';
      const fileCtx = buildFileCtx(filesArr, urlsArr, 20000);
      const imageBlocks = filesArr.filter(f => f.imageData && f.mimeType).map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));
      const userContent = [
        ...imageBlocks,
        ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []),
        { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: ' + otherModes.join(', ') + diffInstr + qty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}' }
      ];
      const heavyModes = ['tutor', 'practicetest', 'studyplan', 'keyconcepts', 'flashcards'];
      const maxTok = otherModes.some(m => heavyModes.indexOf(m) !== -1) ? 12000 : 6000;
      try {
        const parsed = await callOpenAI(apiKey, SYSTEM_OTHER, userContent, maxTok);
        if (parsed.results) Object.assign(combinedResults, parsed.results);
        if (parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
      } catch (e) { /* other modes will be missing */ }
    }

    // ── STORE RESULT ───────────────────────────────────────────────────────
    await store.setJSON(requestId, {
      status: 'done',
      data: { topic: resolvedTopic, results: combinedResults }
    }, { ttl: 7200 });

  } catch (err) {
    try {
      await store.setJSON(requestId, { status: 'error', error: err.message }, { ttl: 7200 });
    } catch (e2) { /* ignore */ }
  }
};

module.exports = { handler };
