/* StudLit accounts and billing (browser side).
 *
 * - Sign in with Google or an emailed link, through Supabase.
 * - Attaches the session token to every call to a paid Netlify function.
 * - A 401 from the server opens sign-in; a 402 opens the pricing modal.
 * - "Start My Free Trial" goes to Stripe Checkout; subscribers get the
 *   Stripe portal to change plan, update their card, or cancel.
 *
 * The server is the real gate (netlify/functions/lib/auth.js). Everything here
 * is about making that gate pleasant to walk through.
 *
 * Loaded after the main app script, so it can wrap generate() and startTrial().
 */
(function () {
  'use strict';

  var sb = null;            // Supabase client, once config has loaded
  var session = null;       // current Supabase session
  var ready;                // promise that settles once auth has initialised
  var INTENT_KEY = 'sl-auth-intent';

  // ── Small helpers ────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function user() { return session && session.user; }
  function isPro() {
    var u = user();
    return !!(u && u.app_metadata && u.app_metadata.plan === 'pro');
  }
  function setIntent(v) { try { v ? sessionStorage.setItem(INTENT_KEY, v) : sessionStorage.removeItem(INTENT_KEY); } catch (e) {} }
  function getIntent() { try { return sessionStorage.getItem(INTENT_KEY); } catch (e) { return null; } }

  function toast(msg, ms) {
    var t = $('slToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'slToast';
      t.className = 'sl-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 4000);
  }

  // ── Styles (scoped to the elements this file creates) ────────────────────
  var css = [
    '.sl-auth-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--border-2,rgba(255,255,255,.15));background:var(--surface,rgba(255,255,255,.04));color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}',
    '.sl-auth-btn:hover{background:var(--surface-2,rgba(255,255,255,.08))}',
    '.sl-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#7c5cfc,#b06ef3);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}',
    '.sl-account{position:relative}',
    '.sl-account-btn{padding:0 6px 0 4px}',
    '.sl-menu{position:absolute;right:0;top:44px;min-width:240px;background:var(--bg-2,#0d0d1a);border:1px solid var(--border-2,rgba(255,255,255,.15));border-radius:14px;padding:8px;box-shadow:0 12px 40px rgba(0,0,0,.35);display:none;z-index:200}',
    '.sl-menu.open{display:block}',
    '.sl-menu-head{padding:8px 10px 10px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));margin-bottom:6px}',
    '.sl-menu-email{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis}',
    '.sl-menu-plan{font-size:12px;opacity:.65;margin-top:2px}',
    '.sl-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;font-size:13px;font-weight:600;padding:9px 10px;border-radius:8px;cursor:pointer}',
    '.sl-menu button:hover{background:var(--surface-2,rgba(255,255,255,.06))}',
    '.sl-auth-title{font-size:22px;font-weight:800;letter-spacing:-.02em;text-align:center;margin-bottom:6px}',
    '.sl-auth-sub{font-size:14px;opacity:.7;text-align:center;margin-bottom:22px;line-height:1.5}',
    '.sl-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:46px;border-radius:14px;border:1px solid var(--border-2,rgba(255,255,255,.15));background:#fff;color:#1f1f1f;font:inherit;font-size:15px;font-weight:700;cursor:pointer}',
    '.sl-or{display:flex;align-items:center;gap:10px;margin:18px 0;font-size:12px;opacity:.55}',
    '.sl-or::before,.sl-or::after{content:"";flex:1;height:1px;background:currentColor;opacity:.3}',
    '.sl-email{width:100%;height:46px;border-radius:14px;border:1px solid var(--border-2,rgba(255,255,255,.15));background:var(--surface,rgba(255,255,255,.04));color:inherit;font:inherit;font-size:15px;padding:0 14px;margin-bottom:10px}',
    '.sl-auth-msg{font-size:13px;text-align:center;margin-top:12px;min-height:18px}',
    '.sl-auth-msg.err{color:#f87171}',
    '.sl-auth-legal{font-size:12px;opacity:.55;text-align:center;margin-top:16px;line-height:1.5}',
    '.sl-auth-legal a{color:inherit}',
    '.sl-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#13121e;color:#f0efff;border:1px solid rgba(255,255,255,.15);padding:12px 18px;border-radius:12px;font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .25s;z-index:2000;max-width:calc(100vw - 32px)}',
    '.sl-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
    '@media (max-width:560px){.sl-auth-btn .sl-auth-label{display:none}}'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Sign-in modal ────────────────────────────────────────────────────────
  var GOOGLE_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

  function buildAuthModal() {
    if ($('authModal')) return;
    var el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'authModal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'authTitle');
    el.innerHTML =
      '<div class="modal-box">' +
        '<button class="modal-close" type="button" aria-label="Close" data-close>✕</button>' +
        '<div class="sl-auth-title" id="authTitle">Sign in to StudLit</div>' +
        '<div class="sl-auth-sub" id="authSub">Your account keeps your subscription with you on every device.</div>' +
        '<button class="sl-google" type="button" id="authGoogle">' + GOOGLE_ICON + '<span>Continue with Google</span></button>' +
        '<div class="sl-or">or</div>' +
        '<form id="authEmailForm" novalidate>' +
          '<label for="authEmail" style="position:absolute;left:-9999px">Email address</label>' +
          '<input class="sl-email" id="authEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@school.edu" required>' +
          '<button class="btn-primary" type="submit" id="authEmailBtn">Email me a sign-in link</button>' +
        '</form>' +
        '<div class="sl-auth-msg" id="authMsg" aria-live="polite"></div>' +
        '<div class="sl-auth-legal">By continuing you agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</div>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.hasAttribute('data-close')) hideAuth();
    });
    $('authGoogle').addEventListener('click', signInWithGoogle);
    $('authEmailForm').addEventListener('submit', function (e) { e.preventDefault(); signInWithEmail(); });
  }

  function authMsg(text, isErr) {
    var m = $('authMsg');
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('err', !!isErr);
  }

  function showAuth(reason) {
    buildAuthModal();
    var sub = $('authSub');
    if (sub) sub.textContent = reason || 'Your account keeps your subscription with you on every device.';
    authMsg('');
    $('authModal').classList.add('open');
    setTimeout(function () { var i = $('authEmail'); if (i && window.innerWidth > 700) i.focus(); }, 150);
  }
  function hideAuth() { var m = $('authModal'); if (m) m.classList.remove('open'); }

  function redirectBack() { return location.origin + '/app.html'; }

  async function signInWithGoogle() {
    if (!sb) { authMsg('Sign-in is not available right now. Please try again shortly.', true); return; }
    track('Sign-in requested', { method: 'google' });
    var res = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectBack() } });
    if (res.error) authMsg(res.error.message, true);
  }

  async function signInWithEmail() {
    if (!sb) { authMsg('Sign-in is not available right now. Please try again shortly.', true); return; }
    var email = ($('authEmail').value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authMsg('Enter a valid email address.', true); return; }
    var btn = $('authEmailBtn');
    btn.disabled = true;
    authMsg('Sending…');
    track('Sign-in requested', { method: 'email' });
    var res = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectBack() } });
    btn.disabled = false;
    if (res.error) { authMsg(res.error.message, true); return; }
    authMsg('Check your inbox — we sent a sign-in link to ' + email + '.');
  }

  async function signOut() {
    closeMenu();
    if (sb) await sb.auth.signOut();
    session = null;
    renderAccount();
    toast('Signed out.');
  }

  // ── Navbar account control ───────────────────────────────────────────────
  function renderAccount() {
    var host = $('slAccount');
    if (!host) {
      var right = document.querySelector('.nav-right');
      if (!right) return;
      host = document.createElement('div');
      host.id = 'slAccount';
      host.className = 'sl-account';
      right.insertBefore(host, right.lastElementChild);
    }
    var u = user();
    if (!u) {
      host.innerHTML = '<button type="button" class="sl-auth-btn" id="slSignInBtn"><span class="sl-auth-label">Sign in</span><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg></button>';
      $('slSignInBtn').addEventListener('click', function () { showAuth(); });
      return;
    }
    var meta = u.app_metadata || {};
    var name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || '';
    var initial = (name || '?').trim().charAt(0).toUpperCase();
    var planLine;
    if (isPro()) {
      planLine = meta.sub_status === 'trialing' ? 'Pro · free trial' : (meta.cancel_at_period_end ? 'Pro · ends at period end' : 'Pro');
    } else {
      planLine = 'No active plan';
    }
    var billingBtn = meta.stripe_customer_id
      ? '<button type="button" data-act="portal">Manage subscription</button>'
      : '';
    var upgradeBtn = isPro() ? '' : '<button type="button" data-act="upgrade">Start free trial</button>';
    host.innerHTML =
      '<button type="button" class="sl-auth-btn sl-account-btn" id="slAccountBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account">' +
        '<span class="sl-avatar">' + esc(initial) + '</span></button>' +
      '<div class="sl-menu" id="slMenu" role="menu">' +
        '<div class="sl-menu-head"><div class="sl-menu-email">' + esc(u.email || name) + '</div><div class="sl-menu-plan">' + esc(planLine) + '</div></div>' +
        upgradeBtn + billingBtn +
        '<button type="button" data-act="signout">Sign out</button>' +
      '</div>';
    $('slAccountBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var m = $('slMenu');
      var open = !m.classList.contains('open');
      m.classList.toggle('open', open);
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('slMenu').addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'signout') signOut();
      else if (act === 'portal') openPortal();
      else if (act === 'upgrade') { closeMenu(); if (window.showPricingModal) window.showPricingModal(); }
    });
  }
  function closeMenu() { var m = $('slMenu'); if (m) m.classList.remove('open'); }
  document.addEventListener('click', function (e) {
    var host = $('slAccount');
    if (host && !host.contains(e.target)) closeMenu();
  });

  // ── Calls to our own functions ───────────────────────────────────────────
  // Endpoints that need no token: public config, job polling, Stripe's webhook.
  var PUBLIC_FNS = /\/\.netlify\/functions\/(config|study-status|stripe-webhook)(\?|$)/;
  var OWN_FN = /^(\/|https?:\/\/[^/]*\/)\.netlify\/functions\//;

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && input.url) return input.url;
    return String(input || '');
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = requestUrl(input);
    var ours = OWN_FN.test(url) || url.indexOf('/.netlify/functions/') === 0;
    if (!ours || PUBLIC_FNS.test(url)) return nativeFetch(input, init);

    try { await ready; } catch (e) {}
    var token = session && session.access_token;
    var opts = Object.assign({}, init || {});
    var headers = new Headers(opts.headers || (typeof input !== 'string' && input.headers) || {});
    if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
    opts.headers = headers;

    var res = await nativeFetch(input, opts);
    if (res.status === 401 || res.status === 402) {
      var code = '';
      try { code = ((await res.clone().json()) || {}).code || ''; } catch (e) {}
      handleAccessCode(code || (res.status === 401 ? 'auth_required' : 'upgrade_required'));
    }
    return res;
  };

  // Server said no — show the right door.
  function handleAccessCode(code) {
    if (code === 'auth_required') {
      if (!user()) showAuth('Sign in to start your free trial and use StudLit.');
      else refreshSession().then(function () { if (!user()) showAuth('Your session expired. Please sign in again.'); });
    } else if (code === 'upgrade_required') {
      if (window.showPricingModal) window.showPricingModal();
    }
  }
  window.slHandleAccessCode = handleAccessCode;

  // ── Billing ──────────────────────────────────────────────────────────────
  async function startCheckout() {
    if (!user()) {
      setIntent('checkout');
      if (window.hidePricingModal) window.hidePricingModal();
      showAuth('Create your account first — then you can start your 2-day free trial.');
      return;
    }
    // The app keeps the choice in a script-scoped variable, so read the toggle itself.
    var monthlyBtn = $('billMonthly');
    var plan = monthlyBtn && monthlyBtn.getAttribute('aria-pressed') === 'true' ? 'monthly' : 'annual';
    var btn = document.querySelector('#pricingModal .btn-primary');
    var label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Opening checkout…'; }
    try {
      var res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: plan })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data.url) { track('Checkout started', { plan: plan }); location.href = data.url; return; }
      if (res.status !== 401) toast(data.error || 'Could not start checkout. Please try again.', 6000);
    } catch (e) {
      toast('Could not reach the server. Check your connection and try again.', 6000);
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }

  async function openPortal() {
    closeMenu();
    try {
      var res = await fetch('/.netlify/functions/create-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data.url) { location.href = data.url; return; }
      toast(data.error || 'Could not open billing. Please try again.', 6000);
    } catch (e) {
      toast('Could not reach the server. Check your connection and try again.', 6000);
    }
  }

  // The plan lives in the session token, which only changes on refresh.
  async function refreshSession() {
    if (!sb) return null;
    try {
      var r = await sb.auth.refreshSession();
      if (r && r.data && r.data.session) session = r.data.session;
    } catch (e) {}
    renderAccount();
    return session;
  }

  // Back from Stripe: wait for the webhook to mark the account Pro.
  async function afterPayment() {
    toast('Payment confirmed — activating your trial…', 8000);
    for (var i = 0; i < 10 && !isPro(); i++) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      await refreshSession();
    }
    toast(isPro() ? 'You’re all set — your 2-day free trial has started.' : 'Your payment went through. If features stay locked, refresh the page in a minute.', 7000);
  }

  // ── Wrap the app's entry points ──────────────────────────────────────────
  // Check before spending the user's time filling a form the server will refuse.
  function gate() {
    if (!sb) return true;                // auth not configured: let the server decide
    if (!user()) {
      track('Paywall shown', { step: 'sign-in' });
      showAuth('Sign in to start your free trial and use StudLit.');
      return false;
    }
    if (!isPro()) {
      track('Paywall shown', { step: 'pricing' });
      if (window.showPricingModal) window.showPricingModal();
      return false;
    }
    return true;
  }
  window.slGate = gate;
  window.startTrial = startCheckout;

  if (typeof window.generate === 'function') {
    var origGenerate = window.generate;
    window.generate = function () { if (!gate()) return; return origGenerate.apply(this, arguments); };
  }
  if (typeof window.regenerateMode === 'function') {
    var origRegen = window.regenerateMode;
    window.regenerateMode = function () { if (!gate()) return; return origRegen.apply(this, arguments); };
  }

  // ── Analytics (Plausible: cookie-free, no consent banner needed) ─────────
  // Loaded only when PLAUSIBLE_DOMAIN is set in Netlify. Events are no-ops otherwise.
  function loadAnalytics(domain) {
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', domain);
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }
  function track(name, props) {
    try { if (typeof window.plausible === 'function') window.plausible(name, props ? { props: props } : undefined); } catch (e) {}
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function init() {
    renderAccount();
    var cfg;
    try {
      var r = await nativeFetch('/.netlify/functions/config');
      cfg = await r.json();
    } catch (e) { cfg = null; }
    if (cfg && cfg.plausibleDomain) loadAnalytics(cfg.plausibleDomain);
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      console.warn('StudLit: sign-in is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).');
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      // Implicit flow: an emailed link still works when it opens in a different
      // browser from the one that asked for it (common on iPad and phones).
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
    });
    var got = await sb.auth.getSession();
    session = got && got.data && got.data.session;
    sb.auth.onAuthStateChange(function (evt, s) {
      session = s;
      renderAccount();
      if (evt === 'SIGNED_IN') {
        hideAuth();
        if (getIntent() === 'checkout') {
          setIntent(null);
          if (!isPro()) startCheckout();
        }
      }
    });
    renderAccount();
  }

  ready = init();

  ready.then(function () {
    var params = new URLSearchParams(location.search);
    var payment = params.get('payment');
    if (payment) {
      params.delete('payment');
      var q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      if (payment === 'success') { track('Trial started'); afterPayment(); }
      else if (payment === 'cancelled') toast('Checkout cancelled — you haven’t been charged.');
    }
    // Returning from a sign-in link with a pending checkout.
    if (user() && getIntent() === 'checkout') {
      setIntent(null);
      if (!isPro()) startCheckout();
    }
  });
})();
