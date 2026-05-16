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
    const tid = setTimeout(() => controller.abort(), 55000);
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent) }]
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
    const tid = setTimeout(() => controller.abort(), 55000);
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
    } catch (e) { clearTimeout(tid); if (attempt < 2) { await sleep(8000 * (attempt + 1)); continue; } throw e; }
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
      catch (e2) { throw new Error('Claude JSON parse failed'); }
    }
  }
}

const SYS_NOTES = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate COMPREHENSIVE textbook-quality notes. Every section must have a detailed overview paragraph, 3 full content paragraphs, 8+ detailed bullets, key terms with definitions, concrete examples, real-world applications, cause-effect analysis, and a key takeaway. Never summarise — expand every point fully.';
const SYS_BATCH = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate EXACTLY the number of items specified — no more, no fewer. Every item must be fully complete with thorough explanations. Do not stop early or truncate.';
const SYS_TUTOR = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate a detailed, comprehensive lesson that teaches from first principles. Explain every concept step-by-step assuming no prior knowledge. Include concrete examples, analogies, real-world applications, and connections between ideas.';
const SYS_OTHER = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks. Generate rich comprehensive content. Be thorough and detailed — quantity and quality both matter. Never truncate.';

const MODE_MAP = {
  flashcards: '"flashcards":{"cards":[{"front":"question or term","back":"thorough answer or definition with full context and example","difficulty":"easy|medium|hard"}]}',
  quiz: '"quiz":{"questions":[{"question":"full question text","options":["A) first option","B) second option","C) third option","D) fourth option"],"correct":0,"explanation":"explain why correct AND why each wrong option is wrong","difficulty":"Easy|Medium|Hard"}]}',
  fitb: '"fitb":{"sentences":[{"text":"The ___ does ___ which results in ___.","blanks":["term1","term2","term3"]}]}',
  summary: '"summary":{"overview":"6-8 sentence comprehensive overview covering all main ideas","keyPoints":["Detailed key point 1 — include full context","Detailed key point 2","Detailed key point 3","Detailed key point 4","Detailed key point 5","Detailed key point 6","Detailed key point 7","Detailed key point 8","Detailed key point 9","Detailed key point 10","Detailed key point 11","Detailed key point 12"],"mustRemember":"the single most critical concept to understand"}',
  notes: '"notes":{"sections":[{"heading":"Section Title","overview":"2-3 sentence intro paragraph.","content":"Full paragraph 1.\\n\\nFull paragraph 2.\\n\\nFull paragraph 3.","bullets":["Detailed bullet 1 with full explanation","Detailed bullet 2","Detailed bullet 3","Detailed bullet 4","Detailed bullet 5","Detailed bullet 6","Detailed bullet 7","Detailed bullet 8"],"keyTerms":[{"term":"term","definition":"complete definition"}],"examples":["Detailed example 1","Detailed example 2","Detailed example 3"],"applications":["Real-world application 1","Real-world application 2"],"causeEffect":"Analysis of cause and effect relationships in this section.","keyTakeaway":"The most important insight from this section."}]}',
  tutor: '"tutor":{"title":"Complete Lesson Title","sections":[{"number":1,"heading":"Specific heading","definitions":[{"term":"key term","definition":"clear definition a beginner understands"}],"paragraphs":["Step-by-step explanation paragraph 1 — define the concept, no prior knowledge assumed.","Expansion paragraph — sub-concepts, misconceptions, how parts connect.","Depth paragraph — nuance, edge cases, further elaboration."],"examples":["Detailed example 1 — walk through step by step","Detailed example 2 — different context to reinforce understanding"],"keyTakeaway":"Most important thing to remember from this section.","thinkAboutIt":"Reflective question connecting to the bigger picture."}],"realWorldApplication":"Specific, concrete real-world scenario showing how this topic applies in practice.","summary":"Thorough summary covering every major point — what was taught, why it matters, how concepts connect.","quiz":[{"question":"Application or analysis question","answer":"Complete well-explained answer"},{"question":"Scenario-based question","answer":"Complete well-explained answer"},{"question":"Comparison or synthesis question","answer":"Complete well-explained answer"}]}',
  practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"Higher-order question requiring real understanding","sampleAnswer":"Comprehensive model answer explaining reasoning fully"}]},{"type":"multipleChoice","questions":[{"question":"Scenario or application question","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"why correct and why others wrong"}]},{"type":"essayPrompt","questions":[{"question":"Essay prompt requiring analysis and argument","sampleAnswer":"Full outline: thesis, body points, evidence, conclusion"}]}]}',
  keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"2-3 sentence complete definition with context","importance":"why this matters and how it connects to other concepts"}]}',
  studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Topic focus","tasks":["Specific task 1","Specific task 2","Specific task 3","Specific task 4","Specific task 5"],"duration":"45 min","focus":"What to master today"}]}',
  solve: '"solve":{"quickAnswer":"direct complete answer","stepByStep":[{"step":1,"title":"Step title","content":"Thorough explanation of this step"}],"keyInsight":"Most important insight","examples":["Concrete example 1 with full walkthrough","Concrete example 2","Concrete example 3"],"commonMistakes":["Common mistake 1 and how to avoid it","Common mistake 2"]}'
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

  async function callAI(sys, prompt, maxTok) {
    if (anthropicKey) return callClaude(anthropicKey, sys, (fileCtx ? fileCtx + '\n\n' : '') + prompt, maxTok);
    if (openaiKey) {
      const msgs = [...imageBlocks, ...(fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : []), { type: 'text', text: prompt }];
      return callOpenAI(openaiKey, sys, msgs, maxTok);
    }
    throw new Error('No AI key');
  }

  try {
    await store.setJSON(requestId, { status: 'processing', progress: 'Starting…' }, { ttl: 7200 });

    if (!openaiKey && !anthropicKey) {
      await store.setJSON(requestId, { status: 'error', error: 'No API key set (need OPENAI_API_KEY or ANTHROPIC_API_KEY)' }, { ttl: 7200 });
      return;
    }

    const diffInstr = '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. Match every question to this level.';

    // ── QUIZ — 8 sequential batches of 10 = 80 questions ─────────────────
    if (modesArr.indexOf('quiz') !== -1) {
      const batches = [
        'Generate 10 multiple-choice questions testing DEFINITIONS AND KEY TERMS. Each must have 4 clear options with one unambiguously correct answer.',
        'Generate 10 multiple-choice questions testing HOW THINGS WORK — processes, mechanisms, sequences, and systems.',
        'Generate 10 SCENARIO-BASED multiple-choice questions. Present real situations and ask students to identify the concept, explain what happens, or predict the outcome.',
        'Generate 10 multiple-choice questions testing CAUSE AND EFFECT. Ask what leads to X, what results from Y, or what would change if Z were different.',
        'Generate 10 COMPARISON multiple-choice questions. Ask students to distinguish between two similar concepts, identify which applies to a situation, or pick the best example.',
        'Generate 10 HARD multiple-choice questions requiring analysis and synthesis. Students must combine multiple concepts, evaluate arguments, or apply knowledge to novel situations.',
        'Generate 10 APPLICATION multiple-choice questions. Give students a real-world problem and ask which concept, formula, or principle applies and how.',
        'Generate 10 CRITICAL THINKING multiple-choice questions. Ask students to evaluate claims, identify flaws, or choose the strongest explanation for a phenomenon.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Quiz: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + diffInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.quiz + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 5000);
          const items = (r && r.results && r.results.quiz && r.results.quiz.questions) || [];
          all.push(...items);
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* next batch */ }
      }
      if (all.length) combinedResults.quiz = { questions: all };
      await saveProgress('Quiz done — ' + all.length + ' questions');
    }

    // ── FLASHCARDS — 8 sequential batches of 10 = 80 cards ───────────────
    if (modesArr.indexOf('flashcards') !== -1) {
      const batches = [
        'Generate 10 flashcards for KEY TERMS AND DEFINITIONS. Front: the term or concept. Back: full definition with context and an example showing it in use.',
        'Generate 10 flashcards for PROCESSES AND MECHANISMS. Front: "How does X work?" or "What is the sequence of X?". Back: complete step-by-step explanation.',
        'Generate 10 flashcards for CAUSE AND EFFECT. Front: "What causes X?" or "What happens when Y occurs?". Back: full causal chain with explanation.',
        'Generate 10 COMPARISON flashcards. Front: "What is the difference between X and Y?" or "Compare X and Y". Back: clear contrast with key distinguishing features.',
        'Generate 10 APPLICATION flashcards. Front: a real-world scenario or problem. Back: which concept applies, why it applies, and how to use it.',
        'Generate 10 EXAMPLE-BASED flashcards. Front: give a real-world example and ask which concept it illustrates. Back: the concept + explanation of why this example fits.',
        'Generate 10 PROBLEM-SOLVING flashcards. Front: a question requiring calculation, prediction, or logical reasoning. Back: full worked solution with explanation.',
        'Generate 10 SYNTHESIS flashcards. Front: a question connecting two or more concepts ("How does X relate to Y?" or "Why does understanding X require knowing Y?"). Back: thorough explanation of the connection.',
      ];
      const all = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Flashcards: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.flashcards + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 5000);
          const items = (r && r.results && r.results.flashcards && r.results.flashcards.cards) || [];
          all.push(...items);
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* next batch */ }
      }
      if (all.length) combinedResults.flashcards = { cards: all };
      await saveProgress('Flashcards done — ' + all.length + ' cards');
    }

    // ── NOTES — chunked, textbook-depth ──────────────────────────────────
    if (modesArr.indexOf('notes') !== -1) {
      const totalText = filesArr.filter(f => f.textContent).map(f => f.textContent || '').join('\n\n');
      const CHUNK = 8000;
      const notesQty = '\n\nGenerate 8-12 rich sections. Each section MUST have: a 2-3 sentence overview, 3 full paragraphs of content (4-6 sentences each), 8+ detailed bullets, 3-5 key terms with definitions, 3 concrete examples, 2 real-world applications, cause-effect analysis, and a key takeaway. Write at textbook depth — never summarise.';
      const chunks = totalText.length > CHUNK ? splitIntoChunks(totalText, CHUNK).slice(0, 12) : null;
      if (chunks) {
        const allSections = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          await saveProgress('Notes: chunk ' + (ci + 1) + ' of ' + chunks.length + '…');
          const prompt = 'Topic: ' + topicStr + '\n\n[Chunk ' + (ci + 1) + ' of ' + chunks.length + ']\n' + chunks[ci] + notesQty + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.notes + '\n  }\n}';
          try {
            const r = anthropicKey
              ? await callClaude(anthropicKey, SYS_NOTES, prompt, 10000)
              : await callOpenAI(openaiKey, SYS_NOTES, [...imageBlocks, { type: 'text', text: prompt }], 10000);
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
          const r = await callAI(SYS_NOTES, prompt, 10000);
          if (r && r.results && r.results.notes) combinedResults.notes = r.results.notes;
          if (r && r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        } catch (e) { /* missing */ }
      }
      await saveProgress('Notes done');
    }

    // ── FILL IN THE BLANKS — 3 batches of 10 = 30 sentences ──────────────
    if (modesArr.indexOf('fitb') !== -1) {
      const batches = [
        'Generate 10 fill-in-the-blank sentences testing KEY TERMS AND DEFINITIONS. Each sentence must have 2-3 blanks and test whether students know the correct vocabulary.',
        'Generate 10 fill-in-the-blank sentences testing PROCESSES AND SEQUENCES. Each sentence describes a process with 2-3 critical blanks for steps, results, or mechanisms.',
        'Generate 10 fill-in-the-blank sentences testing CAUSE AND EFFECT AND RELATIONSHIPS. Each sentence must have 2-3 blanks that require understanding how concepts connect.',
      ];
      const allSentences = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Fill in the blanks: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + diffInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.fitb + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 4000);
          const items = (r && r.results && r.results.fitb && r.results.fitb.sentences) || [];
          allSentences.push(...items);
        } catch (e) { /* next batch */ }
      }
      if (allSentences.length) combinedResults.fitb = { sentences: allSentences };
      await saveProgress('Fill in the blanks done — ' + allSentences.length + ' sentences');
    }

    // ── KEY CONCEPTS — 3 batches of 10 = 30 terms ────────────────────────
    if (modesArr.indexOf('keyconcepts') !== -1) {
      const batches = [
        'Generate 10 key concepts: the CORE FOUNDATIONAL TERMS that students must know first to understand this topic.',
        'Generate 10 key concepts: INTERMEDIATE TERMS that build on the fundamentals — processes, systems, relationships.',
        'Generate 10 key concepts: ADVANCED TERMS — nuanced concepts, connections between ideas, and application-level vocabulary.',
      ];
      const allConcepts = [];
      for (let i = 0; i < batches.length; i++) {
        await saveProgress('Key concepts: set ' + (i + 1) + ' of ' + batches.length + '…');
        const prompt = 'Topic: ' + topicStr + '\n\n' + batches[i] + '\n\nFor each concept include a 2-3 sentence definition AND explain why it matters and how it connects to other concepts.\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.keyconcepts + '\n  }\n}';
        try {
          const r = await callAI(SYS_BATCH, prompt, 5000);
          const items = (r && r.results && r.results.keyconcepts && r.results.keyconcepts.concepts) || [];
          allConcepts.push(...items);
        } catch (e) { /* next batch */ }
      }
      if (allConcepts.length) combinedResults.keyconcepts = { concepts: allConcepts };
      await saveProgress('Key concepts done — ' + allConcepts.length + ' terms');
    }

    // ── TUTOR — 2 batches merged into one comprehensive lesson ────────────
    if (modesArr.indexOf('tutor') !== -1) {
      await saveProgress('Generating tutor lesson part 1…');
      const tutorInstr = '\n\nTUTOR RULES: Teach from first principles assuming zero prior knowledge. (1) Define EVERY term before using it. (2) Give 2+ concrete examples per section. (3) Explain the WHY behind every concept. (4) Write 3 full paragraphs per section. (5) Connect each section to the next. Depth over brevity.';
      const prompt1 = 'Topic: ' + topicStr + '\n\nGenerate the FIRST HALF of a comprehensive tutor lesson — cover the foundational concepts, definitions, and core mechanisms.' + tutorInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.tutor + '\n  }\n}';
      const prompt2 = 'Topic: ' + topicStr + '\n\nGenerate the SECOND HALF of a comprehensive tutor lesson — cover advanced concepts, applications, connections, and synthesis.' + tutorInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.tutor + '\n  }\n}';
      try {
        const r1 = await callAI(SYS_TUTOR, prompt1, 10000);
        if (r1 && r1.results && r1.results.tutor) {
          combinedResults.tutor = r1.results.tutor;
          if (r1.topic && r1.topic !== 'the uploaded content') resolvedTopic = r1.topic;
        }
        await saveProgress('Generating tutor lesson part 2…');
        const r2 = await callAI(SYS_TUTOR, prompt2, 10000);
        if (r2 && r2.results && r2.results.tutor && r2.results.tutor.sections) {
          if (combinedResults.tutor && combinedResults.tutor.sections) {
            combinedResults.tutor.sections = combinedResults.tutor.sections.concat(r2.results.tutor.sections);
          }
        }
      } catch (e) { /* missing */ }
      await saveProgress('Tutor done');
    }

    // ── PRACTICE TEST — 2 batches for depth ──────────────────────────────
    if (modesArr.indexOf('practicetest') !== -1) {
      await saveProgress('Generating practice test part 1…');
      const ptInstr = '\n\nGenerate a comprehensive practice test. Short answer questions should require 3-5 sentence answers. Multiple choice should have 4 options with full explanations. Essay prompts should require argument, evidence, and analysis.' + diffInstr;
      const prompt1 = 'Topic: ' + topicStr + '\n\nGenerate PART 1 of a practice test — focus on FOUNDATIONAL AND PROCEDURAL knowledge.' + ptInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.practicetest + '\n  }\n}';
      try {
        const r = await callAI(SYS_OTHER, prompt1, 8000);
        if (r && r.results && r.results.practicetest) {
          combinedResults.practicetest = r.results.practicetest;
          if (r.topic && r.topic !== 'the uploaded content') resolvedTopic = r.topic;
        }
      } catch (e) { /* missing */ }
      await saveProgress('Generating practice test part 2…');
      const prompt2 = 'Topic: ' + topicStr + '\n\nGenerate PART 2 of a practice test — focus on APPLICATION, ANALYSIS, and SYNTHESIS.' + ptInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + MODE_MAP.practicetest + '\n  }\n}';
      try {
        const r = await callAI(SYS_OTHER, prompt2, 8000);
        if (r && r.results && r.results.practicetest) {
          if (!combinedResults.practicetest) {
            combinedResults.practicetest = r.results.practicetest;
          } else {
            for (const section of (r.results.practicetest.sections || [])) {
              combinedResults.practicetest.sections = (combinedResults.practicetest.sections || []).concat([section]);
            }
          }
        }
      } catch (e) { /* missing */ }
      await saveProgress('Practice test done');
    }

    // ── REMAINING MODES — sequential, generous token budget ──────────────
    const remaining = modesArr.filter(m => !['quiz','flashcards','notes','fitb','keyconcepts','tutor','practicetest'].includes(m));
    for (const mode of remaining) {
      await saveProgress('Generating ' + mode + '…');
      const structure = MODE_MAP[mode] || ('"' + mode + '":{"content":"study content"}');
      const dInstr = ['fitb'].indexOf(mode) !== -1 ? diffInstr : '';
      const prompt = 'Topic: ' + topicStr + '\n\nGenerate comprehensive, detailed ' + mode + ' content. Be thorough — include everything a student needs.' + dInstr + '\n\nReturn JSON:\n{\n  "topic": "name",\n  "results": {\n    ' + structure + '\n  }\n}';
      try {
        const r = await callAI(SYS_OTHER, prompt, 8000);
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
