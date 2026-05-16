// Netlify Background Function — 15 min limit, always returns 202 immediately.
// Frontend polls study-status.js every 3s for results stored in Netlify Blobs.

const { getStore } = require('@netlify/blobs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function repairJson(str) {
  str = str.replace(/```json|```/g, '').trim();
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
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 50000);
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }]
        })
      });
    } catch (fetchErr) {
      clearTimeout(tid);
      if (attempt < 3) { await sleep(8000 * (attempt + 1)); continue; }
      throw fetchErr;
    }
    clearTimeout(tid);
    if (response.status === 429) {
      const wait = Math.max(15000, parseInt(response.headers.get('retry-after') || '15', 10) * 1000);
      if (attempt < 3) { await sleep(wait); continue; }
      throw new Error('Rate limited');
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err.error && err.error.message) || 'OpenAI error ' + response.status);
    }
    const data = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content) throw new Error('Empty response');
    try { return JSON.parse(content); }
    catch (e) {
      try { return JSON.parse(repairJson(content)); }
      catch (e2) { throw new Error('JSON parse failed'); }
    }
  }
}

async function callClaude(anthropicKey, systemPrompt, userPrompt, maxTokens) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 50000);
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
  } catch (e) { clearTimeout(tid); throw e; }
  clearTimeout(tid);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Anthropic error ' + response.status);
  }
  const data = await response.json();
  const content = (data.content && data.content[0] && data.content[0].text) || '';
  if (!content) throw new Error('Empty Claude response');
  try { return JSON.parse(content); }
  catch (e) {
    try { return JSON.parse(repairJson(content)); }
    catch (e2) { throw new Error('Claude JSON parse failed'); }
  }
}

const SYS_NOTES = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate COMPREHENSIVE textbook-quality notes. Expand every concept fully with examples, mechanisms, cause-effect, and key takeaways. Never summarise.';
const SYS_BATCH = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate EXACTLY the number of items specified. Every item must be fully complete. Do not stop early.';
const SYS_OTHER = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate rich comprehensive content with detailed explanations.';

const MODE_MAP = {
  flashcards: '"flashcards":{"cards":[{"front":"question or term","back":"thorough answer or definition with context","difficulty":"easy|medium|hard"}]}',
  quiz: '"quiz":{"questions":[{"question":"full question","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct and why others are wrong","difficulty":"Easy|Medium|Hard"}]}',
  fitb: '"fitb":{"sentences":[{"text":"The ___ does ___ which results in ___.","blanks":["term1","term2","term3"]}]}',
  summary: '"summary":{"overview":"4-6 sentence overview","keyPoints":["point 1","point 2","point 3","point 4","point 5","point 6","point 7","point 8","point 9","point 10"],"mustRemember":"most critical concept"}',
  notes: '"notes":{"sections":[{"heading":"Title","overview":"2-3 sentence intro.","content":"Paragraph 1.\\n\\nParagraph 2.\\n\\nParagraph 3.","bullets":["Bullet 1","Bullet 2","Bullet 3","Bullet 4","Bullet 5","Bullet 6"],"keyTerms":[{"term":"term","definition":"def"}],"examples":["Ex 1","Ex 2","Ex 3"],"applications":["App 1","App 2"],"causeEffect":"Analysis.","keyTakeaway":"Key insight."}]}',
  tutor: '"tutor":{"title":"Lesson title","sections":[{"number":1,"heading":"Heading","paragraphs":["Para 1.","Para 2.","Para 3."],"keyTakeaway":"Insight.","thinkAboutIt":"Question?"}]}',
  practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"q","sampleAnswer":"answer"}]},{"type":"multipleChoice","questions":[{"question":"q","options":["A) opt","B) opt","C) opt","D) opt"],"correct":0,"explanation":"why"}]},{"type":"essayPrompt","questions":[{"question":"prompt","sampleAnswer":"outline"}]}]}',
  keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"2-3 sentence definition","importance":"why it matters"}]}',
  studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Title","tasks":["task 1","task 2","task 3","task 4","task 5"],"duration":"45 min","focus":"focus area"}]}',
  solve: '"solve":{"quickAnswer":"answer","stepByStep":[{"step":1,"title":"step","content":"explanation"}],"keyInsight":"insight","examples":["ex 1","ex 2","ex 3"],"commonMistakes":["mistake 1","mistake 2"]}'
};

function buildFileCtx(filesArr, urlsArr) {
  let ctx = '';
  if (filesArr.length) {
    ctx += '\n\nUploaded materials:\n';
    for (const f of filesArr) {
      if (typeof f.textContent === 'string' && f.textContent) ctx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 20000) + '\n';
      else if (!f.imageData) ctx += '\n[File: ' + f.name + ' — no text]\n';
    }
  }
  if (urlsArr && urlsArr.length) { ctx += '\n\nURLs:\n'; for (const u of urlsArr) ctx += '- ' + u + '\n'; }
  return ctx;
}

const handler = async (event) => {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return; }

  const { requestId, topic, modes, files, urls, difficulty } = body;
  if (!requestId) return;

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const store = getStore({ name: 'study-results', siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });

  const modesArr = modes || [];
  const filesArr = files || [];
  const urlsArr = urls || [];
  const difficultyLevel = (difficulty || 'medium').toLowerCase();
  const topicStr = topic || 'the uploaded content';
  const fileCtx = buildFileCtx(filesArr, urlsArr);
  const imageBlocks = filesArr.filter(f => f.imageData && f.mimeType).map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));

  const combinedResults = {};
  let resolvedTopic = topic || 'Study Set';

  async function saveProgress(progress) {
    try { await store.setJSON(requestId, { status: 'processing', progress, partial: { topic: resolvedTopic, results: { ...combinedResults } } }, { ttl: 7200 }); }
    catch (e) { /* ignore */ }
  }

  function makeOAIContent(prompt) {
    return JSON.stringify([...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }]);
  }

  async function callAI(sys, prompt, maxTok) {
    if (anthropicKey) return callClaude(anthropicKey, sys, (fileCtx ? fileCtx + '\n\n' : '') + prompt, maxTok);
    if (openaiKey) return callOpenAI(openaiKey, sys, JSON.parse(makeOAIContent(prompt)), maxTok);
    throw new Error('No AI key');
  }

  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });

    if (!openaiKey && !anthropicKey) {
      await store.setJSON(requestId, { status: 'error', error: 'No API key set (need OPENAI_API_KEY or ANTHROPIC_API_KEY)' }, { ttl: 7200 });
      return;
    }

    const diffInstr = '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '.';

    // ── QUIZ — 5 sequential batches of 10 ────────────────────────────────
    if (modesArr.indexOf('quiz') !== -1) {
      const batches = [
        'Generate 10 multiple-choice questions testing DEFINITIONS AND KEY TERMS.',
        'Generate 10 multiple-choice questions testing HOW THINGS WORK (processes, mechanisms, sequences).',
        'Generate 10 SCENARIO-BASED multiple-choice questions set in real situations.',
        'Generate 10 multiple-choice questions testing CAUSE AND EFFECT relationships.',
        'Generate 10 HARD multiple-choice questions requiring analysis and synthesis of multiple concepts.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Quiz: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + diffInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.quiz + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 4000);
          const items = (r && r.results && r.results.quiz && r.results.quiz.questions) || [];
          all.push(...items);
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* next batch */ }
      }
      if (all.length) combinedResults.quiz = { questions: all };
      await saveProgress('Quiz done — ' + all.length + ' questions');
    }

    // ── FLASHCARDS — 5 sequential batches of 10 ──────────────────────────
    if (modesArr.indexOf('flashcards') !== -1) {
      const batches = [
        'Generate 10 flashcards for KEY TERMS. Front: the term. Back: definition + example.',
        'Generate 10 flashcards for PROCESSES. Front: "How does X work?". Back: step-by-step.',
        'Generate 10 flashcards for CAUSE AND EFFECT. Front: "What causes X?". Back: causal chain.',
        'Generate 10 flashcards COMPARING TWO CONCEPTS. Front: "Difference between X and Y?". Back: comparison.',
        'Generate 10 flashcards for APPLICATIONS. Front: real-world scenario. Back: which concept applies and why.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Flashcards: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.flashcards + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 4000);
          const items = (r && r.results && r.results.flashcards && r.results.flashcards.cards) || [];
          all.push(...items);
        } catch (e) { /* next batch */ }
      }
      if (all.length) combinedResults.flashcards = { cards: all };
      await saveProgress('Flashcards done — ' + all.length + ' cards');
    }

    // ── NOTES — chunked ──────────────────────────────────────────────────
    if (modesArr.indexOf('notes') !== -1) {
      const totalText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
      const CHUNK = 8000;
      const notesQty = '\n\nGenerate 6-10 rich sections, each with: overview, 3 content paragraphs, 6+ bullets, key terms, examples, applications, cause-effect, key takeaway.';
      const chunks = totalText.length > CHUNK ? splitIntoChunks(totalText, CHUNK).slice(0, 12) : null;
      if (chunks) {
        const allSections = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          await saveProgress('Notes: chunk ' + (ci + 1) + ' of ' + chunks.length + '…');
          const prompt = 'Topic: ' + topicStr + '\n\n[Chunk ' + (ci + 1) + ' of ' + chunks.length + ']\n' + chunks[ci] + notesQty + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}';
          try {
            const r = anthropicKey
              ? await callClaude(anthropicKey, SYS_NOTES, prompt, 8000)
              : await callOpenAI(openaiKey, SYS_NOTES, [...imageBlocks, { type: 'text', text: prompt }], 8000);
            if (r && r.results && r.results.notes && r.results.notes.sections) {
              allSections.push(...r.results.notes.sections);
              if (r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
            }
          } catch (e) { /* continue */ }
        }
        if (allSections.length) combinedResults.notes = { sections: allSections };
      } else {
        await saveProgress('Generating notes…');
        const prompt = 'Topic: ' + topicStr + notesQty + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}';
        try {
          const r = await callAI(SYS_NOTES, prompt, 8000);
          if (r && r.results && r.results.notes) combinedResults.notes = r.results.notes;
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* missing */ }
      }
      await saveProgress('Notes done');
    }

    // ── OTHER MODES — sequential, one at a time ───────────────────────────
    const remaining = modesArr.filter(m => m !== 'quiz' && m !== 'flashcards' && m !== 'notes');
    for (const mode of remaining) {
      await saveProgress('Generating ' + mode + '…');
      const structure = MODE_MAP[mode] || ('"' + mode + '":{"content":"study content"}');
      const dInstr = ['practicetest', 'fitb'].indexOf(mode) !== -1 ? diffInstr : '';
      const prompt = 'Topic: ' + topicStr + '\n\nGenerate comprehensive ' + mode + ' content.' + dInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + structure + '\n  }\n}';
      try {
        const r = await callAI(SYS_OTHER, prompt, 6000);
        if (r && r.results) Object.assign(combinedResults, r.results);
        if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
      } catch (e) { /* skip */ }
      await saveProgress(mode + ' done');
    }

    await store.setJSON(requestId, { status: 'done', data: { topic: resolvedTopic, results: combinedResults } }, { ttl: 7200 });

  } catch (err) {
    try { await store.setJSON(requestId, { status: 'error', error: err.message }, { ttl: 7200 }); } catch (e2) { /* ignore */ }
  }
};

module.exports = { handler };
