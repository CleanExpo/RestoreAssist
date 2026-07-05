---
title: Runbook — Billing-webhook errors / subscription state drift
version: 1.0.0
owner: Phill McGurk
applies_from: 2026-07-05
severity_default: P1 (P0 if paywall/entitlement state is wrong for many users)
---

# Runbook — Billing-webhook errors / subscription state drift

## Symptom

Stripe webhook events (`app/api/webhooks/stripe/route.ts`) fail to process,
or process but leave a subscription's local state (`SubscriptionStatus`,
credits, entitlements) out of sync with Stripe's actual state. Visible as:

- A customer paid but is still gated at HTTP 402 (per-route subscription
  gate — allowlist `["TRIAL","ACTIVE","LIFETIME"]` inlined at each AI/paywall
  call site, e.g. `app/api/inspections/[id]/generate-scope/route.ts`,
  `app/api/vision/extract-reading/route.ts`, `lib/ai/lifecycle/_shared.ts`;
  see CLAUDE.md rule 5).
- A customer cancelled in Stripe but retains access (reconciliation lag —
  see below, this self-heals daily).
- Support tickets categorised `billing` (`app/api/support/tickets` —
  `category: "billing"`).
- Stripe dashboard shows a webhook endpoint with a non-2xx delivery rate.

This is distinct from `docs/evidence/release-gate/1.0.0/D1-billing-flows.md`
and `D3-revenue-reconciliation.md` (owner-verified purchase/renewal/churn
flows) — this runbook is what to do when the machinery those evidence files
describe actually breaks in production.

## How to detect

Every inbound Stripe event is written to `StripeWebhookEvent`
(`prisma/schema.prisma` line ~4283) before processing, with idempotency on
`stripeEventId` (unique constraint; a `P2002` on insert means "already
seen", handled explicitly in `app/api/webhooks/stripe/route.ts` around
line 120-135). Status transitions through `WebhookEventStatus`
(`PENDING → PROCESSING → COMPLETED | FAILED | SKIPPED`).

Query for failures:

```sql
select "eventType", count(*), max("receivedAt") as most_recent
from "StripeWebhookEvent"
where "status" = 'FAILED'
  and "receivedAt" > now() - interval '24 hours'
group by 1
order by 2 desc;
```

Read the actual failure reason (populated by the catch block in the
handler, per event type):

```sql
select "stripeEventId", "eventType", "errorMessage", "retryCount", "receivedAt"
from "StripeWebhookEvent"
where "status" = 'FAILED'
order by "receivedAt" desc
limit 20;
```

**Note:** the Stripe webhook route does not call the cross-provider
`recordWebhookFailure` helper (`lib/webhook-audit.ts`) that Xero, QuickBooks,
MYOB, ServiceM8, DR-NRPG, GitHub and Ascora webhooks use — Stripe failures
only land in `StripeWebhookEvent.status`, not in `SecurityEvent` with
`eventType="WEBHOOK_FAILED"`. If you're building a single cross-provider
"all webhook failures" dashboard query, Stripe needs a separate query
(above) unioned in — it will not show up in a `SecurityEvent` scan.

**Automatic recovery already running (verify these before manual
intervention):**

- `retry-failed-webhooks` cron (`app/api/cron/retry-failed-webhooks`,
  `vercel.json` schedule `*/30 * * * *`) — reprocesses `FAILED` events up
  to 5 retries via `retryFailedEvents` (`lib/jobs/webhook-queue.ts`). This
  is generic across providers, including Stripe if it's wired there.
- `reconcile-stripe` cron (`app/api/cron/reconcile-stripe`, schedule
  `0 6 * * *`, daily) — lists locally-active subscriptions, checks Stripe's
  real status, downgrades any Stripe reports canceled/deleted
  (`lib/cron/reconcile-stripe.ts`). This is the safety net for the
  "cancelled in Stripe, still active locally" drift case — up to 24h lag
  by design.

Check whether these crons are actually running and succeeding:

```sql
select "jobName", "status", "startedAt", "completedAt", "itemsProcessed", "errorMessage"
from "CronJobRun"
where "jobName" in ('retry-failed-webhooks', 'reconcile-stripe')
order by "startedAt" desc
limit 10;
```

A `status='failed'` row here (with `errorMessage` populated —
`lib/cron/runner.ts` `runCronJob`) means the safety net itself broke, which
escalates the severity: webhook failures plus a broken reconciliation cron
means state drift will not self-heal.

**Monitoring gap:** no alert fires today on `StripeWebhookEvent.status =
'FAILED'` count or rate — this must be queried manually or dashboarded.
See `docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md`.

## Triage steps

1. Run the failure query above for the last 24h. Note `eventType`
   distribution — a single event type failing (e.g. only
   `invoice.payment_failed`) points at a handler bug for that branch of
   `app/api/webhooks/stripe/route.ts`; failures across many event types
   points at something upstream (signature verification misconfigured,
   `STRIPE_WEBHOOK_SECRET` rotated without updating Vercel env, DB
   unreachable).
2. Check for a `400 Invalid signature` pattern first — if `stripe.webhooks
   .constructEvent` is throwing for every event (route.ts line ~108-113),
   `STRIPE_WEBHOOK_SECRET` in the Vercel environment does not match the
   secret configured on the Stripe webhook endpoint. This is the single
   most common "all Stripe webhooks broken" root cause after a secret
   rotation.
3. Confirm the `CronJobRun` safety nets are healthy (query above). If
   `retry-failed-webhooks` is failing too, do not wait for it — manually
   inspect and reprocess the affected `StripeWebhookEvent` rows.
4. For a specific customer's paywall-mismatch complaint: look up their
   `stripeCustomerId`/`stripeSubscriptionId` directly against the Stripe
   dashboard, compare to the local `Subscription` row, and use the Stripe
   dashboard "resend webhook" feature for the specific missed event once
   the root cause is fixed — do not hand-edit `Subscription` status in the
   DB except as a last resort, and if you do, log a `SubscriptionEvent`
   (`lib/billing/subscription-event.ts`) so the reconciliation trail stays
   intact.

## Rollback / mitigation

- **Secret rotation break:** re-set `STRIPE_WEBHOOK_SECRET` in Vercel to
  match the Stripe dashboard's current signing secret for that endpoint,
  redeploy is not required (env read at request time), but in-flight
  failed events from before the fix still need reprocessing — Stripe
  retries automatically for up to 72h, or trigger `retry-failed-webhooks`
  manually by hitting the cron endpoint with the correct bearer token
  (`lib/cron/auth.ts` `verifyCronAuth`).
- **Handler bug for one event type:** ship a hotfix targeting only that
  branch in `app/api/webhooks/stripe/route.ts`; the idempotency key
  (`stripeEventId` unique constraint) means Stripe's automatic retries will
  safely reprocess once the fix is live — no manual replay needed unless
  Stripe's 72h retry window has already elapsed for the affected events.
- **Reconciliation cron itself down:** this is the most urgent case — fix
  and redeploy `lib/cron/reconcile-stripe.ts` first, since without it any
  Stripe-side cancellation will not downgrade access locally.

## Escalation

Billing state drift that blocks a paying customer's access is P1 per
`docs/SUPPORT_SLA.md` ("Auth flow broken... Stripe webhook silent... AI
generation 5xx >5%" are the P1 examples given there). Widespread paywall
mismatch (many customers wrongly gated, or many wrongly retaining access
after cancellation) is P0. Use `docs/CUSTOMER_COMMS_TEMPLATE.md` Template E
if the drift caused an incorrect charge or double-charge — that is a
billing-accuracy incident and escalates to the founder immediately
regardless of the technical severity tier.
