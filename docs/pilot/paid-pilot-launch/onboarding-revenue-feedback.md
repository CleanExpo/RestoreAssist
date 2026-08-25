# Customer onboarding, revenue and feedback

## Rollout board

Use slots until a customer has accepted the pilot terms. Keep private customer
details in the approved CRM, not this repository.

| Slot       | Wave | State    | Commercial terms approved | A1–A6 pass | Revenue reconciled | 24h green | Decision |
| ---------- | ---: | -------- | ------------------------- | ---------- | ------------------ | --------- | -------- |
| Customer 1 |    1 | proposed | [ ]                       | [ ]        | [ ]                | [ ]       | hold     |
| Customer 2 |    2 | proposed | [ ]                       | [ ]        | [ ]                | [ ]       | hold     |
| Customer 3 |    2 | proposed | [ ]                       | [ ]        | [ ]                | [ ]       | hold     |
| Customer 4 |    3 | proposed | [ ]                       | [ ]        | [ ]                | [ ]       | hold     |
| Customer 5 |    3 | proposed | [ ]                       | [ ]        | [ ]                | [ ]       | hold     |

Allowed states: `proposed`, `approved`, `onboarding`, `active`, `held`,
`closed`. No customer may become `active` before their own A1–A6 evidence is
complete.

## Per-customer onboarding flow

1. **Qualify:** restoration business, authorised decision-maker, a real
   reporting pain and capacity to complete structured feedback.
2. **Agree:** price, GST, billing frequency, start/end dates, inclusions,
   support window, privacy/data terms, cancellation and refund conditions.
3. **Prepare:** verify release gates; create a customer evidence record; book
   owner and technician onboarding; confirm incident contacts.
4. **Activate:** customer completes signup/payment/invite themselves; operator
   observes without requesting or retaining their password.
5. **Prove:** complete A1–A6; reconcile revenue and entitlement; record the
   result.
6. **First value:** create one real inspection and customer-reviewed report;
   do not send it to an insurer until the customer approves its facts.
7. **Support:** check at 1h, 24h, day 3 and day 7; apply stop thresholds.
8. **Decide:** continue, hold, refund/close, or promote to normal subscription.

## Revenue record

One row per charge/refund. Store only redacted identifiers here.

| Customer slot | UTC time | Currency | GST-inclusive expected | Stripe event suffix | DB event suffix | Entitlement | Refund/cancel | Reconciled |
| ------------- | -------- | -------- | ---------------------: | ------------------- | --------------- | ----------- | ------------- | ---------- |
|               |          | AUD      |                        |                     |                 |             |               | [ ]        |

Reconciliation rules:

- Stripe mode must be recorded explicitly; test events never count as revenue.
- Expected and charged AUD amounts must match approved commercial terms.
- Each Stripe-originated event maps to exactly one unique
  `"SubscriptionEvent"."stripeEventId"`.
- Any discrepancy blocks the next customer.
- Reconcile daily during the pilot and at close using
  `docs/evidence/release-gate/1.0.0/D3-revenue-reconciliation.md`.

## Structured feedback

Capture at onboarding, after the first report, day 3 and day 7.

| Field                                            | Entry |
| ------------------------------------------------ | ----- |
| Customer slot / interview time                   |       |
| Role and workflow observed                       |       |
| Job they were trying to complete                 |       |
| Time before RestoreAssist                        |       |
| Time with RestoreAssist                          |       |
| What worked, in the customer's words             |       |
| Where they became stuck, in their words          |       |
| Severity: blocker / painful / minor / idea       |       |
| Would they pay the agreed price again? Why?      |       |
| Evidence link (no customer content in repo)      |       |
| Team interpretation                              |       |
| Decision: fix now / later / reject / investigate |       |
| Owner and due date                               |       |

Prioritise only feedback that improves safe activation, first-report success,
retention or paid conversion. Do not expand scope during the canary window.

## Pilot scorecard

Review after customer 1, customer 3 and customer 5:

| Metric                              |                              Target |
| ----------------------------------- | ----------------------------------: |
| Paid customers activated            |                3 minimum; 5 maximum |
| A1–A6 pass rate before activation   |                                100% |
| First valid report completed        |               100% of active pilots |
| Time to first valid report          | Record baseline; no invented target |
| Revenue reconciliation              |                    100% exact match |
| P0 incidents                        |                                   0 |
| Open P1 incidents at expansion      |                                   0 |
| Customer willing to continue paying |     Record actual count and reasons |
