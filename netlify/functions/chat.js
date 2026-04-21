export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const { message, history = [], context = '' } = body;
  if (!message?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }
  const messages = [
    { role: 'system', content: `You are StudLit AI, a friendly expert study assistant.${context ? '\n\nStudy context:\n' + context : ''}` },
    ...history.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: message }
  ];
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, temperature: 0.7, messages })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, body: JSON.stringify({ error: err.error?.message || 'OpenAI error' }) };
    }
    const data = await response.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply: data.choices?.[0]?.message?.content || 'No response.' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
