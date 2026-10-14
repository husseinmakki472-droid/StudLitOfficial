# Turning on accounts and payments

Everything in the code is done. What's left is clicking through three
dashboards and pasting eight values into Netlify. Budget about 45 minutes.

Nothing works until all three are configured — until then the site behaves
exactly as it does today (open to everyone, nobody billed), because the gate
stays out of the way when `SUPABASE_URL` is absent. That's deliberate: a
half-finished setup never locks you out of your own app.

**There are no database tables to create.** The plan lives in Supabase's
built-in user metadata, so there's no schema, no migrations and no Row Level
Security to get wrong.

---

## 1. Supabase — accounts (~15 min)

1. Go to **supabase.com** → **New project**. Pick the region closest to your
   users (`us-east-1` if you're unsure — it's nearest your Netlify blobs).
   Save the database password somewhere; you won't need it for this, but
   you'll want it later.

2. Once it finishes building, open **Project Settings → API** and copy three
   values:

   | Supabase calls it | You'll paste it into Netlify as |
   |---|---|
   | Project URL | `SUPABASE_URL` |
   | `anon` `public` key | `SUPABASE_ANON_KEY` |
   | `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

   The `service_role` key can read and modify any account, including setting
   anyone to Pro. It is only ever used server-side and must never appear in
   a file you commit. The `anon` key is safe in a browser — that one is meant
   to be public.

3. Open **Authentication → URL Configuration** and set:
   - **Site URL**: `https://frabjous-parfait-483cf8.netlify.app`
   - **Redirect URLs**: add `https://frabjous-parfait-483cf8.netlify.app/app.html`

   Update both when you move to a custom domain.

4. Open **Authentication → Providers → Email** and decide one thing:

   **Turn "Confirm email" OFF** for launch. Here's why that's the right call
   today rather than a shortcut: Supabase's built-in email sender is
   rate-limited to a handful of messages per hour and is explicitly not meant
   for production. With confirmation on and no custom SMTP, your fourth signup
   of the hour silently never receives their email and you lose them.

   With it off, signup is instant and sends no email at all.

   The cost of turning it off: people can sign up with an address they don't
   own, and each account gets 4 free generations. That's the trade — instant
   signup now, tighter verification once SMTP is in place.

5. **Before you have real volume, add custom SMTP.** Authentication → Emails →
   SMTP Settings. Resend's free tier (3,000/month) takes about ten minutes.
   Until you do this, *password resets will not reliably send* — so if someone
   emails you locked out in week one, that's why. This is the one item on this
   page I'd put on next week's list rather than launch day.

---

## 2. Stripe — payments (~20 min)

1. **stripe.com** → create your account and finish the business details.
   Keep **Test mode** on for now (the toggle is top-right).

2. **Products → Add product**:
   - Name: `StudLit Pro`
   - Add a recurring price: **$15.00 USD / month** → save the price id
     (`price_...`) as `STRIPE_PRICE_MONTHLY`
   - On the same product, **Add another price**: **$99.00 USD / year** → save
     that id as `STRIPE_PRICE_ANNUAL`

   Two prices on *one* product, not two products. That's what lets someone
   switch between monthly and annual later without losing their history.

3. **Developers → API keys** → copy the **Secret key** → `STRIPE_SECRET_KEY`.

4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://frabjous-parfait-483cf8.netlify.app/.netlify/functions/stripe-webhook`
   - Select these five events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Save, then reveal the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`

   This webhook is what actually grants Pro. Without it, people will pay and
   get nothing — so if you only verify one thing from this page, verify that
   the webhook shows a successful delivery after your test payment.

5. **Settings → Billing → Customer portal** → click **Activate**. This is what
   the "Manage billing" button opens, and it's how people cancel. Stripe will
   not let the portal open until it's switched on.

---

## 3. Netlify — paste it all in (~5 min)

**Site configuration → Environment variables.** Add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | from step 1.2 |
| `SUPABASE_ANON_KEY` | from step 1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1.2 |
| `STRIPE_SECRET_KEY` | from step 2.3 |
| `STRIPE_PRICE_MONTHLY` | from step 2.2 |
| `STRIPE_PRICE_ANNUAL` | from step 2.2 |
| `STRIPE_WEBHOOK_SECRET` | from step 2.4 |
| `ALLOWED_ORIGINS` | `https://frabjous-parfait-483cf8.netlify.app` |

Then **Deploys → Trigger deploy → Clear cache and deploy site**. Environment
variables only reach the functions on a fresh build.

### Optional dials

These all have working defaults — set them only when you want to change
behaviour. No deploy needed; they take effect on the next function cold start.

| Variable | Default | What it does |
|---|---|---|
| `FREE_GENERATION_LIMIT` | `4` | Free units per account, ever. 4 = one tutor lesson, or four flashcard decks, or twenty chat turns. |
| `PRO_MONTHLY_LIMIT` | `1200` | Fair-use ceiling for Pro. Generous; it exists to stop a runaway script, not real students. |
| `TRIAL_DAYS` | `2` | Free trial length. `0` turns the trial off entirely. |

---

## 4. The one thing that isn't in any of this

**Set a hard spend cap on your OpenAI account.** platform.openai.com →
Settings → Limits → set a monthly hard cap.

The gate means an unauthenticated stranger can no longer spend your money.
It does not protect you from a bug in your own code, and it's the cheapest
insurance you will ever buy.

---

## 5. Testing it, in order

Do these in test mode, in this order. Each one checks something the next one
depends on, so a failure tells you exactly where the problem is.

1. **Open the site signed out and try to generate.** You should get the sign-in
   modal, not an error card. *(If you get a generation instead, the Supabase
   variables aren't reaching the functions — redeploy with cache cleared.)*

2. **Create an account.** You should land back in the app with your email
   showing in Settings → Account.

3. **Generate four times, then a fifth.** The first four work. The fifth opens
   the pricing modal. Settings → Account counts down as you go.

4. **Click Start My Free Trial.** You should land on Stripe Checkout showing
   **$99/year** if Annual is selected — this is the exact bug the old
   single-price code had, so check the number on the Stripe page, not yours.

5. **Pay with `4242 4242 4242 4242`**, any future expiry, any CVC. You should
   return to the app and see "Pro — free trial" within a few seconds.

6. **Check the webhook delivered.** Stripe → Developers → Webhooks → your
   endpoint. A green `checkout.session.completed`. If it's red, open it and
   read the response — that message is the actual problem.

7. **Generate again.** No limit, no modal.

8. **Settings → Account → Manage billing** → Stripe's portal opens → cancel.
   Back in the app it should read "Pro — ending soon".

### Going live

Flip Stripe out of Test mode, then redo **steps 2.3 and 2.4** — live mode has
its own API key and its own webhook with a different signing secret. Update
those two variables in Netlify and redeploy. The price ids also differ between
modes, so recreate the product in live mode and update those too.

This is the step people miss: test-mode keys in production fail silently at
checkout.

---

## How it behaves when things break

Worth knowing before a user emails you about it.

- **A card is declined.** The account stays Pro. Stripe retries over about two
  weeks and only then cancels. Cutting someone off on the first failed retry
  costs more in refunds than two weeks of usage does.
- **Netlify Blobs has an outage.** Paying customers keep working; free accounts
  get "try again in a minute". An outage should degrade the free tier, never
  the tier that's paying for it.
- **Someone pays but the webhook fails.** They stay on free. Fix the webhook
  and hit **Resend** on the failed event in Stripe — it'll apply retroactively.
- **A generation fails halfway.** The quota was already spent, because the
  money was. Idempotency only protects against the automatic retry, not a
  genuine second attempt.
