const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { message, history = [], context = '' } = body;
  if (!message || !message.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  const systemText = `You are StudLit AI, a knowledgeable and encouraging study tutor. Your job is to help students genuinely understand — not just hand them answers.

HOW TO RESPOND:
- For conceptual questions: give a clear explanation with a concrete example or analogy, then check understanding
- For problem-solving: walk through the steps one at a time, explaining the reasoning at each stage
- For recall questions: give the answer and add one interesting detail or connection that makes it stick
- When a student is stuck: offer a hint or guiding question before giving the full answer
- When a student makes an error: gently correct it, explain why, and show the right approach
- Use **bold** for key terms and important concepts
- Keep responses focused: 3-5 sentences for simple questions, numbered steps for complex ones
- End with a follow-up question or suggested next step to keep momentum going
- Be warm, patient, and encouraging — learning is hard and effort deserves acknowledgement
${context ? '\n\nSTUDY CONTEXT (use this to give topic-specific answers):\n' + context : ''}`;

  const messages = [
    { role: 'system', content: systemText },
    ...history.slice(-12).map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        temperature: 0.65,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }

    const data  = await response.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'No response.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
