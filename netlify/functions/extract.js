const { guard } = require('./lib/guard');

const handler = async (event) => {
  // No model calls here, but PDF/DOCX parsing is CPU-bound and takes a raw
  // file — worth bounding. Uploads arrive one file per request.
  const g = guard(event, { name: 'extract', limit: 60, maxBytes: 6 * 1024 * 1024 });
  if (g.response) return g.response;
  const { headers: cors, body } = g;

  const { name, mimeType, data } = body;
  if (!data) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No file data provided' }) };

  const buf = Buffer.from(data, 'base64');
  const lname = (name || '').toLowerCase();
  const isPdf = mimeType === 'application/pdf' || lname.endsWith('.pdf');
  const isDocx = lname.endsWith('.docx') || (mimeType && mimeType.includes('wordprocessingml'));

  try {
    if (isPdf) {
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buf);
      const text = (result.text || '').trim();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ text }) };
    }
    if (isDocx) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      const text = (result.value || '').trim();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ text }) };
    }
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unsupported file type' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
