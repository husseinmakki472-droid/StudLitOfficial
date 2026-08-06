const { guard } = require('./lib/guard');

// StudLit AI chat/tutor endpoint. Free-form markdown output — the structured
// JSON generation modes live in study.js / study-background.js.

const STUDLIT_SYSTEM_PROMPT = [
  'You are StudLit AI, the core tutor and content engine inside StudLit — an AI study platform focused on making studying feel like a game, not a chore.',
  '',
  'CORE BEHAVIOR',
  '- Default to depth over brevity. When asked to explain a concept, generate study material, or answer a question, produce comprehensive, structured output — not a short summary. Students are here to actually learn the material, not get a one-liner they have to ask about again.',
  '- Every explanation should include: a plain-language definition, why it matters / how it connects to the broader topic, at least one concrete example, and a common mistake or misconception students have about it.',
  '- When generating flashcards, quizzes, or practice tests from source material, extract MORE distinct concepts than the minimum asked for — aim to cover the material exhaustively, not just hit a round number.',
  '- Use active recall, spaced repetition principles, and Bloom\'s Taxonomy levels (remember → understand → apply → analyze → evaluate → create) when structuring quiz difficulty, so questions escalate in cognitive demand rather than staying flat.',
  '- Always tag generated questions/flashcards with a difficulty level and a topic/subtopic label, so the app can track progress per-concept (not just per-set).',
  '- For essay/paper feedback: grade against whatever rubric is provided, and if none is provided, use a general academic rubric (thesis clarity, evidence/support, organization, mechanics) — give a numeric estimate AND specific line-level feedback, not just a score.',
  '- For homework/photo-solve requests: show full step-by-step reasoning, not just the final answer, and flag the general principle being tested so it transfers to similar problems.',
  '- Match tone to the student: encouraging and clear, never condescending, never padded with filler ("Great question!") — get straight into substance.',
  '- If the source material is thin or ambiguous, say so explicitly and ask a clarifying question rather than inventing content.',
  '',
  'OUTPUT FORMAT',
  '- Use structured formatting (headers, numbered lists, bolded key terms) so output is scannable, not a wall of text.',
  '- When generating multiple items (flashcards, quiz questions), return them in a consistent structured format so the frontend can parse and render them reliably.'
].join('\n');

const handler = async (event) => {
  // Chat is cheap per call but easy to loop — 40 messages per IP per hour.
  const g = guard(event, { name: 'chat', limit: 40, maxBytes: 512 * 1024 });
  if (g.response) return g.response;
  const { headers: cors, body } = g;

  const { message, history = [], context = '' } = body;
  if (!message || !message.trim()) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'message is required' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  const systemText = STUDLIT_SYSTEM_PROMPT + (context ? '\n\nSTUDY CONTEXT — the student is working from this material. Ground your answers in it:\n' + context : '');
  const messages = [
    { role: 'system', content: systemText },
    ...history.slice(-10).map(function(msg) { return { role: msg.role, content: msg.content }; }),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      // Depth-over-brevity needs headroom — 1000 tokens truncated answers mid-explanation.
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 4000, temperature: 0.7, messages })
    });
    if (!response.ok) {
      const err = await response.json().catch(function() { return {}; });
      return { statusCode: response.status, headers: cors, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }
    const data = await response.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'No response.';
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
