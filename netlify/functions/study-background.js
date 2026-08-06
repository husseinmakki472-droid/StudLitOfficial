// Netlify Background Function — 15 min limit, always returns 202 immediately.
// Frontend polls study-status.js every 3s for results stored in Netlify Blobs.

const { getStore } = require('@netlify/blobs');
const { originAllowed, rateLimit } = require('./lib/guard');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Only pass siteID/token when BOTH are actually set — passing them as undefined
// puts @netlify/blobs into manual mode with no credentials instead of letting it
// auto-configure from the Netlify Functions runtime.
function studyStore() {
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_TOKEN;
  const opts = { name: 'study-results' };
  if (siteID && token) { opts.siteID = siteID; opts.token = token; }
  return getStore(opts);
}

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
  let current = '';

  function flush() {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  }

  function addPiece(piece) {
    if (piece.length > size) {
      flush();
      for (let i = 0; i < piece.length; i += size) chunks.push(piece.slice(i, i + size).trim());
      return;
    }
    if (current.length + piece.length + 2 > size && current.length > 0) flush();
    current += (current ? '\n\n' : '') + piece;
  }

  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    if (para.length <= size) {
      addPiece(para);
    } else {
      // Paragraph itself exceeds the cap — fall back to sentence boundaries.
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) addPiece(sentence);
    }
  }
  flush();
  return chunks.length ? chunks : [text.slice(0, size)];
}

// Bounded worker pool. Independent model calls were running strictly one after
// another, which is what made a full generation take many minutes — the wall
// time was the sum of every request rather than the longest few. Concurrency is
// deliberately small so a burst doesn't trip OpenAI's per-minute rate limits.
async function runPool(total, concurrency, task) {
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) return;
      await task(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
}

// Bound how many chunks of a document we spend model calls on. Unbounded, a
// long upload turns one click into hundreds of paid requests.
//
// Sampled evenly rather than sliced from the front: taking the first N chunks
// of a textbook means every card comes from chapter one and the rest of the
// book is silently ignored. Even sampling keeps coverage across the whole
// document at the same cost.
function capChunks(chunks, max) {
  if (chunks.length <= max) return chunks;
  const out = [];
  const step = chunks.length / max;
  for (let i = 0; i < max; i++) out.push(chunks[Math.floor(i * step)]);
  return out;
}

function dedupeFlashcards(cards) {
  const normalize = s => (s || '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  const byFront = new Map();
  for (const card of cards) {
    const key = normalize(card.front);
    const existing = byFront.get(key);
    if (!existing || (card.back || '').length > (existing.back || '').length) byFront.set(key, card);
  }
  return Array.from(byFront.values());
}

// These modes need the stronger model — matches the split study.js has always
// used. Everything else stays on mini.
const GPT4O_MODES = new Set(['quiz', 'solve', 'tutor', 'practicetest']);
function modelFor(mode) { return GPT4O_MODES.has(mode) ? 'gpt-4o' : 'gpt-4o-mini'; }

async function callOpenAI(apiKey, systemPrompt, userContent, maxTokens, model) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 50000);
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.4,
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
  for (let attempt = 0; attempt < 3; attempt++) {
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
    } catch (fetchErr) {
      clearTimeout(tid);
      if (attempt < 2) { await sleep(8000 * (attempt + 1)); continue; }
      throw fetchErr;
    }
    clearTimeout(tid);
    if (response.status === 429) {
      const wait = Math.max(15000, parseInt(response.headers.get('retry-after') || '15', 10) * 1000);
      if (attempt < 2) { await sleep(wait); continue; }
      throw new Error('Claude rate limited');
    }
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
      catch (e2) {
        if (attempt < 2) continue;
        throw new Error('Claude JSON parse failed');
      }
    }
  }
}

// Shared StudLit AI identity + pedagogy layer. These calls run in JSON mode, so
// the markdown output rules from the chat prompt do not apply here.
const STUDLIT_CORE = [
  'You are StudLit AI, the tutor and content engine inside StudLit — an AI study platform focused on making studying feel like a game, not a chore.',
  '- Default to depth over brevity — comprehensive output, never a short summary.',
  '- Every explanation covers: plain-language definition, why it matters, a concrete example, and a common misconception students have about it.',
  '- Extract MORE distinct concepts than the minimum asked for — cover the material exhaustively rather than hitting a round number.',
  '- Escalate questions through Bloom\'s Taxonomy (remember → understand → apply → analyze → evaluate → create) rather than staying flat.',
  '- Tag every question/flashcard with a difficulty level and a topic/subtopic label so the app can track progress per-concept.',
  '- Never pad with filler. If the material is thin or ambiguous, say so in the content rather than inventing facts.',
  'Return ONLY valid JSON — no markdown, no backticks, no prose outside the JSON.'
].join('\n');

const SYS_NOTES = STUDLIT_CORE + '\nGenerate COMPREHENSIVE textbook-quality notes. Expand every concept fully with examples, mechanisms, cause-effect, and key takeaways. Never summarise.';
const SYS_BATCH = STUDLIT_CORE + '\nGenerate EXACTLY the number of items specified. Every item must be fully complete. Do not stop early.';
const SYS_OTHER = STUDLIT_CORE + '\nGenerate rich comprehensive content with detailed explanations.';
const SYS_REVIEW = STUDLIT_CORE + '\nOnly generate flashcards for concepts that are genuinely missing from the existing set. It is correct and expected to return zero cards if everything important is already covered. Every item you do generate must be fully complete.';

// Explicit floors per mode. Without these the model decides how much to make
// and consistently under-delivers — "generate comprehensive X content" is not
// an instruction it can act on. Ported from the study.js system prompt, which
// is where these numbers were already proven.
const MODE_QTY = {
  summary:      'Write an overview of 6-8 full sentences covering every main idea, then AT LEAST 12 keyPoints — one per major concept in the material, each a complete explanatory sentence rather than a fragment. Then the single mustRemember insight.',
  tutor:        'Produce AT LEAST 8 sections, one per major concept. Every section needs: 3 substantial paragraphs (not one-liners), 2+ defined key terms, 2+ worked examples, a keyTakeaway, and a thinkAboutIt question. Teach a complete beginner — never skip steps.',
  practicetest: 'Produce three sections — shortAnswer, multipleChoice and essayPrompt — with AT LEAST 6 questions in each. Every question needs a full sampleAnswer that models what a strong student response looks like, not a one-line hint.',
  fitb:         'Produce AT LEAST 20 fill-in-the-blank sentences. Each sentence needs 2-3 blanks and must be substantial enough to test real understanding, not a trivial one-word gap.',
  keyconcepts:  'Produce AT LEAST 20 concepts. Each needs a complete 2-3 sentence definition and an importance field explaining why it matters and how it connects to the other concepts.',
  studyplan:    'Produce all 7 days. Each day needs 4-5 specific, actionable tasks naming the actual topics being studied — never generic filler like "review notes" — plus a duration and a focus area.',
  solve:        'Give the quickAnswer, then AT LEAST 5 stepByStep entries walking through the full reasoning, the keyInsight, 3 worked examples, and 2+ commonMistakes students make on this type of problem.'
};

const MODE_MAP = {
  flashcards: '"flashcards":{"cards":[{"front":"question or term","back":"thorough answer or definition with context","difficulty":"easy|medium|hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"major topic this card belongs to — reuse the SAME label across every card on that topic","subtopic":"specific sub-concept within that topic"}]}',
  quiz: '"quiz":{"questions":[{"question":"full question","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct and why others are wrong","difficulty":"Easy|Medium|Hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"major topic this question belongs to — reuse the SAME label across every question on that topic","subtopic":"specific sub-concept within that topic"}]}',
  fitb: '"fitb":{"sentences":[{"text":"The ___ does ___ which results in ___.","blanks":["term1","term2","term3"]}]}',
  summary: '"summary":{"overview":"4-6 sentence overview","keyPoints":["point 1","point 2","point 3","point 4","point 5","point 6","point 7","point 8","point 9","point 10"],"mustRemember":"most critical concept"}',
  notes: '"notes":{"sections":[{"heading":"Title","overview":"2-3 sentence intro.","content":"Paragraph 1.\\n\\nParagraph 2.\\n\\nParagraph 3.","bullets":["Bullet 1","Bullet 2","Bullet 3","Bullet 4","Bullet 5","Bullet 6"],"keyTerms":[{"term":"term","definition":"def"}],"examples":["Ex 1","Ex 2","Ex 3"],"applications":["App 1","App 2"],"causeEffect":"Analysis.","keyTakeaway":"Key insight."}]}',
  tutor: '"tutor":{"title":"Lesson title","sections":[{"number":1,"heading":"Heading","paragraphs":["Para 1.","Para 2.","Para 3."],"keyTakeaway":"Insight.","thinkAboutIt":"Question?"}]}',
  practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"q","sampleAnswer":"answer"}]},{"type":"multipleChoice","questions":[{"question":"q","options":["A) opt","B) opt","C) opt","D) opt"],"correct":0,"explanation":"why","sampleAnswer":"the correct option restated in full, followed by why it is right and why the others are wrong"}]},{"type":"essayPrompt","questions":[{"question":"prompt","sampleAnswer":"outline"}]}]}',
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

  const { requestId, topic, modes, files, urls, difficulty, language } = body;
  if (!requestId) return;

  // Netlify answers a background invocation with 202 before this runs, so a
  // rejection can't be returned to the caller — it has to be written where the
  // status poller will find it. Bailing out here is what stops the model calls.
  // Proves in the Netlify function log that the job was actually invoked.
  console.log(JSON.stringify({ event: 'study_bg_start', requestId, modes: modes || [] }));

  // getStore throws outright when Blobs isn't configured for the site. This used
  // to be an unguarded call, so the handler died here without writing anything —
  // the page then polled a permanently 'pending' status for 14 minutes with no
  // error to show. Nothing can be reported through the store when the store
  // itself is the failure, so log it loudly; the client watchdog handles the UI.
  let store;
  try {
    store = studyStore();
  } catch (e) {
    console.error(JSON.stringify({
      event: 'blob_store_unavailable', requestId, error: e.message,
      hint: 'Enable Netlify Blobs for this site, or set SITE_ID and NETLIFY_TOKEN.'
    }));
    return;
  }

  async function reject(message) {
    try { await store.setJSON(requestId, { status: 'error', error: message }, { ttl: 7200 }); }
    catch (e) { console.error(JSON.stringify({ event: 'blob_write_failed', requestId, error: e.message })); }
  }

  // Claim the job immediately. If this write fails the store is unusable, and
  // it's better to bail now than to spend money on a job nobody can collect.
  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });
  } catch (e) {
    console.error(JSON.stringify({ event: 'blob_write_failed', requestId, error: e.message }));
    return;
  }

  if (!originAllowed(event).ok) {
    await reject('Requests are not allowed from this origin.');
    return;
  }
  // Matches the synchronous endpoint's budget: 5 generations per IP per hour.
  const rl = rateLimit(event, 'study', 5, 60 * 60 * 1000);
  if (rl.limited) {
    const mins = Math.max(1, Math.ceil(rl.retryAfter / 60));
    await reject('You have hit the usage limit. Try again in about ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.');
    return;
  }
  const filesIn = Array.isArray(files) ? files : [];
  if (filesIn.length > 10) {
    await reject('Too many files at once. Upload up to 10.');
    return;
  }

  const langInstr = (language && language !== 'English')
    ? '\nLANGUAGE: You MUST write ALL output — every word of every field — in ' + language + '. Do not use English.'
    : '';
  const sysWithLang = s => s + langInstr;

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const modesArr = modes || [];
  const filesArr = files || [];
  const urlsArr = urls || [];
  const difficultyLevel = (difficulty || 'medium').toLowerCase();
  const topicStr = topic || 'the uploaded content';
  const fileCtx = buildFileCtx(filesArr, urlsArr);
  const imageBlocks = filesArr.filter(f => f.imageData && f.mimeType).map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));

  const fullText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
  // 20 chunks is roughly 160k characters and up to ~280 cards — generous for a
  // real study set, and a hard ceiling on what one click can cost.
  const MAX_DOC_CHUNKS = 20;
  const allDocChunks = splitIntoChunks(fullText, 8000);
  const docChunks = capChunks(allDocChunks, MAX_DOC_CHUNKS);

  const combinedResults = {};
  let resolvedTopic = topic || 'Study Set';
  let flashcardMeta = null;

  async function saveProgress(progress, meta) {
    try { await store.setJSON(requestId, { status: 'processing', progress, partial: { topic: resolvedTopic, results: { ...combinedResults } }, ...(meta || {}) }, { ttl: 7200 }); }
    catch (e) { /* ignore */ }
  }

  function makeOAIContent(prompt) {
    return JSON.stringify([...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }]);
  }

  // Provider choice, in priority order:
  //   1. OpenAI, with the per-mode gpt-4o/mini split — the default whenever an
  //      OpenAI key exists.
  //   2. Claude, only for modes explicitly named in CLAUDE_MODES.
  //   3. Claude for everything, only when there is NO OpenAI key at all.
  // Previously the mere presence of ANTHROPIC_API_KEY silently routed every
  // mode to Claude and bypassed modelFor() entirely, so setting the key "just
  // in case" quietly downgraded quiz, tutor, practicetest and solve.
  const claudeModes = new Set(
    (process.env.CLAUDE_MODES || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  function useClaudeFor(mode) {
    if (!anthropicKey) return false;
    if (!openaiKey) return true;
    return claudeModes.has(mode);
  }

  async function callAI(sys, prompt, maxTok, mode) {
    if (useClaudeFor(mode)) return callClaude(anthropicKey, sys, (fileCtx ? fileCtx + '\n\n' : '') + prompt, maxTok);
    if (openaiKey) return callOpenAI(openaiKey, sys, JSON.parse(makeOAIContent(prompt)), maxTok, modelFor(mode));
    if (anthropicKey) return callClaude(anthropicKey, sys, (fileCtx ? fileCtx + '\n\n' : '') + prompt, maxTok);
    throw new Error('No AI key');
  }

  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });

    if (!openaiKey && !anthropicKey) {
      await store.setJSON(requestId, { status: 'error', error: 'No API key set (need OPENAI_API_KEY or ANTHROPIC_API_KEY)' }, { ttl: 7200 });
      return;
    }

    const diffInstr = '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '.';

    // ── QUIZ — 5 themed batches of 10, run concurrently ──────────────────
    if (modesArr.indexOf('quiz') !== -1) {
      const batches = [
        'Generate 10 multiple-choice questions testing DEFINITIONS AND KEY TERMS.',
        'Generate 10 multiple-choice questions testing HOW THINGS WORK (processes, mechanisms, sequences).',
        'Generate 10 SCENARIO-BASED multiple-choice questions set in real situations.',
        'Generate 10 multiple-choice questions testing CAUSE AND EFFECT relationships.',
        'Generate 10 HARD multiple-choice questions requiring analysis and synthesis of multiple concepts.',
      ];
      // Indexed results so concurrency doesn't scramble easy→hard ordering.
      const slots = new Array(batches.length);
      let qDone = 0;
      await runPool(batches.length, 3, async function (i) {
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + diffInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.quiz + '\n  }\n}';
        try {
          // 6k not 4k: each question now carries options, a full explanation,
          // and the topic/subtopic/bloom tags, and a truncated batch is lost.
          const r = await callAI(sysWithLang(SYS_BATCH), prompt, 6000, 'quiz');
          slots[i] = (r && r.results && r.results.quiz && r.results.quiz.questions) || [];
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { slots[i] = []; }
        qDone++;
        // Publish after every batch so the page can show questions early.
        const sofar = [];
        for (let k = 0; k < slots.length; k++) if (slots[k]) sofar.push(...slots[k]);
        if (sofar.length) combinedResults.quiz = { questions: sofar };
        await saveProgress('Quiz: ' + qDone + ' of ' + batches.length + ' sets done…');
      });
      const all = [];
      for (let k = 0; k < slots.length; k++) if (slots[k]) all.push(...slots[k]);
      if (all.length) combinedResults.quiz = { questions: all };
      await saveProgress('Quiz done — ' + all.length + ' questions');
    }

    // ── FLASHCARDS — chunked over document, or themed batches without one ──
    if (modesArr.indexOf('flashcards') !== -1) {
      const hasText = fullText.trim().length > 0;

      // With no uploaded document there is nothing to chunk: splitIntoChunks('')
      // returns a single empty chunk, so the old path asked for "6-12 cards
      // based ONLY on this chunk" once and returned a dozen cards for a typed
      // topic. Fall back to themed batches — the same technique the quiz path
      // uses to reach 50 questions.
      const FLASHCARD_THEMES = [
        'core definitions and the key terms a student must know cold',
        'processes and mechanisms — how each thing actually works, step by step',
        'cause-and-effect relationships between the concepts',
        'comparisons and distinctions between ideas students routinely confuse',
        'real-world applications and worked examples',
        'common misconceptions, exceptions and edge cases',
        'synthesis questions connecting two or more concepts together'
      ];
      const units = hasText
        ? docChunks.map(function (text) { return { chunk: text }; })
        : FLASHCARD_THEMES.map(function (theme) { return { theme: theme }; });

      const deadline = Date.now() + 13 * 60 * 1000;
      let successfulChunks = 0;
      let failedChunks = 0;
      let deadlineHit = false;
      const chunkResults = new Array(units.length);
      let nextIndex = 0;

      async function processChunk(ci) {
        console.log(JSON.stringify({ event: 'flashcard_chunk_attempt', chunk: ci + 1, total: units.length, mode: hasText ? 'document' : 'themed' }));
        const u = units[ci];
        const body = u.chunk !== undefined
          ? '\n\n[Chunk ' + (ci + 1) + ' of ' + units.length + ']\n' + u.chunk +
            '\n\nGenerate 8-14 flashcards based ONLY on this chunk. Mix key terms, processes, cause-effect, comparisons, and applications.'
          : '\n\nGenerate 8-14 flashcards on this topic covering ' + u.theme + '.' +
            '\n\nThis is set ' + (ci + 1) + ' of ' + units.length + ' — cover ONLY that angle so the sets do not overlap.';
        const prompt = 'Topic: ' + topicStr + body +
          '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.flashcards + '\n  }\n}';
        try {
          const r = useClaudeFor('flashcards')
            ? await callClaude(anthropicKey, sysWithLang(SYS_BATCH), prompt, 4000)
            : await callOpenAI(openaiKey, sysWithLang(SYS_BATCH), hasText ? [{ type: 'text', text: prompt }] : [...imageBlocks, { type: 'text', text: prompt }], 4000, modelFor('flashcards'));
          const items = (r && r.results && r.results.flashcards && r.results.flashcards.cards) || [];
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
          successfulChunks++;
          console.log(JSON.stringify({ event: 'flashcard_chunk_success', chunk: ci + 1, total: units.length, cards: items.length }));
          chunkResults[ci] = items;
        } catch (e) {
          failedChunks++;
          console.error(JSON.stringify({ event: 'flashcard_chunk_error', chunk: ci + 1, total: units.length, error: e.message }));
          chunkResults[ci] = [];
        }
        await saveProgress(
          'Flashcards: ' + successfulChunks + '/' + units.length + ' sets done (' + failedChunks + ' failed)…',
          { flashcardStats: { totalChunks: units.length, successfulChunks, failedChunks } }
        );
      }

      await runPool(units.length, 3, async function (ci) {
        if (Date.now() > deadline) { deadlineHit = true; return; }
        await processChunk(ci);
      });

      const allCards = [];
      for (let ci = 0; ci < chunkResults.length; ci++) allCards.push(...(chunkResults[ci] || []));
      const totalCardsBeforeDedupe = allCards.length;

      // Missing-concept review disabled during this reliability pass — it
      // doubles AI calls per document and risks exceeding the 15-min limit.
      const finalCards = dedupeFlashcards(allCards);

      flashcardMeta = { totalChunks: units.length, successfulChunks, failedChunks, totalCardsBeforeDedupe, partial: deadlineHit };

      if (finalCards.length) combinedResults.flashcards = { cards: finalCards };
      await saveProgress(
        'Flashcards done — ' + finalCards.length + ' cards' + (deadlineHit ? ' (partial — time limit reached)' : ''),
        { flashcardStats: flashcardMeta }
      );
    }

    // ── NOTES — chunked ──────────────────────────────────────────────────
    if (modesArr.indexOf('notes') !== -1) {
      const totalText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
      const CHUNK = 8000;
      const notesQty = '\n\nGenerate 6-10 rich sections, each with: overview, 3 content paragraphs, 6+ bullets, key terms, examples, applications, cause-effect, key takeaway.';
      const chunks = totalText.length > CHUNK ? capChunks(splitIntoChunks(totalText, CHUNK), 12) : null;
      if (chunks) {
        const allSections = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          await saveProgress('Notes: chunk ' + (ci + 1) + ' of ' + chunks.length + '…');
          const prompt = 'Topic: ' + topicStr + '\n\n[Chunk ' + (ci + 1) + ' of ' + chunks.length + ']\n' + chunks[ci] + notesQty + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}';
          try {
            const r = useClaudeFor('notes')
              ? await callClaude(anthropicKey, sysWithLang(SYS_NOTES), prompt, 8000)
              : await callOpenAI(openaiKey, sysWithLang(SYS_NOTES), [...imageBlocks, { type: 'text', text: prompt }], 8000, modelFor('notes'));
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
          const r = await callAI(sysWithLang(SYS_NOTES), prompt, 8000, 'notes');
          if (r && r.results && r.results.notes) combinedResults.notes = r.results.notes;
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* missing */ }
      }
      await saveProgress('Notes done');
    }

    // ── OTHER MODES — independent of each other, so run them concurrently ──
    const remaining = modesArr.filter(m => m !== 'quiz' && m !== 'flashcards' && m !== 'notes');
    let rDone = 0;
    await runPool(remaining.length, 3, async function (i) {
      const mode = remaining[i];
      const structure = MODE_MAP[mode] || ('"' + mode + '":{"content":"study content"}');
      const dInstr = ['practicetest', 'fitb'].indexOf(mode) !== -1 ? diffInstr : '';
      const qty = MODE_QTY[mode] ? '\n\nREQUIRED OUTPUT: ' + MODE_QTY[mode] : '';
      const prompt = 'Topic: ' + topicStr + '\n\nGenerate comprehensive ' + mode + ' content.' + qty + dInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + structure + '\n  }\n}';
      try {
        // 10k rather than 6k — these floors ask for materially more than the
        // old budget could hold, and a truncated array loses the whole mode.
        const r = await callAI(sysWithLang(SYS_OTHER), prompt, 10000, mode);
        if (r && r.results) Object.assign(combinedResults, r.results);
        if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
      } catch (e) { /* skip */ }
      rDone++;
      // Each completed mode is published immediately so the page can render it
      // while the rest are still generating.
      await saveProgress(mode + ' done (' + rDone + ' of ' + remaining.length + ')');
    });

    await store.setJSON(requestId, { status: 'done', data: { topic: resolvedTopic, results: combinedResults }, flashcardStats: flashcardMeta || undefined }, { ttl: 7200 });

  } catch (err) {
    try { await store.setJSON(requestId, { status: 'error', error: err.message }, { ttl: 7200 }); } catch (e2) { /* ignore */ }
  }
};

module.exports = { handler };
