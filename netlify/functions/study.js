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

function detectSubject(topic, fileCtx) {
  const text = ((topic || '') + ' ' + (fileCtx || '')).toLowerCase();
  if (/\b(calculus|algebra|geometry|trigonometry|matrix|vector|derivative|integral|theorem|proof|polynomial|equation|formula)\b/.test(text)) return 'math';
  if (/\b(physics|force|momentum|velocity|acceleration|gravity|quantum|wave|circuit|thermodynamics|electromagnetic)\b/.test(text)) return 'physics';
  if (/\b(cell|dna|rna|protein|organism|evolution|genetics|ecosystem|photosynthesis|mitosis|species|anatomy|biology)\b/.test(text)) return 'biology';
  if (/\b(element|compound|molecule|atom|bond|acid|base|oxidation|periodic|stoichiometry|chemistry|chemical reaction)\b/.test(text)) return 'chemistry';
  if (/\b(war|empire|revolution|treaty|civilization|colonialism|dynasty|historical|century|political history|government)\b/.test(text)) return 'history';
  if (/\b(novel|poem|character|theme|metaphor|literary|protagonist|symbolism|narrative|rhetoric|genre|literature)\b/.test(text)) return 'literature';
  if (/\b(algorithm|function|variable|loop|class|object|database|programming|code|software|html|css|javascript|python)\b/.test(text)) return 'cs';
  if (/\b(market|supply|demand|profit|revenue|economics|inflation|gdp|fiscal|business|entrepreneur|finance)\b/.test(text)) return 'business';
  if (/\b(anatomy|diagnosis|symptom|treatment|disease|medication|clinical|medical|physiology|pharmacology|nursing)\b/.test(text)) return 'medicine';
  return 'general';
}

const SUBJECT_INSTRUCTIONS = {
  math:       'SUBJECT=MATH: Include calculation problems where students must show steps. Ask "solve for X", "prove that", "find the value". Test formula application with specific numbers, not just definitions.',
  physics:    'SUBJECT=PHYSICS: Include scenario problems (e.g. "A ball rolls off a ledge at 5 m/s — how long until it hits the ground?"). Ask students to apply equations, check units, and explain why laws hold.',
  biology:    'SUBJECT=BIOLOGY: Ask students to describe mechanisms step-by-step ("trace how X occurs"), compare structures/processes, explain adaptive significance, and connect cause to biological effect.',
  chemistry:  'SUBJECT=CHEMISTRY: Include reaction prediction, equation balancing, bond-type comparisons, and application of equilibrium/kinetics principles to real scenarios.',
  history:    'SUBJECT=HISTORY: Focus on causation ("What led to X?"), significance ("Why did X matter?"), comparison of events or figures, and analysis of decisions and their consequences.',
  literature: 'SUBJECT=LITERATURE: Ask about themes, character motivation, literary devices in specific passages, authorial choices, and how structure or tone affects meaning.',
  cs:         'SUBJECT=CS: Include code tracing, bug identification, algorithm comparison, Big-O analysis, and "why is X better than Y in this situation?" questions.',
  business:   'SUBJECT=BUSINESS: Use case-based questions, apply frameworks (SWOT, Porter\'s 5 Forces), evaluate business decisions, and ask students to justify trade-offs.',
  medicine:   'SUBJECT=MEDICINE: Use clinical scenarios, ask students to prioritise diagnoses, explain pathophysiology mechanisms, and connect patient symptoms to underlying causes.',
  general:    ''
};

async function callOpenAI(apiKey, model, systemPrompt, userContent, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.5,
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

  const systemPrompt = 'You are StudLit AI. Return ONLY valid JSON — no markdown, no backticks, no extra text. CRITICAL THINKING: questions and flashcard fronts must go beyond recall — ask students to apply, analyze, compare, explain why, predict, or solve scenarios. Mix types: ~30% recall, ~40% application, ~30% analysis. MINIMUM quantities: flashcards = 80+ cards; quiz = 25+ questions; notes = 6+ sections with 5-6 bullets each; tutor = 5+ sections with 4 paragraphs each; fitb = 15+ sentences; keyconcepts = 18+ terms; practicetest = 10+ questions; studyplan = 7 days. Fill every field. Never leave arrays empty. Never truncate mid-array.';

  const modeMap = {
    flashcards: '"flashcards":{"cards":[{"front":"Mix of question types — e.g. \'Why does X happen?\', \'How would you apply X to Y?\', \'What is the difference between X and Y?\', \'What would happen if X changed?\', \'Give an example of X in real life\', or \'Define X\' for core terms. NOT just \'What is X?\'","back":"thorough answer — explain the concept, the reasoning, or the real-world connection, not just a one-line definition"}]}',
    quiz: '"quiz":{"questions":[{"question":"Mix question types: scenario-based (\'A student observes X — which concept explains this?\'), cause-and-effect (\'What happens when X occurs?\'), compare/contrast (\'How does X differ from Y?\'), application (\'Which of the following correctly applies X?\'), or analysis (\'Why does X lead to Y?\'). Avoid trivial \'What is the definition of X?\' questions.","options":["A) option","B) option","C) option","D) option"],"correct":0,"explanation":"explain why the correct answer is right AND why the wrong options are wrong","difficulty":"Medium"}]}',
    fitb: '"fitb":{"sentences":[{"text":"The ___ does ___.","blanks":["term1","term2"]}]}',
    summary: '"summary":{"overview":"comprehensive 6-8 sentence overview covering all main ideas","keyPoints":["detailed key point — include one per major concept from the content"],"mustRemember":"the single most critical concept to remember"}',
    notes: '"notes":{"sections":[{"heading":"Section Title — one section per major topic","content":"Thorough paragraph explaining this topic with full detail and context.","bullets":["Detailed bullet 1 with full explanation","Detailed bullet 2","Detailed bullet 3","Detailed bullet 4","Detailed bullet 5","Detailed bullet 6","Detailed bullet 7","Detailed bullet 8"]}]}',
    tutor: '"tutor":{"title":"Complete lesson title","sections":[{"number":1,"heading":"Section heading — be specific, one per major concept","definitions":[{"term":"key term","definition":"clear, complete definition a beginner would understand"}],"paragraphs":["Step-by-step explanation — define the concept, explain how it works, assume no prior knowledge","Expand further — cover sub-concepts, common misconceptions, and how the pieces connect","Additional depth — add nuance, edge cases, or further elaboration"],"examples":["Detailed example 1 — walk through a concrete scenario step by step showing the concept in action","Detailed example 2 — use a different context or scenario to reinforce understanding"],"keyTakeaway":"The single most important thing to remember from this section","thinkAboutIt":"A reflective question connecting this section to the bigger picture"}],"realWorldApplication":"A specific, detailed real-world scenario showing exactly how this topic is used in practice — not vague, but concrete and illustrative","summary":"A thorough summary covering every major point from the lesson — what was taught, why each concept matters, and how they connect","quiz":[{"question":"Question testing understanding or application (not just recall)","answer":"Complete, well-explained answer a student can learn from"},{"question":"Second question applying the concept to a scenario","answer":"Complete, well-explained answer"},{"question":"Third question requiring analysis or comparison","answer":"Complete, well-explained answer"}]}',
    practicetest: '"practicetest":{"sections":[{"type":"shortAnswer","questions":[{"question":"Higher-order question — e.g. \'Explain why X happens and what would change if Y were different\', \'Compare X and Y and describe a situation where each would apply\', \'A student claims X is true — do you agree? Use evidence from the material to support your answer.\' Require students to demonstrate real understanding, not just memorized facts.","sampleAnswer":"comprehensive sample answer that explains the reasoning, not just the facts — model what a strong student response looks like"}]}]}',
    keyconcepts: '"keyconcepts":{"concepts":[{"term":"term","definition":"complete, detailed definition","importance":"why this concept matters and how it connects to other ideas"}]}',
    studyplan: '"studyplan":{"totalDays":7,"steps":[{"day":1,"title":"Topic Introduction","tasks":["specific task 1","specific task 2","specific task 3"],"duration":"45 min"}]}',
    solve: '"solve":{"quickAnswer":"direct, complete answer","stepByStep":[{"step":1,"title":"step title","content":"thorough explanation of this step with all necessary detail"}],"keyInsight":"the most important insight","examples":["concrete example 1","concrete example 2","concrete example 3"]}'
  };

  const difficultyModes = ['quiz', 'practicetest', 'fitb'];
  const subject = detectSubject(topic, fileCtx);
  const subjectHint = SUBJECT_INSTRUCTIONS[subject] || '';

  const imageBlocks = filesArr
    .filter(function(f) { return f.imageData && f.mimeType; })
    .map(function(f) { return { type: 'image_url', image_url: { url: 'data:' + f.mimeType + ';base64,' + f.imageData } }; });
  const sharedCtxBlock = fileCtx.trim() ? [{ type: 'text', text: fileCtx }] : [];

  // Each mode gets its own dedicated call so it has the full token budget
  const TUTOR_INSTR = '\n\nTUTOR RULES: You are an expert tutor teaching a complete beginner. REQUIRED: (1) Explain every concept step-by-step — never skip steps. (2) Define ALL key terms explicitly in each section\'s definitions array. (3) Include at least 2 concrete, detailed examples per section. (4) Provide a specific real-world application (not vague). (5) Write a thorough summary covering every major point. (6) Include a 3-question quiz testing application and analysis, not just recall. (7) Only use information from the provided content — do not invent facts. (8) Do NOT be brief — depth and clarity are the priority.';

  function buildSingleModeCall(mode, model) {
    const structure = modeMap[mode] || ('"' + mode + '":{"content":"study material"}');
    const diffInstr = difficultyModes.includes(mode)
      ? '\n\nDIFFICULTY: ' + difficultyLevel.toUpperCase() + '. easy=simple recall; medium=understanding required; hard=analysis and application. Every question must match this level.'
      : '';
    const tutorInstr = mode === 'tutor' ? TUTOR_INSTR : '';
    const subjectInstr = subjectHint ? '\n\n' + subjectHint : '';
    const queryText = 'Topic: ' + (topic || 'the uploaded content') + '\n\nGenerate: ' + mode + diffInstr + tutorInstr + subjectInstr + '\n\nReturn:\n{\n  "topic": "topic name",\n  "results": {\n    ' + structure + '\n  }\n}';
    const userContent = [...imageBlocks, ...sharedCtxBlock, { type: 'text', text: queryText }];
    // Batched calls (2 per generation) give each function its own full budget.
    // gpt-4o ~80-100 tok/s → 2500 ≈ 25-31s; gpt-4o-mini ~150-200 tok/s → 4000 ≈ 20-27s
    const maxTokens = GPT4O_MODES.has(mode) ? 2500 : 4000;
    return callOpenAI(apiKey, model, systemPrompt, userContent, maxTokens);
  }

  try {
    // One parallel call per mode — each gets its own full 16k token budget
    const modePromises = modesArr.map(function(mode) {
      const model = GPT4O_MODES.has(mode) ? 'gpt-4o' : 'gpt-4o-mini';
      return buildSingleModeCall(mode, model)
        .then(function(result) { return (result && result.results) ? result.results : {}; })
        .catch(function() { return {}; });
    });

    const resultArr = await Promise.all(modePromises);
    const mergedResults = Object.assign({}, ...resultArr);

    // Get topic name from first successful result
    const topicName = topic || 'Study Material';

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
