const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { paper, prompt, rubric } = body;
  if (!paper || !paper.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Paper text is required' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  const systemMsg = `You are an experienced academic paper grader with expertise across all subjects. Read the paper carefully and return ONLY valid JSON — no markdown, no backticks, no extra text.

GRADING RULES — FOLLOW STRICTLY:
1. Use the FULL grade range A+ through F. Never default to B range for everything.
2. Poor work (vague thesis, weak or absent evidence, grammar errors, shallow reasoning) = C, D, or F.
3. Average work = C+ to B-. Good work = B to B+. Excellent work = A range. Near-perfect = A+.
4. Each criterion score must directly reflect what you actually observe in the paper. Quote specific passages in your feedback.
5. Scores must vary meaningfully across criteria — if one area is strong and another weak, show it.
6. If no rubric is provided, judge on academic writing standards: argument clarity, evidence quality, structure, writing mechanics, and depth of thinking.
7. Be honest and precise — vague praise helps nobody. Name exactly what works and exactly what doesn't.
8. Feedback must be actionable: don't just say "improve your thesis" — say how and give an example of what a better version would look like.

Grade scale: 97-100=A+, 93-96=A, 90-92=A-, 87-89=B+, 83-86=B, 80-82=B-, 77-79=C+, 73-76=C, 70-72=C-, 67-69=D+, 63-66=D, 60-62=D-, 0-59=F

Return this exact JSON structure:
{
  "overall": {
    "grade": "B+",
    "score": 87,
    "summary": "2-3 sentences summarising overall quality — name the paper's strongest asset and its most significant weakness"
  },
  "criteria": [
    {
      "name": "Thesis & Argument",
      "score": 88,
      "grade": "B+",
      "feedback": "3-4 specific sentences. Is the thesis clear, arguable, and sustained throughout? Quote or reference the actual thesis. Identify whether the argument progresses logically or loses focus."
    },
    {
      "name": "Evidence & Support",
      "score": 85,
      "grade": "B",
      "feedback": "3-4 sentences. How well does the paper use evidence, examples, data, or citations? Are claims substantiated or asserted without support? Note any specific gaps or strong examples."
    },
    {
      "name": "Structure & Organization",
      "score": 90,
      "grade": "A-",
      "feedback": "3-4 sentences. Evaluate the introduction, body paragraphs, transitions, and conclusion. Is information sequenced logically? Do paragraphs have clear topic sentences and connective flow?"
    },
    {
      "name": "Writing Style & Grammar",
      "score": 86,
      "grade": "B+",
      "feedback": "3-4 sentences. Assess clarity, precision of language, sentence variety, grammar, punctuation, and academic register. Mention specific recurring issues if present."
    },
    {
      "name": "Critical Thinking",
      "score": 82,
      "grade": "B",
      "feedback": "3-4 sentences. Does the paper go beyond surface-level description? Are there original insights, engagement with complexity, consideration of counterarguments, or synthesis of ideas?"
    }
  ],
  "strengths": [
    "Specific, concrete strength 1 — reference what the paper actually does well",
    "Specific strength 2",
    "Specific strength 3",
    "Specific strength 4",
    "Specific strength 5"
  ],
  "improvements": [
    "Specific, actionable improvement 1 — say exactly what to do differently and why",
    "Actionable improvement 2",
    "Actionable improvement 3",
    "Actionable improvement 4",
    "Actionable improvement 5"
  ],
  "comments": "5-6 sentences of detailed holistic commentary. Synthesise the evaluation. Identify the single most impactful change the student could make. Give concrete, immediate guidance they can apply in a revision — not generic advice."
}`;

  let userMsg = '';
  if (prompt) userMsg += `Assignment Prompt:\n${prompt}\n\n`;
  if (rubric) userMsg += `Grading Rubric:\n${rubric}\n\n`;
  userMsg += `Paper to grade:\n\n${paper.slice(0, 20000)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2500,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }

    const data = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content) return { statusCode: 500, body: JSON.stringify({ error: 'No content returned from OpenAI' }) };

    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse grading response' }) }; }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
