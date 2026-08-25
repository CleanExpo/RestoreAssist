# Paid-pilot monitoring and rollback

## Severity and authority

| Level | Meaning                                                                                                                                         | Immediate action                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P0    | Security boundary breach, data loss/corruption, wrong customer charged, production unavailable, migration identity/fingerprint mismatch         | Stop all pilot use and onboarding; preserve evidence; invoke the approved protected incident/rollback procedure |
| P1    | Revenue journey materially broken, repeated report/email/provisioning failures, alerting blind, or one customer blocked without safe workaround | Hold new onboarding and charges; respond within 1 hour; resume only after fix and complete acceptance rerun     |
| P2    | Isolated non-critical defect with safe documented workaround                                                                                    | Track, communicate and repair inside the agreed pilot SLA                                                       |

## Automatic stop and hold thresholds

| Signal                       |                                                                                                    Threshold | Decision                                      |
| ---------------------------- | -----------------------------------------------------------------------------------------------------------: | --------------------------------------------- |
| Migration health/fingerprint |                                          Any non-200, failed migration, rollback row or fingerprint mismatch | P0 stop                                       |
| Cross-tenant access          |                                                       Any confirmed or suspected read/write across customers | P0 stop                                       |
| Data loss/corruption         |                                                      Any confirmed customer record loss or report corruption | P0 stop                                       |
| Incorrect/duplicate charge   |                                                                                               Any occurrence | P0 stop and suspend checkout                  |
| Production availability      |                                                   Any sustained global outage, or 5xx above 1% for 5 minutes | P0 stop                                       |
| Tenant provisioning identity |                                 Any unapproved host, sentinel mismatch, platform migration or partial schema | P0 stop                                       |
| Stripe webhook               |                                                      Any processing 500 or unreconciled failed live delivery | P1 hold; P0 if entitlement or charge is wrong |
| Signup/login                 |                                              More than 5% failure over 5 minutes, or two pilot users blocked | P1 hold                                       |
| Report generation/export     | Any cross-customer output is P0; otherwise two consecutive failures or success below 95% in 15 minutes is P1 |
| Transactional email          |                         Wrong recipient/secret leak is P0; duplicate or failure above 5% in 15 minutes is P1 |
| Alerts/telemetry             |                                        Required signal unavailable for more than 5 minutes during onboarding | P1 hold                                       |

With only one to five customers, a single severe event matters more than a
percentage. The absolute-event rules take precedence.

## Monitoring windows

For every onboarding, watch the release revision, customer/workspace ID,
request IDs and provider event IDs without recording secrets.

| Time             | Minimum check                                                                   |
| ---------------- | ------------------------------------------------------------------------------- |
| Before start     | Migration fingerprint, `/api/health`, alert delivery, DB/RLS gates, Stripe mode |
| During session   | 5xx, auth, checkout/webhook, email, provisioning and report logs                |
| +1 hour          | Revenue/entitlement reconciliation and open errors                              |
| +4 hours         | Auth, email retry, report generation and support queue                          |
| +12 hours        | Migration health, cron failures, webhook failures and customer feedback         |
| +24 hours        | Full acceptance summary and expand/hold decision                                |
| Daily for 7 days | Availability, billing, email, provisioning, report success and P0/P1 review     |

## Rollback prerequisites

Do not begin a paid pilot until all are proven:

1. immutable known-good application target;
2. exact active and rollback deployment identifiers;
3. database compatibility proof for rollback;
4. current verified backup and restore procedure;
5. protected operator approval and independent verifier;
6. post-rollback migration health, smoke and six-journey acceptance plan.

The current production runbook says these controls do not yet exist. Therefore
this package cannot authorise rollback or launch. Never enable deploy-on-push,
repoint a mutable branch, reverse a migration manually or edit customer rows as
a workaround.

## Incident record

Record: start time, detection source, release/deployment IDs, affected customer
slots, last known good time, severity, stop action, evidence location, customer
communication approval, recovery proof and owner decision. Never paste secrets,
tokens, full invitation URLs or customer report content.
