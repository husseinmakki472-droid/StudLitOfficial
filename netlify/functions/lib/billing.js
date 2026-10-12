// Shared Stripe + Supabase helpers for checkout, the customer portal and the webhook.

const { supabaseAdmin } = require('./auth');

let stripeClient = null;
function stripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = require('stripe')(key);
  return stripeClient;
}

// STRIPE_PRICE_ID is the original single-price variable; it still works as the monthly price.
function priceFor(plan) {
  if (plan === 'annual') return process.env.STRIPE_PRICE_ANNUAL || '';
  return process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_ID || '';
}

function siteUrl() {
  return (process.env.URL || 'https://studlit.app').replace(/\/$/, '');
}

// Which Stripe subscription states unlock Pro.
// past_due keeps access while Stripe retries the card; once retries run out
// Stripe moves the subscription to unpaid or canceled (per your Stripe
// settings) and access ends.
const PRO_STATES = new Set(['trialing', 'active', 'past_due']);

function planForStatus(status) {
  return PRO_STATES.has(status) ? 'pro' : 'free';
}

/** Merge fields into a user's app_metadata (server-only, users can't write it). */
async function updateAppMetadata(userId, fields) {
  const sb = supabaseAdmin();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error) throw error;
  const existing = (data && data.user && data.user.app_metadata) || {};
  const next = Object.assign({}, existing, fields);
  const res = await sb.auth.admin.updateUserById(userId, { app_metadata: next });
  if (res.error) throw res.error;
  return next;
}

module.exports = { stripe, priceFor, siteUrl, planForStatus, updateAppMetadata };
