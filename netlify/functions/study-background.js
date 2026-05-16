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
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 55000);
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4000,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      })
    });
  } finally {
    clearTimeout(tid);
  }
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
    catch (e2) { throw new Error('JSON parse failed'); }
  }
}

const SYSTEM_NOTES = 'You are StudLit AI, a university-level study material generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. Generate COMPREHENSIVE, TEXTBOOK-QUALITY notes. Do NOT summarise. Expand every concept fully with detailed explanations, examples, and definitions. Each section must be rich and educational. More content is always better — fill every field completely.';
const SYSTEM_BATCH = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate EXACTLY the number of items requested. Every item must be complete and fully filled out. Do not generate fewer items than requested.';
const SYSTEM_OTHER = 'You are StudLit AI, a study content generator. Return ONLY valid JSON — no markdown, no backticks, no extra text. Generate rich, substantive content. All answers must be detailed and complete.';

const MODE_MAP = {
  flashcards: '"flashcards":{"cards":[{"front":"term or concept","back":"thorough definition with context and example","difficulty":"easy|medium|hard"}]}',
  quiz: '"quiz":{"questions":[{"question":"full question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why this answer is correct and others are wrong","difficulty":"Easy|Medium|Hard"}]}',
  fitb: '"fitb":{"sentences":[{"text":"The ___ is responsible for ___ and plays a key role in ___.","blanks":["term1","term2","term3"]}]}',
  summary: '"summary":{"overview":"3-4 sentence overview covering all major themes","keyPoints":["detailed key point 1","detailed key point 2","key point 3","key point 4","key point 5","key point 6","key point 7","key point 8","key point 9","key point 10"],"mustRemember":"the single most critical concept"}',
  notes: '"notes":{"sections":[{"heading":"Section Title","overview":"2-3 sentence introduction.","content":"Detailed paragraph 1.\\n\\nParagraph 2.\\n\\nParagraph 3.","bullets":["Key point 1","Key point 2","Key point 3","Key point 4","Key point 5"],"keyTerms":[{"term":"term","definition":"definition"}],"examples":["Example 1","Example 2"],"applications":["Application 1","Application 2"],"causeEffect":"Cause-effect relationships.","keyTakeaway":"Most important insight."}]}',
  tutor: '"tutor":{"title":"Full lesson title","sections":[{"number":1,"heading":"Section Heading","paragraphs":["First detailed paragraph.","Second paragraph.","Third paragraph."],"keyTakeaway":"Most important insight.","thinkAboutIt":"Thought-provoking question?"}]}',
  practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"question text","sampleAnswer":"comprehensive sample answer"}]},{"type":"multipleChoice","questions":[{"question":"question text","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct"}]},{"type":"essayPrompt","questions":[{"question":"essay prompt","sampleAnswer":"detailed outline and key points"}]}]}',
  keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"comprehensive 2-3 sentence definition","importance":"why this concept matters"}]}',
  studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Day Title","tasks":["task 1","task 2","task 3","task 4","task 5"],"duration":"45 min","focus":"what to prioritise"}]}',
  solve: '"solve":{"quickAnswer":"clear direct answer","stepByStep":[{"step":1,"title":"Step title","content":"detailed explanation"}],"keyInsight":"most important insight","examples":["worked example 1","worked example 2","worked example 3"],"commonMistakes":["mistake 1","mistake 2"]}'
};

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
  catch (e) { return; }

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
  const hasQuiz = modesArr.indexOf('quiz') !== -1;
  const hasFlashcards = modesArr.indexOf('flashcards') !== -1;
  const otherModes = modesArr.filter(m => m !== 'notes' && m !== 'quiz' && m !== 'flashcards');

  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });

    if (!apiKey) {
      await store.setJSON(requestId, { status: 'error', error: 'OPENAI_API_KEY not set' }, { ttl: 7200 });
      return;
    }

    const combinedResults = {};
    let resolvedTopic = topic || 'Study Set';
    const fileCtx = buildFileCtx(filesArr, urlsArr, 20000);
    const imageBlocks = filesArr.filter(f => f.imageData && f.mimeType).map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));

    // ── NOTES ──────────────────────────────────────────────────────────────
    async function runNotes() {
      const totalFileText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
      const imageFiles = filesArr.filter(f => f.imageData && f.mimeType);
      const CHUNK_SIZE = 8000;
      const useChunking = totalFileText.length > CHUNK_SIZE;
      const notesQty = '\n\nNOTES REQUIREMENTS: Generate 8-12 rich sections. Each section must have: a full overview paragraph (3-4 sentences), 3-4 detailed content paragraphs, 6+ detailed bullets, key terms with definitions, 3+ concrete examples, real-world applications, cause-effect analysis, and a key takeaway.';

      if (useChunking) {
        const chunks = splitIntoChunks(totalFileText, CHUNK_SIZE).slice(0, 20);
        const allSections = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          await store.setJSON(requestId, { status: 'processing', progress: 'Notes: chunk ' + (ci + 1) + ' of ' + chunks.length + '…' }, { ttl: 7200 });
          const imgBlocks = imageFiles.map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));
          const uc = [...imgBlocks, { type: 'text', text: '\n\nUploaded materials:\n\n[Chunk ' + (ci + 1) + ']\n' + chunks[ci] }, { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: notes\n\nCHUNK ' + (ci + 1) + ' of ' + chunks.length + ': Process ONLY this chunk.' + notesQty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}' }];
          try {
            const parsed = await callOpenAI(apiKey, SYSTEM_NOTES, uc, 8000);
            if (parsed.results && parsed.results.notes && parsed.results.notes.sections) {
              allSections.push(...parsed.results.notes.sections);
              if (parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
            }
          } catch (e) { /* continue */ }
        }
        if (allSections.length) combinedResults.notes = { sections: allSections };
      } else {
        await store.setJSON(requestId, { status: 'processing', progress: 'Generating notes…' }, { ttl: 7200 });
        const imgBlocks = imageFiles.map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));
        const uc = [...imgBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: 'Topic: ' + topicStr + '\n\nGenerate: notes' + notesQty + '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}' }];
        try {
          const parsed = await callOpenAI(apiKey, SYSTEM_NOTES, uc, 8000);
          if (parsed.results && parsed.results.notes) combinedResults.notes = parsed.results.notes;
          if (parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
        } catch (e) { /* notes missing */ }
      }
    }

    // ── QUIZ — 6 sequential batches of 10 questions = 60 total ─────────────
    // gpt-4o-mini naturally generates ~10 items per call; we use that to our
    // advantage: 6 focused calls × ~10 questions = reliable 60-question total
    async function runQuiz() {
      const diffInstr = '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '.';
      const batches = [
        'Generate 10 multiple-choice questions about DEFINITIONS AND KEY TERMS. Test whether students know the meaning of the most important vocabulary in this topic.',
        'Generate 10 multiple-choice questions about HOW THINGS WORK. Test understanding of processes, mechanisms, and sequences of events.',
        'Generate 10 multiple-choice questions that are SCENARIO-BASED. Give a real-world situation or case study; students must identify the correct concept or action.',
        'Generate 10 multiple-choice questions about CAUSE AND EFFECT. Test whether students understand why things happen and what consequences follow.',
        'Generate 10 multiple-choice questions that COMPARE AND CONTRAST. Ask students to distinguish between related concepts, methods, or outcomes.',
        'Generate 10 CHALLENGING multiple-choice questions requiring analysis, synthesis, or evaluation. Use tricky distractors that test deep understanding.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await store.setJSON(requestId, { status: 'processing', progress: 'Quiz: batch ' + (i + 1) + ' of ' + batches.length + '…' }, { ttl: 7200 });
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + diffInstr + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + MODE_MAP.quiz + '\n  }\n}';
        const uc = [...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }];
        try {
          const r = await callOpenAI(apiKey, SYSTEM_BATCH, uc, 4000);
          const items = (r && r.results && r.results.quiz && r.results.quiz.questions) || [];
          all.push(...items);
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* continue to next batch */ }
      }
      if (all.length) combinedResults.quiz = { questions: all };
    }

    // ── FLASHCARDS — 6 sequential batches of 10 cards = 60 total ───────────
    async function runFlashcards() {
      const batches = [
        'Generate 10 flashcards for the most important KEY TERMS. Front: the term. Back: clear definition with an example.',
        'Generate 10 flashcards about PROCESSES AND STEPS. Front: "How does X work?" or "What are the steps of X?". Back: step-by-step explanation.',
        'Generate 10 flashcards about CAUSE AND EFFECT. Front: "What causes X?" or "What is the effect of X?". Back: thorough causal explanation.',
        'Generate 10 flashcards that COMPARE TWO THINGS. Front: "What is the difference between X and Y?". Back: clear comparison.',
        'Generate 10 flashcards with REAL-WORLD EXAMPLES. Front: a scenario or "Give an example of X in practice". Back: concrete real-world example with explanation.',
        'Generate 10 flashcards for HARDER CONCEPTS requiring analysis. Front: "Why does X happen?" or "What would happen if X changed?". Back: analytical explanation.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await store.setJSON(requestId, { status: 'processing', progress: 'Flashcards: batch ' + (i + 1) + ' of ' + batches.length + '…' }, { ttl: 7200 });
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + MODE_MAP.flashcards + '\n  }\n}';
        const uc = [...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }];
        try {
          const r = await callOpenAI(apiKey, SYSTEM_BATCH, uc, 4000);
          const items = (r && r.results && r.results.flashcards && r.results.flashcards.cards) || [];
          all.push(...items);
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* continue */ }
      }
      if (all.length) combinedResults.flashcards = { cards: all };
    }

    // ── OTHER MODES — all parallel, each its own call ──────────────────────
    async function runOtherModes() {
      if (!otherModes.length) return;
      await store.setJSON(requestId, { status: 'processing', progress: 'Generating ' + otherModes.join(', ') + '…' }, { ttl: 7200 });
      const difficultyModes = ['practicetest', 'fitb'];
      await Promise.all(otherModes.map(mode => {
        const structure = MODE_MAP[mode] || ('"' + mode + '":{"content":"comprehensive study material"}');
        const diffInstr = difficultyModes.indexOf(mode) !== -1 ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '.' : '';
        const prompt = 'Topic: ' + topicStr + '\n\nGenerate comprehensive ' + mode + ' content covering all key topics.' + diffInstr + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + structure + '\n  }\n}';
        const uc = [...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }];
        return callOpenAI(apiKey, SYSTEM_OTHER, uc, 8000)
          .then(parsed => {
            if (parsed && parsed.results) Object.assign(combinedResults, parsed.results);
            if (parsed && parsed.topic && parsed.topic !== 'the uploaded content') resolvedTopic = parsed.topic;
          }).catch(() => {});
      }));
    }

    // Run notes + other modes in parallel; run quiz then flashcards sequentially
    // after each other to avoid any rate limit pressure on the same model tier
    await Promise.all([
      hasNotes ? runNotes() : Promise.resolve(),
      runOtherModes(),
      (async () => {
        if (hasQuiz) await runQuiz();
        if (hasFlashcards) await runFlashcards();
      })(),
    ]);

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
