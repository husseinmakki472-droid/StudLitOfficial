# Where we left off — 14 Oct, ~5:25pm

## The one open problem

Tapping **Start My Free Trial** shows: *"Could not start checkout. Please try again."*

That string comes from exactly one place — the `catch` block in
`netlify/functions/create-checkout.js`. It means the request got all the way to
Stripe and **Stripe rejected it**.

To reach that line, the request had to pass the sign-in check first, so
**Supabase auth is working and you are signed in.** That half is done.

### Most likely cause

`STRIPE_SECRET_KEY` in Netlify holds the wrong value — the `mk_1UQX1MP...`
line from the notes rather than the real `sk_test_51TUcoJ...` secret key.
Stripe answers an unrecognised key with "Invalid API Key", which lands in
exactly that catch.

### How to check

1. https://app.netlify.com/sites/frabjous-parfait-483cf8/configuration/env
2. Expand `STRIPE_SECRET_KEY` — it must begin `sk_test_`
3. If it begins `mk_`, replace it from
   https://dashboard.stripe.com/test/apikeys → **Standard keys → Secret key**
4. Deploys → Trigger deploy → **Deploy project without cache**

### If the key is already right

The real reason is in the logs:
https://app.netlify.com/sites/frabjous-parfait-483cf8/logs/functions
→ pick `create-checkout` → find the line starting `checkout_failed`.
That message names the actual Stripe error. Other candidates:

- A price ID is wrong or belongs to a different Stripe account
- The price IDs are swapped (monthly ↔ annual)
- The sandbox's keys don't match the sandbox the prices live in

## What is already done

| | |
|---|---|
| Supabase project | `yatvrfoouotspkgaplow`, East US, healthy |
| Supabase auth | Site URL + redirect set, email confirmation OFF |
| Stripe product | `StudLit pro` — $14.99 CAD/mo + $99.99 CAD/yr |
| Stripe webhook | `StudLit Netlify`, Active, 5 events, Snapshot payload |
| Netlify env vars | All 8 present |
| Code | Merged to `main`, deployed, new pricing visible live |

Confirmed live on the site: 3-day trial copy, $14.99 CAD, "Billed monthly in
Canadian dollars", SAVE 44%.

## Price IDs

```
STRIPE_PRICE_MONTHLY = price_1UQYsmPSUUVZwDYUKCupq4pP   ($14.99/mo)
STRIPE_PRICE_ANNUAL  = price_1UQZCGPSUUVZwDYUusuTK6b3   ($99.99/yr)
```

## Test sequence, once checkout opens

1. Signed out → try to generate → sign-in modal appears
2. Create account → generate 4 times → the 5th opens the pricing modal
3. Start My Free Trial → Stripe Checkout shows **$99.99 CAD** with Annual
   selected *(if it shows $14.99, the two price IDs are swapped)*
4. Pay with `4242 4242 4242 4242`, any future expiry, any CVC
5. Back in the app → "Pro — free trial" within a few seconds
6. Stripe → Developers → Webhooks → green `checkout.session.completed`
7. Settings → Account → Manage billing → Stripe portal opens

## Still outstanding, unrelated to this bug

- **Set a hard spend cap on OpenAI** — platform.openai.com → Settings → Limits.
  Never done, still the cheapest insurance available.
- **Open the site on a phone** and make one study set.
- Supabase secret key was screenshotted; rotating it is cheap and optional.
- Consider `PRO_MONTHLY_LIMIT=300` (default 1200 is far above what CAD pricing
  can support per subscriber).
- Before going live: Stripe live mode has its own API key, webhook secret and
  price IDs. All three must be recreated and swapped in Netlify.
