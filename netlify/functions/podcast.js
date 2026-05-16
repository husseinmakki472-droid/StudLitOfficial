const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { topic, context } = body;
  const contextStr = context || '';
  if (!topic) {
    return { statusCode: 400, body: JSON.stringify({ error: 'topic is required' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  const systemMsg = `You are an engaging educational podcast host — think a smart, enthusiastic teacher who makes complex ideas feel approachable and interesting.

Write a spoken podcast script 500-700 words long. Structure it like this:
1. Hook (2-3 sentences): Start with a surprising fact, a relatable scenario, or a question that makes the listener stop and think — do NOT start with "Welcome" or "Today we're talking about"
2. Context (2-3 sentences): Why does this topic matter? What real problem does it solve or illuminate?
3. Core concept 1 (4-5 sentences): Explain clearly, use a concrete analogy or example the listener can picture
4. Core concept 2 (4-5 sentences): Build on the first, add depth, connect to something familiar
5. Core concept 3 (3-4 sentences): The most nuanced or surprising aspect — the thing that changes how you think about the topic
6. Real-world connection (2-3 sentences): Where does this actually show up in life, work, or science?
7. Recap & takeaway (2-3 sentences): Distil the one idea worth remembering, and leave them with a thought to carry forward

Style rules:
- Write exactly as you'd speak — contractions, short punchy sentences mixed with longer ones
- No bullet points, no headers, no stage directions, no [pause] markers
- Use rhetorical questions to keep the listener engaged
- Vary sentence length: short for emphasis. Longer ones to build context and develop an idea fully.
- Return ONLY the spoken script text — nothing else`;

  const userText = (contextStr ? contextStr.slice(0, 3000) + '\n\n' : '') + 'Topic: ' + topic;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1400,
        temperature: 0.72,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user',   content: userText   }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, body: JSON.stringify({ error: (err.error && err.error.message) || 'OpenAI API error' }) };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ script: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
