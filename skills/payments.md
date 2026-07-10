# payments — decision guide

Consult before integrating Stripe or any card/payment provider.

## Defaults
- Use a hosted checkout (Stripe Checkout / Payment Links) first — it keeps card data
  entirely off your servers (SAQ-A posture). Custom card forms need Stripe Elements at
  minimum; never touch raw PANs.
- **All money in integer minor units** (cents): `1200` = $12.00. Never floats.
- Source of truth = **webhook events**, never the browser redirect. The redirect can be
  lost, replayed, or faked; the webhook is signed.

## The five non-negotiables
1. **Verify webhook signatures** (`stripe.webhooks.constructEvent` with the raw body —
   body-parser middleware that JSON-parses first breaks verification).
2. **Idempotency**: send idempotency keys on create-calls; make webhook handlers safe to
   run twice (unique index on event id, upsert semantics). Stripe retries for days.
3. **Grant exactly once**: tie fulfillment to a unique constraint (e.g. `checkoutSessionId`
   unique index), not to "handler ran".
4. **Reconcile by event type** you actually handle (`checkout.session.completed`,
   `invoice.paid`, `charge.refunded`…) and ignore the rest explicitly.
5. **Refund paths mirror grant paths**: every place credits/entitlements are added needs a
   defined subtraction path.

## Options + tradeoffs
- Subscriptions vs one-time credits: subscriptions = Stripe Billing does proration/dunning
  for you; credits = simpler mental model, but YOU own expiry/refund/abuse logic.
- Test with `4242 4242 4242 4242` (any future date/CVC) + the Stripe CLI webhook forwarder
  before any live key exists in the codebase.

## Hard rules
- Live keys never in the repo — env only, different keys per environment.
- Price/tier values live server-side; the client sends a price ID, never an amount.
- Log event ids and decisions, never full payloads with PII.

## Sources
Stripe docs (Webhooks: signature verification + idempotency; Checkout; Testing) ·
PCI-DSS SAQ-A eligibility criteria · OWASP Cheat Sheet: Payment gateways (input handling).
