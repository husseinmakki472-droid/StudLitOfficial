const handler = async (event) => {
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
}
let body;
try { body = JSON.parse(event.body || '{}'); }
catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
const { name, mimeType, data } = body;
if (!data) return { statusCode: 400, body: JSON.stringify({ error: 'No file data provided' }) };
const buf = Buffer.from(data, 'base64');
const lname = (name || '').toLowerCase();
const isPdf = mimeType === 'application/pdf' || lname.endsWith('.pdf');
const isDocx = lname.endsWith('.docx') || (mimeType && mimeType.includes('wordprocessingml'));
try {
if (isPdf) {
const pdfParse = require('pdf-parse');
const result = await pdfParse(buf);
const text = (result.text || '').trim();
return {
statusCode: 200,
headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
body: JSON.stringify({ text })
};
}
if (isDocx) {
const mammoth = require('mammoth');
const result = await mammoth.extractRawText({ buffer: buf });
const text = (result.value || '').trim();
return {
statusCode: 200,
headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
body: JSON.stringify({ text })
};
}
return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported file type' }) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
}
};

module.exports = { handler };
