---
criterion: D3-revenue-reconciliation
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# D3 - Revenue Reconciliation (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

Stripe purchase, renewal, and churn events reconcile with the RestoreAssist database `subscription_events` for the last 7 days.

## Table-name correction (read this before running anything)

The criterion text and the scorer description both say **`subscription_events`**. **That table does not exist.** The Prisma model is `SubscriptionEvent` (`prisma/schema.prisma:7784`) with **no `@@map`**, so the actual Postgres table is the quoted, PascalCase **`"SubscriptionEvent"`**.

Pasting `SELECT ... FROM subscription_events` returns `relation "subscription_events" does not exist`. Use the queries below exactly as written, double quotes included.

Relevant columns: `id`, `userId`, `eventType`, `payload`, `stripeEventId` (unique), `createdAt`.
`eventType` is one of: `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_REACTIVATED`, `TIER_CHANGED`, `CANCELED`, `PAYMENT_FAILED`, `TRIAL_EXPIRED`.

## Where to run these (about 2 minutes)

Prod database is Supabase project **`udooysjajglluvuxkijp`**. Open the SQL editor:

**https://supabase.com/dashboard/project/udooysjajglluvuxkijp/sql/new**

Every query below is **read-only** (`SELECT` only). None of them writes, alters, or deletes anything. Safe to run against prod.

## Query set

### Q1 - Database event counts, last 7 days, by type

```sql
SELECT "eventType",
       COUNT(*)                              AS events,
       COUNT(DISTINCT "userId")              AS distinct_users,
       COUNT("stripeEventId")                AS with_stripe_id,
       MIN("createdAt")                      AS earliest,
       MAX("createdAt")                      AS latest
FROM "SubscriptionEvent"
WHERE "createdAt" >= NOW() - INTERVAL '7 days'
GROUP BY "eventType"
ORDER BY "eventType";
```

### Q2 - Total database events in the window (the single number to reconcile)

```sql
SELECT COUNT(*)                AS total_events,
       COUNT("stripeEventId")  AS stripe_linked,
       COUNT(*) - COUNT("stripeEventId") AS not_stripe_linked
FROM "SubscriptionEvent"
WHERE "createdAt" >= NOW() - INTERVAL '7 days';
```

`not_stripe_linked` should be **0** for anything Stripe-originated. A non-zero value means events were written by something other than the Stripe webhook - explain each one.

### Q3 - The Stripe event IDs themselves, for spot-checking against the dashboard

```sql
SELECT "stripeEventId", "eventType", "createdAt"
FROM "SubscriptionEvent"
WHERE "createdAt" >= NOW() - INTERVAL '7 days'
  AND "stripeEventId" IS NOT NULL
ORDER BY "createdAt" DESC;
```

### Q4 - Duplicate detection (should return 0 rows)

```sql
SELECT "stripeEventId", COUNT(*)
FROM "SubscriptionEvent"
WHERE "createdAt" >= NOW() - INTERVAL '7 days'
  AND "stripeEventId" IS NOT NULL
GROUP BY "stripeEventId"
HAVING COUNT(*) > 1;
```

A `@unique` constraint on `stripeEventId` should make this structurally impossible. Running it is the positive control that the constraint is actually doing its job. **0 rows is the pass.**

## Stripe side (about 5 minutes)

Open **https://dashboard.stripe.com/events** (live mode - this criterion is about real revenue, not test mode).

Set the date filter to **the last 7 days**, then filter by type and record each count:

| Stripe event type | Maps to DB `eventType` | Stripe count | DB count (from Q1) |
|---|---|---|---|
| `customer.subscription.created` | `SUBSCRIPTION_ACTIVATED` | | |
| `customer.subscription.deleted` | `CANCELED` | | |
| `customer.subscription.updated` | `TIER_CHANGED` / `SUBSCRIPTION_REACTIVATED` | | |
| `invoice.payment_failed` | `PAYMENT_FAILED` | | |

Also open **https://dashboard.stripe.com/webhooks**, select the production endpoint, and record the **failed delivery count for the last 7 days**. Any non-zero value is the most likely explanation for a shortfall on the DB side, and must be reconciled before this can pass.

## Reconciliation record

| # | Item | Value |
|---|---|---|
| 1 | Date and time run (with timezone) | |
| 2 | Environment | Supabase `udooysjajglluvuxkijp` + Stripe **live** mode |
| 3 | Q2 total DB events (7d) | |
| 4 | Q2 `not_stripe_linked` (expect 0) | |
| 5 | Q4 duplicates (expect 0 rows) | |
| 6 | Stripe total across the four types above | |
| 7 | Counts match? If not, every discrepancy explained | |
| 8 | Stripe failed webhook deliveries in 7d (expect 0) | |
| 9 | Owner sign-off (initials) | |

<!-- PASTE EVIDENCE HERE: the completed table plus the raw Q1/Q2 output (redact user IDs if pasting publicly) -->

### If both sides are zero

A legitimate outcome right now is **0 events on both sides** - RestoreAssist may simply have had no subscription activity in the window. That reconciles, but it does **not** prove the pipeline works; it only proves nothing happened. If you get 0/0, say so explicitly in the record above and rely on the D1 walk (which creates real test-mode events) for proof that the write path functions.

## PM Decision

Keep this criterion fail-closed until finance/revenue reconciliation evidence exists. Green webhook tests are necessary but not sufficient.

To mark PASS: set frontmatter `status: pass` and `verified: <YYYY-MM-DD>` after the table is filled in. Commit the same day.
