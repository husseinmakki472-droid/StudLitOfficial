const crypto = require('crypto');

const SECRET = process.env.SCORE_SECRET || 'studlit-dev-secret-change-in-prod';

// XP per correct answer by difficulty
const DIFF_XP = { Easy: 5, Medium: 12, Hard: 20 };

// Hard per-event XP caps
const CAPS = { quiz_complete: 100, set_generate: 15, timer_complete: 8 };

// In-memory rate bucket (resets on cold start; good enough for abuse deterrence)
// Key: IP → { xp: number, windowStart: ms }
const rateBuckets = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_CAP_XP = 150;               // max XP per IP per window

function hmac(payload) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 20);
}

function getRateBucket(ip) {
  const now = Date.now();
  let b = rateBuckets.get(ip) || { xp: 0, windowStart: now };
  if (now - b.windowStart > RATE_WINDOW_MS) b = { xp: 0, windowStart: now };
  return b;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// ----------------------------------------------------------------
// Scoring functions per event type
// ----------------------------------------------------------------

function scoreQuiz(data) {
  const { answers, streakDays = 0, topicSeenToday = 0 } = data;
  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: 'answers array required' };
  }

  const flags = [];
  let totalXP = 0;
  let suspicious = 0;

  for (const ans of answers) {
    if (typeof ans.correct !== 'boolean') continue;
    const diff = ['Easy', 'Medium', 'Hard'].includes(ans.difficulty) ? ans.difficulty : 'Medium';
    const base = ans.correct ? DIFF_XP[diff] : 0;

    const ms = typeof ans.timeMs === 'number' ? ans.timeMs : 5000;
    // Flag if answered in under 1.2 seconds — physically impossible to read carefully
    if (ms < 1200) suspicious++;

    totalXP += base;
  }

  // Cheater penalty: >30% of answers suspiciously fast → 90% XP cut
  if (answers.length > 0 && suspicious / answers.length > 0.3) {
    flags.push('suspicious_speed');
    totalXP = Math.floor(totalXP * 0.1);
  }

  // Low-accuracy penalty: <50% correct is guessing
  const correctCount = answers.filter(a => a.correct).length;
  if (correctCount / answers.length < 0.5) {
    totalXP = Math.floor(totalXP * 0.6);
  }

  // Repetition penalty: same topic studied multiple times today
  const seen = clamp(parseInt(topicSeenToday) || 0, 0, 10);
  if (seen === 1) {
    totalXP = Math.floor(totalXP * 0.5);
  } else if (seen >= 2) {
    totalXP = 0;
    flags.push('repeated_content');
  }

  // Streak bonus: tiny, only kicks in at day 3+, capped at +10%
  const streak = clamp(parseInt(streakDays) || 0, 0, 30);
  if (streak >= 3 && totalXP > 0) {
    totalXP = Math.floor(totalXP * 1.1);
  }

  const xp = clamp(totalXP, 0, CAPS.quiz_complete);
  return { xp, flags, detail: `${correctCount}/${answers.length} correct` };
}

function scoreSetGenerate(data) {
  const seen = clamp(parseInt(data.topicSeenToday) || 0, 0, 10);
  // First time today: 15 XP. Second: 7. After that: 0.
  const xp = seen === 0 ? 15 : seen === 1 ? 7 : 0;
  const flags = seen >= 2 ? ['repeated_content'] : [];
  return { xp, flags };
}

function scoreTimer(data) {
  const minutes = clamp(parseInt(data.minutes) || 0, 1, 120);
  // Only reward meaningful focus sessions (≥10 min)
  const xp = minutes >= 25 ? 8 : minutes >= 10 ? 4 : 0;
  return { xp, flags: [] };
}

// ----------------------------------------------------------------
// Handler
// ----------------------------------------------------------------

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { type, data } = body;
  if (!type || !data || typeof data !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'type and data required' }) };
  }

  let result;
  if (type === 'quiz_complete') result = scoreQuiz(data);
  else if (type === 'set_generate') result = scoreSetGenerate(data);
  else if (type === 'timer_complete') result = scoreTimer(data);
  else return { statusCode: 400, body: JSON.stringify({ error: 'Unknown event type' }) };

  if (result.error) {
    return { statusCode: 400, body: JSON.stringify({ error: result.error }) };
  }

  // Rate limit by IP
  const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const bucket = getRateBucket(ip);
  if (bucket.xp + result.xp > RATE_CAP_XP) {
    result.xp = Math.max(0, RATE_CAP_XP - bucket.xp);
    result.flags = [...(result.flags || []), 'rate_limited'];
  }
  bucket.xp += result.xp;
  rateBuckets.set(ip, bucket);

  const ts = Date.now();
  const grant = { xp: result.xp, type, ts };
  const sig = hmac(grant);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      xp: result.xp,
      sig,
      ts,
      flags: result.flags || [],
      detail: result.detail || '',
    }),
  };
};

module.exports = { handler };
