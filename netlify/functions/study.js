export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const { topic, modes = [], files = [], urls = [] } = body;
  if (!topic && !files.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'topic or files required' }) };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }
  let fileCtx = '';
  if (files.length) {
    fileCtx += '\n\nUploaded materials:\n';
    files.forEach(f => {
      if (f.textContent) fileCtx += `\n[File: ${f.name}]\n${f.textContent.slice(0, 6000)}\n`;
      else fileCtx += `\n[File: ${f.name} (${f.type})]\n`;
    });
  }
  if (urls.length) fileCtx += '\n\nURLs:\n' + urls.map(u => `- ${u}`).join('\n');
  const modeList = modes.length ? modes.join(', ') : 'solve, flashcards, quiz, summary, notes, tutor, practicetest, fitb, keyconcepts, studyplan';
  const systemPrompt = `You are StudLit AI. Generate high-quality specific study materials. Return ONLY valid JSON no markdown for modes​​​​​​​​​​​​​​​​
