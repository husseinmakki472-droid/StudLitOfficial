// Reads pasted links so generation works from what the page actually says.
//
// Before this, a pasted URL was handed to the model as a bare string, and the
// model wrote study material about a page it had never seen. Now each link is
// fetched here and becomes ordinary text, exactly like an uploaded file — or
// the job fails with a message naming the link, rather than inventing content.
//
// Handles web pages, PDFs, and YouTube videos (via their captions).
//
// Server-side fetching of user-supplied URLs is a classic SSRF hole, so every
// hop (including redirects) is resolved and refused if it points at a private,
// loopback or link-local address.

const dns = require('dns').promises;
const net = require('net');

const MAX_URLS = 5;
const TIMEOUT_MS = 9000;
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_CHARS = 150000;
const MAX_REDIRECTS = 4;
const UA = 'Mozilla/5.0 (compatible; StudLitBot/1.0; +https://studlit.app)';

class LinkError extends Error {}

// ── Address checks ─────────────────────────────────────────────────────────
function isPrivateV4(ip) {
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||   // carrier-grade NAT
    p[0] >= 224;                                       // multicast / reserved
}
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateV4(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LinkError('only http and https links work');
  if (u.username || u.password) throw new LinkError('links with passwords in them aren’t allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new LinkError('that address isn’t public');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try { addrs = await dns.lookup(host, { all: true }); }
    catch (e) { throw new LinkError('that site couldn’t be found'); }
  }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new LinkError('that address isn’t public');
}

// ── Fetching ───────────────────────────────────────────────────────────────
async function readCapped(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new LinkError('the file is too large (over 6 MB)');
  if (!res.body || !res.body.getReader) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { try { reader.cancel(); } catch (e) {} throw new LinkError('the file is too large (over 6 MB)'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function safeFetch(rawUrl, init, deadline) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const left = Math.max(1000, deadline - Date.now());
    const timer = setTimeout(() => ctrl.abort(), left);
    let res;
    try {
      res = await fetch(url, Object.assign({ redirect: 'manual', signal: ctrl.signal }, init, {
        headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, (init && init.headers) || {})
      }));
    } catch (e) {
      clearTimeout(timer);
      throw new LinkError(e.name === 'AbortError' ? 'the site took too long to respond' : 'the site couldn’t be reached');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    try {
      if (res.status === 401 || res.status === 403) throw new LinkError('the page needs a login or blocks automated reading');
      if (res.status === 404) throw new LinkError('the page wasn’t found (404)');
      if (!res.ok) throw new LinkError('the site returned an error (' + res.status + ')');
      const buf = await readCapped(res);
      return { res, buf, url };
    } catch (e) {
      if (e.name === 'AbortError') throw new LinkError('the site took too long to respond');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LinkError('too many redirects');
}

// ── HTML → text ────────────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (x) { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function htmlToText(html) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? decodeEntities(titleM[1]).replace(/\s+/g, ' ').trim() : '';
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form)\b[\s\S]*?<\/\1>/gi, ' ');
  // Prefer the main content when the page marks it.
  const main = body.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].replace(/<[^>]+>/g, '').trim().length > 500) body = main[2];
  else body = body.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = decodeEntities(
    body
      .replace(/<\/(p|div|section|li|h[1-6]|tr|br|blockquote|pre)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

// ── YouTube ────────────────────────────────────────────────────────────────
function youtubeId(u) {
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (h === 'youtube.com' || h === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
    if (m) return m[2];
  }
  return null;
}

function pickTrack(tracks) {
  if (!tracks || !tracks.length) return null;
  const en = tracks.filter(t => /^en/i.test(t.languageCode || ''));
  // Prefer human captions over auto-generated (kind: 'asr').
  return en.find(t => t.kind !== 'asr') || en[0] || tracks.find(t => t.kind !== 'asr') || tracks[0];
}

function captionsToText(json) {
  const events = (json && json.events) || [];
  const parts = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const line = ev.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (line) parts.push(line);
  }
  return parts.join(' ').replace(/\s+([.,!?])/g, '$1');
}

function parsePlayerResponse(html) {
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>|if\s*\()/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

async function readYouTube(id, deadline) {
  const page = await safeFetch('https://www.youtube.com/watch?v=' + encodeURIComponent(id) + '&hl=en', {
    headers: { Cookie: 'CONSENT=YES+1', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
  }, deadline);
  const player = parsePlayerResponse(page.buf.toString('utf8'));
  if (!player) throw new LinkError('YouTube didn’t return the video details (it may be blocking automated reading)');
  const status = player.playabilityStatus && player.playabilityStatus.status;
  if (status && status !== 'OK') throw new LinkError('the video isn’t available (' + status.toLowerCase() + ')');
  const title = (player.videoDetails && player.videoDetails.title) || 'YouTube video';
  const tracks = player.captions && player.captions.playerCaptionsTracklistRenderer &&
    player.captions.playerCaptionsTracklistRenderer.captionTracks;
  const track = pickTrack(tracks);
  if (!track || !track.baseUrl) throw new LinkError('this video has no captions to read — upload notes or a transcript instead');
  const capUrl = new URL(track.baseUrl, 'https://www.youtube.com');
  capUrl.searchParams.set('fmt', 'json3');
  const cap = await safeFetch(capUrl.toString(), {}, deadline);
  let json = null;
  try { json = JSON.parse(cap.buf.toString('utf8')); } catch (e) {}
  const text = captionsToText(json);
  if (!text) throw new LinkError('YouTube wouldn’t share this video’s captions — upload notes or a transcript instead');
  const desc = (player.videoDetails && player.videoDetails.shortDescription) || '';
  return { title, text: 'Transcript of the YouTube video "' + title + '":\n' + text + (desc ? '\n\nVideo description:\n' + desc : '') };
}

// ── One link ───────────────────────────────────────────────────────────────
async function readLink(raw) {
  const deadline = Date.now() + TIMEOUT_MS;
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { throw new LinkError('that isn’t a valid web address'); }

  const yt = youtubeId(u);
  if (yt) return readYouTube(yt, deadline);

  const { res, buf, url } = await safeFetch(u.toString(), { headers: { Accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5' } }, deadline);
  const type = (res.headers.get('content-type') || '').toLowerCase();

  if (type.includes('application/pdf') || /\.pdf$/i.test(url.pathname)) {
    const pdfParse = require('pdf-parse');
    let text = '';
    try { text = ((await pdfParse(buf)).text || '').trim(); } catch (e) { throw new LinkError('the PDF couldn’t be read'); }
    if (!text) throw new LinkError('the PDF has no text (it may be a scan)');
    return { title: decodeURIComponent(url.pathname.split('/').pop() || 'PDF'), text };
  }
  if (type.startsWith('text/plain') || type.includes('markdown')) {
    return { title: url.hostname + url.pathname, text: buf.toString('utf8') };
  }
  if (type && !type.includes('html') && !type.includes('xml')) {
    throw new LinkError('that link isn’t a web page or PDF (' + type.split(';')[0] + ')');
  }
  const { title, text } = htmlToText(buf.toString('utf8'));
  if (text.length < 200) {
    throw new LinkError('the page had almost no readable text (it may need JavaScript or a login) — copy the text in instead');
  }
  return { title: title || url.hostname, text };
}

/**
 * Reads every link. Resolves to { files, failures }: files are shaped like
 * uploaded files ({ name, textContent }) so the generators treat them the same;
 * failures are human-readable lines naming each link that couldn't be read.
 */
async function readLinks(urls) {
  const list = (Array.isArray(urls) ? urls : []).map(String).map(s => s.trim()).filter(Boolean);
  const unique = Array.from(new Set(list)).slice(0, MAX_URLS);
  const results = await Promise.all(unique.map(async (u) => {
    try {
      const r = await readLink(u);
      return { ok: true, file: { name: (r.title || u).slice(0, 200) + ' (' + u + ')', textContent: r.text.slice(0, MAX_CHARS) } };
    } catch (e) {
      const why = e instanceof LinkError ? e.message : 'it couldn’t be read';
      if (!(e instanceof LinkError)) console.error(JSON.stringify({ event: 'link_read_failed', url: u, error: e.message }));
      return { ok: false, line: u + ' — ' + why };
    }
  }));
  return {
    files: results.filter(r => r.ok).map(r => r.file),
    failures: results.filter(r => !r.ok).map(r => r.line),
    skipped: Math.max(0, list.length - unique.length),
  };
}

function failureMessage(failures) {
  return 'We couldn’t read ' + (failures.length === 1 ? 'this link' : 'these links') + ', so nothing was generated:\n' +
    failures.map(f => '• ' + f).join('\n') + '\nRemove ' + (failures.length === 1 ? 'it' : 'them') + ' or paste the text in instead, then try again.';
}

/**
 * The app adds a pasted link to its upload list as a pseudo-file —
 * { type: 'URL', textContent: 'URL:https://…' } — rather than sending it in
 * `urls`. Pull those out so they're fetched like any other link.
 */
function splitLinkFiles(files, urls) {
  const out = { files: [], urls: (Array.isArray(urls) ? urls : []).slice() };
  for (const f of (Array.isArray(files) ? files : [])) {
    const t = typeof (f && f.textContent) === 'string' ? f.textContent.trim() : '';
    const m = t.match(/^URL:\s*(https?:\/\/\S+)$/i);
    if (f && (f.type === 'URL' || m)) {
      const u = m ? m[1] : String(f.name || '').trim();
      if (/^https?:\/\//i.test(u)) { out.urls.push(u); continue; }
    }
    out.files.push(f);
  }
  return out;
}

module.exports = { readLinks, splitLinkFiles, failureMessage, htmlToText, youtubeId, captionsToText, parsePlayerResponse, isPrivateIp, MAX_URLS };
