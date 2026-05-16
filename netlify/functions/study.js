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

// Modes that require deeper reasoning — use GPT-4o
const GPT4O_MODES = new Set(['quiz', 'solve', 'tutor', 'practicetest']);

const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { topic, modes, files, urls, difficulty, language } = body;
  const difficultyLevel = (difficulty || 'medium').toLowerCase();
  const lang = language || 'English';
  const modesArr = modes || [];
  const filesArr = files || [];
  const urlsArr  = urls  || [];

  if (!topic && !filesArr.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'topic or files required' }) };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  // Route to GPT-4o when any heavy reasoning mode is present
  const useGPT4o = modesArr.some(m => GPT4O_MODES.has(m));
  const model    = useGPT4o ? 'gpt-4o' : 'gpt-4o-mini';

  let fileCtx = '';
  if (filesArr.length) {
    fileCtx += '\n\nUploaded materials:\n';
    for (let i = 0; i < filesArr.length; i++) {
      const f = filesArr[i];
      if (typeof f.textContent === 'string' && f.textContent)
        fileCtx += '\n[File: ' + f.name + ']\n' + f.textContent.slice(0, 18000) + '\n';
      else if (!f.imageData)
        fileCtx += '\n[File: ' + f.name + ' (' + f.type + ') — no text extracted]\n';
    }
  }
  if (urlsArr.length) {
    fileCtx += '\n\nURLs:\n';
    for (let i = 0; i < urlsArr.length; i++) { fileCtx += '- ' + urlsArr[i] + '\n'; }
  }

  const modeList = modesArr.length ? modesArr.join(', ') : 'solve';

  const systemPrompt = `You are StudLit AI, an expert educational content generator. Return ONLY valid JSON — no markdown, no backticks, no extra text.

CONTENT QUALITY STANDARDS:
- Every explanation must be accurate, detailed, and pedagogically sound
- Use concrete examples, real-world analogies, and cause-and-effect reasoning
- Anticipate where students get confused and address it directly
- Connect concepts to real-world applications and broader themes
- All content must be in: ${lang}

QUANTITY MINIMUMS — generate more when the topic warrants it:
- notes: 7 sections, each with a 2-sentence intro paragraph and 5 detailed bullets
- quiz: 10 questions, each with 4 fully-written options and a thorough 2-3 sentence explanation
- flashcards: 15 cards covering all major concepts with detailed backs
- tutor: 5 sections × 3 full paragraphs each, plus definitions, examples, and review quiz
- fitb: 10 sentences targeting different concepts evenly
- keyconcepts: 12 terms with rich 2-3 sentence definitions
- practicetest: 4+ questions per section (short answer + MC + essay)
- studyplan: 7 days with specific daily tasks and goals
- summary: 8 key points plus detailed overview
- solve: full step-by-step with 3 worked examples`;

  // JSON templates — only fields used by the renderers
  const modeMap = {

    flashcards: `"flashcards":{"cards":[
      {"front":"precise concept, term, or question — test one thing","back":"thorough explanation: definition, mechanism, concrete example, and why it matters — 2-3 sentences","difficulty":"medium"},
      {"front":"next concept","back":"explanation with example","difficulty":"easy"}
    ]}`,

    quiz: `"quiz":{"questions":[
      {"question":"complete clearly-worded question testing conceptual understanding — not trivia","options":["A) fully written out option — plausible","B) fully written out option","C) fully written out option","D) fully written out option"],"correct":0,"explanation":"Why A is correct. Why B is wrong. Why C is wrong. Why D is wrong. 2-3 sentences total.","difficulty":"Medium"},
      {"question":"second question","options":["A) option","B) option","C) option","D) option"],"correct":1,"explanation":"explanation","difficulty":"Medium"}
    ]}`,

    fitb: `"fitb":{"sentences":[
      {"text":"The ___ is responsible for ___, which enables ___ to occur efficiently.","blanks":["key term 1","key term 2","key process"]},
      {"text":"When ___ increases, ___ decreases because ___.","blanks":["variable","outcome","mechanism"]}
    ]}`,

    summary: `"summary":{
      "overview":"4-5 sentences covering all major themes, how they connect to each other, and why this topic matters in the broader field or real world.",
      "keyPoints":[
        "Rich detailed point 1 — include the why and the how, not just the what",
        "Detailed point 2 with cause-and-effect reasoning",
        "Point 3 with a concrete example embedded",
        "Point 4 connecting to real-world application",
        "Point 5 — common misconception and the truth",
        "Point 6",
        "Point 7",
        "Point 8"
      ],
      "mustRemember":"The single most critical concept, formula, or principle a student cannot afford to forget — and exactly why it matters."
    }`,

    notes: `"notes":{"sections":[
      {
        "heading":"Descriptive Section Heading",
        "content":"2-3 sentence paragraph establishing why this section matters, how it connects to what came before, and the key question it answers.",
        "bullets":[
          "Detailed bullet — not just a label. Include the explanation, mechanism, or example that makes it meaningful",
          "Detailed bullet 2 explaining a process or concept with cause-and-effect",
          "Detailed bullet 3 with a real-world connection or analogy",
          "Detailed bullet 4 covering a comparison, contrast, or exception",
          "Detailed bullet 5 — application, implication, or key fact to memorise"
        ]
      }
    ]}`,

    tutor: `"tutor":{
      "title":"Complete, Descriptive Lesson Title",
      "sections":[{
        "number":1,
        "heading":"Section Heading",
        "paragraphs":[
          "Opening paragraph: introduce the concept clearly, establish its context in the broader topic, and explain why a student needs to understand it — 3-4 sentences.",
          "Core paragraph: explain the mechanism, process, or idea step by step. Use a concrete worked example to make it tangible. Directly address the most common misconception students have about this — 3-4 sentences.",
          "Application paragraph: show exactly how this concept is applied in practice. Connect it to adjacent concepts, real-world problems, or exam scenarios. Explain what happens when you get it wrong — 3-4 sentences."
        ],
        "definitions":[
          {"term":"key term from this section","definition":"precise, complete definition with context"},
          {"term":"second important term","definition":"definition"}
        ],
        "examples":[
          "Example 1: full concrete description of a real case, showing the concept in action with numbers or names where helpful",
          "Example 2: a contrasting or edge-case scenario that reveals the limits or nuances of the concept"
        ],
        "keyTakeaway":"The one most important insight a student must walk away with from this section — stated as a memorable principle.",
        "thinkAboutIt":"A thought-provoking question that pushes the student to apply or extend what they just learned?"
      }],
      "realWorldApplication":"2-3 sentences describing a compelling, specific real-world scenario where this topic is directly relevant — make it vivid and relatable.",
      "summary":"3-4 sentences recapping the most important ideas across all sections, reinforcing how they connect, and pointing toward what to study next.",
      "quiz":[
        {"question":"Question testing application of a core concept from the lesson","answer":"Complete answer with reasoning — 2 sentences"},
        {"question":"Question testing understanding of a mechanism or process covered","answer":"Complete answer"},
        {"question":"Synthesis question requiring the student to connect two or more sections","answer":"Answer showing the connection"}
      ]
    }`,

    practicetest: `"practicetest":{"sections":[
      {"type":"shortAnswer","questions":[
        {"question":"Short-answer question requiring a 2-4 sentence response — test application, not pure recall","sampleAnswer":"Comprehensive sample answer with specific detail, reasoning, and relevant terminology — 3-5 sentences"},
        {"question":"Second short-answer — test a different aspect of the topic","sampleAnswer":"Comprehensive answer"},
        {"question":"Third short-answer — require analysis or comparison","sampleAnswer":"Comprehensive answer"},
        {"question":"Fourth short-answer — synthesis or evaluation question","sampleAnswer":"Comprehensive answer"}
      ]},
      {"type":"multipleChoice","questions":[
        {"question":"MC question requiring application or analysis — not pure recall","options":["A) plausible option — complete sentence","B) plausible option","C) plausible option","D) plausible option"],"correct":0,"explanation":"Why A is correct. Why B, C, and D are plausible but wrong."},
        {"question":"Second MC","options":["A) option","B) option","C) option","D) option"],"correct":1,"explanation":"explanation"},
        {"question":"Third MC","options":["A) option","B) option","C) option","D) option"],"correct":2,"explanation":"explanation"},
        {"question":"Fourth MC","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"explanation"}
      ]},
      {"type":"essayPrompt","questions":[
        {"question":"A substantive essay prompt requiring argument, evidence, and analysis — 2-3 sentences providing clear context and task","sampleAnswer":"Outline: Introduction (hook + context + thesis). Body 1: [core argument + evidence]. Body 2: [second argument + example]. Body 3: [counterargument + rebuttal]. Conclusion: [synthesis + broader implication]. Key terms to weave in: ..."},
        {"question":"Second essay prompt approaching the topic from a different angle","sampleAnswer":"Outline with key arguments and evidence points"}
      ]}
    ]}`,

    keyconcepts: `"keyconcepts":{"concepts":[
      {"term":"exact term","definition":"comprehensive 2-3 sentence definition: what it is, how it works, and a specific real-world example that makes it concrete","importance":"Core"},
      {"term":"second term","definition":"definition with example","importance":"Supporting"}
    ]}`,

    studyplan: `"studyplan":{"totalDays":7,"steps":[
      {"day":1,"title":"Day 1 — specific focus area and measurable goal","tasks":["Read and annotate [specific section or concept]","Summarise the key ideas in your own words — max 5 sentences","Complete [specific practice activity]","Make flashcards for the 5 most important terms","End-of-day check: can you explain the core concept without notes?"],"duration":"50 min","focus":"The one concept to fully master today before moving on"},
      {"day":2,"title":"Day 2 — next focus area","tasks":["Task 1","Task 2","Task 3","Task 4","Review yesterday briefly — 10 min spaced repetition"],"duration":"50 min","focus":"Today's priority concept"}
    ]}`,

    solve: `"solve":{
      "quickAnswer":"Clear, direct answer in 1-2 sentences — state the result and the core principle behind it.",
      "stepByStep":[
        {"step":1,"title":"Step title — action-oriented verb phrase","content":"Detailed explanation of this step: show all working, explain the reasoning (not just the mechanics), point out where students commonly make errors at this stage. 3-4 sentences."},
        {"step":2,"title":"Step 2 title","content":"Continue with full reasoning and working."},
        {"step":3,"title":"Step 3 title","content":"Final step with verification or checking strategy."}
      ],
      "examples":[
        "Worked Example 1: [problem setup with specific values] → [step-by-step working shown inline] → Answer: [result with units/context and what it means]",
        "Worked Example 2: [variation or harder version] → [working] → Answer: [result]",
        "Worked Example 3: [edge case or common exam trap] → [working showing how to avoid the mistake] → Answer: [result]"
      ],
      "keyInsight":"The core principle, pattern, or mental model that makes this class of problem tractable. What do students who consistently get this right understand that others miss?"
    }`
  };

  let modeStructures = '';
  for (let i = 0; i < modesArr.length; i++) {
    const m = modesArr[i];
    modeStructures += (modeMap[m] || ('"' + m + '":{"content":"comprehensive study material"}'));
    if (i < modesArr.length - 1) modeStructures += ',\n    ';
  }

  const difficultyModes = ['quiz', 'practicetest', 'fitb'];
  const hasDifficultyMode = modesArr.some(m => difficultyModes.indexOf(m) !== -1);
  const difficultyInstruction = hasDifficultyMode
    ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '.\n' +
      '- easy: basic recall and recognition, simple language, foundational definitions, single-concept questions\n' +
      '- medium: conceptual understanding and application required, moderate complexity, "why" and "how" questions\n' +
      '- hard: deep analysis, synthesis across multiple concepts, edge cases, real-world problem-solving, full mastery required\n' +
      'Every question must unambiguously reflect this difficulty level.'
    : '';

  const langInstruction = lang !== 'English'
    ? '\n\nLANGUAGE: Generate ALL content in ' + lang + '. Every word — questions, answers, explanations, labels, examples — must be in ' + lang + '.'
    : '';

  const queryText =
    'Topic: ' + (topic || 'the uploaded content') +
    '\n\nGenerate: ' + modeList +
    difficultyInstruction +
    langInstruction +
    '\n\nReturn:\n{\n  "topic": "precise topic name",\n  "results": {\n    ' + modeStructures + '\n  }\n}';

  // GPT-4o gets more tokens for richer reasoning output
  const maxTokens = useGPT4o ? 4000 : 3200;

  const imageBlocks = filesArr
    .filter(f => f.imageData && f.mimeType)
    .map(f => ({ type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }));

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
        model,
        max_tokens: maxTokens,
        temperature: useGPT4o ? 0.4 : 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent  }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }

    const data    = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content) return { statusCode: 500, body: JSON.stringify({ error: 'No content from OpenAI' }) };

    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) {
      try { parsed = JSON.parse(repairJson(content)); }
      catch (e2) { return { statusCode: 500, body: JSON.stringify({ error: 'Response was too long. Try selecting fewer modes or a shorter topic.' }) }; }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
