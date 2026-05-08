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

  const systemMsg = `You are an expert academic paper grader with deep knowledge across all subjects. Analyze the paper thoroughly and return ONLY valid JSON (no markdown, no backticks, no extra text).

CRITICAL GRADING RULES — YOU MUST FOLLOW THESE:
1. Use the FULL grade range A+ through F. Do NOT default to B or B+.
2. Poor writing (vague thesis, weak evidence, many grammar errors, shallow thinking) MUST receive C, D, or F.
3. Average writing receives C+ to B-. Good writing receives B to B+. Only excellent writing receives A range. Exceptional, near-perfect work receives A+.
4. Each criterion score must reflect ACTUAL quality found in the paper — score low when problems exist.
5. Your scores must vary meaningfully across criteria based on what the paper actually does well or poorly.
6. If there is no assignment prompt, judge the paper on its own merits as standalone academic writing.
7. Be honest and direct — a student getting an inflated grade helps nobody.

Grade on a 0-100 scale across 5 criteria. Return this exact JSON structure:
{"overall":{"grade":"B+","score":87,"summary":"2-3 sentences summarising the overall quality and main strengths/weaknesses"},"criteria":[{"name":"Thesis & Argument","score":88,"grade":"B+","feedback":"3-4 specific sentences about how well the main argument or thesis is developed, supported, and communicated"},{"name":"Evidence & Support","score":85,"grade":"B","feedback":"3-4 sentences on use of evidence, examples, citations, or data to support claims"},{"name":"Structure & Organization","score":90,"grade":"A-","feedback":"3-4 sentences on logical flow, paragraph transitions, introduction, body, and conclusion"},{"name":"Writing Style & Grammar","score":86,"grade":"B+","feedback":"3-4 sentences on clarity, word choice, grammar, punctuation, and academic tone"},{"name":"Critical Thinking","score":82,"grade":"B","feedback":"3-4 sentences on depth of analysis, original insights, and engagement with complexity"}],"strengths":["Specific strength 1","Specific strength 2","Specific strength 3","Specific strength 4","Specific strength 5"],"improvements":["Specific actionable improvement 1","Specific actionable improvement 2","Specific actionable improvement 3","Specific actionable improvement 4","Specific actionable improvement 5"],"comments":"4-6 sentences of detailed overall commentary. Synthesise the evaluation, highlight the most important things to address, and give concrete actionable guidance the student can apply immediately."}

Grade scale: 97+=A+, 93-96=A, 90-92=A-, 87-89=B+, 83-86=B, 80-82=B-, 77-79=C+, 73-76=C, 70-72=C-, 67-69=D+, 63-66=D, 60-62=D-, 0-59=F`;

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
