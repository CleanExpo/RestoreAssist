---
title: RestoreAssist Support SLA
version: 1.0.0
owner: support@synthex.social
applies_from: 2026-05-18
review_cadence: quarterly
---

# RestoreAssist Support SLA

Formal response-time commitments for paying customers (Trial, Active, Lifetime). Pi-CEO directive: this document is the source of truth — anything that promises faster (sales decks, demos) overrides this only when locked in writing for a specific customer.

## Severity definitions

| Severity | Definition | Examples |
|---|---|---|
| **P0** | Production fully down OR customer data at risk | All users 5xx on `/dashboard`; database unreachable; data corruption in flight |
| **P1** | Production materially degraded; revenue or compliance impact | Auth flow broken for a subset; Stripe webhook silent; AI generation 5xx >5%; an IICRC standard miscited |
| **P2** | Customer-impacting bug, workaround exists | One workspace can't export PDF; report layout broken on Safari |
| **P3** | Cosmetic / feature gap / question | Brand colour off; onboarding wording confusing; "how do I X?" |

## Response-time commitments

| Severity | First human response | Status update cadence | Resolution target |
|---|---|---|---|
| **P0** | **≤30 min** (24/7) | Every 30 min until restored | Same business day |
| **P1** | **≤1 h** (business hours AEST 08:00-18:00); ≤2 h outside | Every 2 h until resolved or downgraded | ≤24 h |
| **P2** | ≤4 h (business hours) | Daily | ≤5 business days |
| **P3** | ≤1 business day | On meaningful update | Best-effort, prioritised in backlog |

**Business hours:** Mon-Fri 08:00-18:00 Australia/Brisbane (AEST/AEDT auto-adjusted). After hours: P0 only, paged via on-call rotation.

**On the P1 commitment, for anyone reading a green release gate.** P1 degrades
to <=2 h outside business hours by design -- this is not 24/7 cover, and only P0
pages the on-call rotation. The gate's F2-runbooks-sla criterion checks that the
degradation is written down and bounded at <=2 h; it used to demand an
unconditional <=1 h, which this document has never offered. If the out-of-hours
bound is ever loosened past 2 h, or dropped, F2 fails and the release blocks.

## Channels

| Channel | Use for | Response window |
|---|---|---|
| `support@synthex.social` | All severities (default channel) | Per table above |
| In-app `/support` form | P2/P3 | Per table above |
| Status page (when live) | P0/P1 broadcast | Updated within the cadence above |

## Escalation

- After 2× the SLA without first response: customer may CC `phill@synthex.social` (founder escalation)
- Compliance/legal issues (IICRC miscite, ABN/GST error): always escalate to Phill immediately regardless of severity tier

## Templates

- **Outbound customer comms:** `docs/CUSTOMER_COMMS_TEMPLATE.md` — copy + adapt per incident
- **Internal triage:** `docs/PILOT_CUTOVER_CHECKLIST.md` rollback decision tree
- **Failure-class runbooks:** `docs/runbooks/` — symptom → detection query → triage → mitigation → escalation for auth outages, billing-webhook errors, report/restore-generation failures, and email delivery failures. Use these to find the P0/P1 trigger fast, then follow this document's response-time commitment.

## The support-ticket system (2026-07-05 addition)

The in-app support surface (`SupportTicket` model, `app/api/support/tickets`)
is where most P2/P3 and a meaningful share of P0/P1 first arrive:

- Public submission (`POST /api/support/tickets`) runs a best-effort Claude
  triage (`analyseSupportTicket`, `lib/services/ai/analyse-support-ticket.ts`)
  to suggest `category`/`priority`; it degrades gracefully to the
  submitter-provided values if the workspace has no configured AI key
  (RA-6921 — never spends the platform's own key on anonymous triage).
- `priority` on the `SupportTicket` row (`low | normal | high | urgent`) is
  the ticket's own severity signal — it is a useful triage aid but is not
  automatically identical to the P0-P3 ladder above; an admin still makes
  the call on which SLA tier applies, especially for `urgent` tickets that
  may only be a single customer's P2, not a systemic P0/P1.
- Admin replies go through `POST /api/support/tickets/[id]/reply`, which
  sends the email before persisting the reply (see
  `docs/CUSTOMER_COMMS_TEMPLATE.md` for the exact mechanics and its
  escape/idempotency behaviour).

## Refresh cadence

This SLA is reviewed quarterly. Most recent review: 2026-07-05 (added
support-ticket-system grounding + runbook cross-reference; response-time
commitments unchanged from 2026-05-18 initial publication).
