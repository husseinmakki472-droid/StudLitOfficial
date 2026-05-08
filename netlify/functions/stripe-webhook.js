const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'STRIPE_WEBHOOK_SECRET not set' }) };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Webhook signature verification failed: ' + err.message }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const userId = session.client_reference_id || (session.metadata && session.metadata.user_id);

    if (userId && supabaseUrl && serviceKey) {
      try {
        const supaAdmin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { data: { user } } = await supaAdmin.auth.admin.getUserById(userId);
        const existing = (user && user.app_metadata) || {};

        await supaAdmin.auth.admin.updateUserById(userId, {
          app_metadata: {
            ...existing,
            plan: 'pro',
            plan_start: new Date().toISOString(),
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          },
        });
      } catch (err) {
        console.error('Failed to update user plan:', err.message);
        // Still return 200 so Stripe doesn't retry
      }
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const sub = stripeEvent.data.object;
    const userId = sub.metadata && sub.metadata.user_id;
    if (userId && supabaseUrl && serviceKey) {
      try {
        const supaAdmin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { data: { user } } = await supaAdmin.auth.admin.getUserById(userId);
        const existing = (user && user.app_metadata) || {};
        await supaAdmin.auth.admin.updateUserById(userId, {
          app_metadata: { ...existing, plan: 'free' },
        });
      } catch (err) {
        console.error('Failed to revert user plan:', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

module.exports = { handler };
