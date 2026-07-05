---
title: Customer incident comms templates
version: 1.0.0
owner: support@synthex.social
applies_from: 2026-05-18
---

# Customer Comms Templates

Paste-and-adapt templates for incident communication. Tone: direct, ownership-first, no PR-speak. **Always** name the impact in customer terms before naming the cause in engineering terms.

## Anti-patterns (never do)

- "We are experiencing intermittent degradation of the platform" → say what's broken: "Job exports are returning blank PDFs."
- "We apologise for any inconvenience this may cause" → say what they couldn't do: "You couldn't generate reports between 09:14 and 09:42."
- Silence between status updates. If the cadence is "every 2h" send the 2h update even if it's "no new info yet, still investigating."

## Template A — Initial P0/P1 acknowledgement (≤30 min for P0, ≤1h for P1)

```
Subject: [{P0 / P1}] {one-line impact} — investigating

Hi {customer-name},

We've spotted that {one-line impact in customer terms}. This started at
{HH:MM AEST}, affecting {scope — all customers / your workspace / specific feature}.

We're investigating now. Next update by {HH:MM AEST} regardless of progress.

While we work on this, you can {workaround OR "there's no workaround at the moment"}.

— {your name}, RestoreAssist support
```

## Template B — Mid-incident progress update (per cadence)

```
Subject: RE: [{P0 / P1}] {one-line impact} — update at {HH:MM AEST}

Quick update on {ticket / incident ID}:

What we know now:
- {finding 1}
- {finding 2}

What we've ruled out:
- {ruled-out cause}

Next: {concrete next action}. Next update by {HH:MM AEST}.

Workaround status: {still {X} OR new workaround available at: ...}.

— {your name}
```

## Template C — Resolution notice

```
Subject: RESOLVED: {one-line impact} — {HH:MM AEST}

{one-line plain-English summary of what was broken, what was fixed,
and how long the customer was affected}.

Root cause: {one-paragraph in customer-friendly terms}.

What we've changed so we don't repeat this:
- {specific change 1}
- {specific change 2}

Anything you need to do on your end: {nothing / specific action}.

Full post-mortem will be published at {link} within 5 business days. If
you saw downstream effects we should know about, reply to this email.

Thank you for your patience.

— {your name}
```

## Template D — Post-mortem (≤5 business days after P0/P1)

```
Subject: Post-mortem: {incident name} — {date}

Summary:
{2-3 sentences: what was broken, who was affected, how long, what fixed it}.

Timeline (all times AEST):
- {HH:MM} — first symptom detected
- {HH:MM} — incident declared, customers notified
- {HH:MM} — root cause identified
- {HH:MM} — mitigation deployed
- {HH:MM} — full resolution confirmed

Root cause:
{2-3 paragraphs. Be specific. Name files / systems / decisions.}

Why it took {duration} to detect: {monitoring gap or test gap}
Why it took {duration} to fix: {complexity or rollback constraint}

Action items (each linked to a Linear ticket):
- [ ] {action 1} (RA-XXXX, owner: {name}, ETA: {date})
- [ ] {action 2} (RA-XXXX, owner: {name}, ETA: {date})

Customer impact reconciliation:
{table or list of affected customers + duration each was affected}.

Available for questions: support@synthex.social
```

## Template E — Compliance / data-handling incident (special-cased)

For any incident touching IICRC citation accuracy, ABN/GST handling, customer PII, or anything legal/regulatory: **escalate to Phill immediately**, then use this template (CC phill@synthex.social on every send):

```
Subject: COMPLIANCE NOTICE: {issue type}

We've identified {specific issue} affecting {scope — your workspace / a
specific document / a specific calculation}. This is a compliance-grade
incident; we're treating it with the same priority as a P0 outage.

Immediate steps taken:
- {action 1 — e.g. paused affected feature}
- {action 2 — e.g. flagged affected documents}

Customer-side action recommended:
- {action — e.g. do not file the X document until we've reissued it}

Full timeline, root cause, and remediation plan within 24 hours.

Founder direct line: phill@synthex.social — for any escalation.

— {your name}, RestoreAssist support
```

## SLA cross-reference

Response-time commitments live in `docs/SUPPORT_SLA.md`. Template selection:

| Template | Use when |
|---|---|
| A | First touch on any P0 or P1 |
| B | Subsequent updates during P0/P1 |
| C | Incident resolved |
| D | ≤5 business days after any P0/P1 |
| E | Anything touching compliance, IICRC, PII, billing accuracy |

## Where to actually send these (2026-07-05 addition)

For any P0/P1 that originated as, or is being tracked through, an in-app
support ticket (`SupportTicket` model, `app/api/support/tickets`), reply
through `POST /api/support/tickets/[id]/reply` rather than composing a raw
email client-side — this route:

- Sends the customer-facing email FIRST via `sendSupportReplyEmail`
  (`lib/email.ts`) wrapped in `sendWithRetry` (`lib/email-retry.ts`,
  `stage: "support-ticket-reply"`), and only persists the reply + moves the
  ticket status if the send actually succeeds — a customer is never marked
  "replied to" without having received anything.
- HTML-escapes the reply body and subject before interpolating them into
  the email (`escapeHtml()`, `lib/email.ts` line ~1356) — paste the
  template text above into the `message` field as plain text; do not
  hand-craft HTML in the reply box, it will be escaped, not rendered.
- If the send fails, the route returns `502 UPSTREAM_FAILED` and the reply
  is not recorded — that failure is exactly the class covered by
  `docs/runbooks/email-delivery-failure.md`; check there first if a reply
  send is failing.

For incidents that affect many customers at once (not a single ticket),
send directly via your usual email tool using the templates above — the
ticket-reply route is for one-to-one ticket resolution, not for broadcast
incident comms.
