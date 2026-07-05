---
title: Production incident runbooks — index
version: 1.0.0
owner: Phill McGurk
applies_from: 2026-07-05
review_cadence: quarterly
---

# Production Incident Runbooks

Operational runbooks for the four failure classes named in the RestoreAssist
100/100 go-live gate (`docs/RELEASE_GATE.md`, section F). These are
incident-response documents for engineers on call — distinct from
`docs/MOBILE_RELEASE_RUNBOOK.md` (App Store/Play release sequencing) and
`docs/PILOT_CUTOVER_CHECKLIST.md` (pilot go-live checklist), which cover
release operations rather than in-production failure triage.

| Runbook | Covers | Primary detection source |
|---|---|---|
| [auth-login-outage.md](./auth-login-outage.md) | Sign-in failures, account lockouts, 2FA/session breakage | `SecurityEvent` (`LOGIN_FAILED`), NextAuth error codes |
| [billing-webhook-errors.md](./billing-webhook-errors.md) | Stripe webhook processing failures, subscription state drift | `StripeWebhookEvent.status`, `SubscriptionEvent`, `CronJobRun` (reconcile-stripe, retry-failed-webhooks) |
| [inspection-generation-restore-failures.md](./inspection-generation-restore-failures.md) | Inspection report generation failures, ungrounded/degraded IICRC standards (RA-6934), file restore-job stalls | `[error]` structured logs, `StandardsContext.degraded`, `StorageRestoreJob.status`, `CronJobRun` |
| [email-delivery-failure.md](./email-delivery-failure.md) | Transactional email (Resend) delivery failures (RA-6955) | `[email-send]` structured logs, `SupportTicketReply` |

## Severity + response commitments

Response-time commitments (P0 ≤30min, P1 ≤1h, P2 ≤4h, P3 ≤1 business day) are
defined once in `docs/SUPPORT_SLA.md` — do not duplicate them here. Each
runbook below maps its failure signatures onto that severity ladder and
states the escalation path when a signal fires.

## Customer communication

Use `docs/CUSTOMER_COMMS_TEMPLATE.md` (Templates A-E) for any incident that
reaches or risks reaching a customer. Do not draft ad hoc incident emails.

## How these were verified

Every detection query and code reference in these four runbooks was read
directly from the repository at the commit this doc ships in (see git log
for `docs/runbooks/`). Where a control is genuinely missing (for example,
no Sentry alert rule proven configured), the runbook says so explicitly
rather than describing a control that does not exist — see
`docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md` for the
current honest status of category-F monitoring point (5 of 10 cat-F points).
