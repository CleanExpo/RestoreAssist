---
title: Runbook — Transactional email delivery failure
version: 2.0.0
owner: Phill McGurk
applies_from: 2026-08-26
severity_default: P1 (P0 if password-reset/verification email is down platform-wide)
---

# Runbook — Transactional email delivery failure

## Symptom

Transactional email (password reset, welcome, Google-signin proof,
team invite, signed-form delivery, support-ticket reply) does not arrive.
RestoreAssist sends via the **Mailtrap Sending API**
(`https://send.api.mailtrap.io/api/send`) from `lib/email/send-transactional.ts`.
There is no email SDK and no durable send queue. Reported as:

- Users say they never received a password-reset or verification email.
- Support tickets never reach a customer's inbox when an admin sends a
  reply (`app/api/support/tickets/[id]/reply/route.ts`).
- Team invites (`app/api/team/invites/route.ts`,
  `app/api/team/invites/[id]/resend/route.ts`) don't land.

## How to detect

There is no dedicated database table for outbound email attempts — email
failures are visible only via structured logs, with two call-site patterns
in the codebase:

**Pattern 1 — `lib/email-send.ts` (`sendEmail`)**: every failure path
(`MAILTRAP_API_KEY`/`SENDER_EMAIL` missing, non-2xx Mailtrap response, or a
thrown fetch/timeout error) both `console.error`s with an `[email-send]`
prefix AND calls `reportError()` with `stage` one of `email-send-config`,
`email-send`. Filter Function logs for:

```
[email-send]
```

**Pattern 2 — `lib/email-retry.ts` (`sendWithRetry`)**: wraps a send with
3 attempts (200ms/600ms/1800ms jittered backoff) and reports each failed
attempt via `reportError()` with `stage` set to the caller-provided tag
(`stage` values in use today: check the call sites — `app/api/auth/register/route.ts`,
`app/api/auth/google-signin/route.ts`, `app/api/team/invites/route.ts`,
`app/api/team/invites/[id]/resend/route.ts`,
`app/api/authority-forms/[id]/send-completed/route.ts`,
`app/api/support/tickets/[id]/reply/route.ts`, `lib/cron/winback.ts`).
After all 3 attempts fail, `sendWithRetry` re-throws — the caller's own
error handling then determines what the end user sees (e.g. registration
still succeeds but the welcome email is lost; the caller path controls
whether this surfaces to the user).

Filter Function logs for the specific `stage` tag relevant to the
affected flow, or broadly for:

```
"retrying":false
```

which marks the final, non-retrying failure record of a `sendWithRetry`
exhaustion (as opposed to `"retrying":true` for attempts 0/1, which are
expected transient noise, not incidents on their own).

**Support-ticket replies specifically** persist to `SupportTicketReply`
with `sentToEmail` — a reply row exists regardless of whether the email
actually arrived (the row records "we attempted to send", not "Mailtrap
confirmed delivery"). Cross-reference a customer's "I never got the reply"
complaint against `SupportTicketReply.createdAt` for their ticket, then
check `[email-send]`/`sendWithRetry` logs at that timestamp.

**Monitoring gap:** there is no persisted delivery-failure table, no
delivery-rate dashboard, and no alert on `[email-send]` frequency — this
must be found by log search during a specific complaint's time window.
There is also no bounce/complaint webhook wired from Mailtrap, so a
systemic deliverability problem (e.g. domain reputation, DKIM/SPF
misconfiguration) would only surface via customer complaints, not
proactively.

## Triage steps

1. Search Function logs for `[email-send]` in the incident window.
   No hits at all during a window where users say email didn't arrive →
   the send was never attempted (check the calling route logic, not
   Mailtrap) or `MAILTRAP_API_KEY`/`SENDER_EMAIL` is unset
   (`email-send-config` stage — this is loud in logs, not silent).
2. If hits show a Mailtrap HTTP status, triage by code:
   - `401`/`403` → `MAILTRAP_API_KEY` invalid or revoked — check the
     DigitalOcean runtime env still matches an active Sending API token
     (not a sandbox/testing token).
   - `422` → payload/from-address problem — check `SENDER_EMAIL` still
     resolves to a domain-verified sender in Mailtrap.
   - `429` → Mailtrap rate limit — check the current plan's send-rate
     ceiling against actual volume.
   - `5xx` / timeout → treat as ambiguous; do **not** automatically
     resend (Mailtrap has no idempotency key; the provider may have
     accepted the message).
3. If `sendWithRetry` shows repeated `"retrying":false` failures across
   many different `stage` values simultaneously, this is a platform-wide
   Mailtrap outage or credential problem — check Mailtrap's status page
   before assuming an application bug.
4. If it's isolated to one recipient across multiple send attempts, the
   likely cause is the recipient's mail server rejecting/bouncing (spam
   filter, full mailbox, typo'd address) — this will show as Mailtrap
   HTTP success in our logs even though the email never reaches the
   inbox, since RestoreAssist has no bounce webhook. Advise the customer
   to check spam and confirm the address.

## Rollback / mitigation

- **Invalid/revoked API key:** regenerate the Sending API token in
  Mailtrap, update `MAILTRAP_API_KEY` in the DigitalOcean app
  environment. No redeploy required (read at request time).
- **Rate-limited (429):** wait out the window or upgrade the Mailtrap
  plan; there is no in-app throttle to relax.
- **Sender-domain verification lapsed:** re-verify DNS records for the
  domain on `SENDER_EMAIL` in the Mailtrap Sending dashboard.
- **Systemic Mailtrap outage:** no fallback provider is wired — this is
  an accepted single-vendor dependency; mitigation is customer
  communication and waiting for Mailtrap to recover, not a code change.
- Because there is no durable queue, a failed send during an outage is
  **not automatically retried once the outage clears** — if the affected
  flow was a one-shot notification (e.g. "form completed" email), the
  action must be manually re-triggered once the underlying cause is fixed
  (e.g. re-hit `app/api/team/invites/[id]/resend/route.ts` for an invite,
  or use the support ticket reply route again for a lost reply).

## Escalation

Password-reset/account-verification email being down platform-wide is P1
(escalates to P0 if it is blocking all new signups or all password
resets, matching `docs/SUPPORT_SLA.md`'s P0 bar of "production fully
down"). A single lost email to one recipient is P3 unless it's
time-sensitive (e.g. a 2FA-adjacent or compliance-form delivery), in
which case treat as P2. Use `docs/CUSTOMER_COMMS_TEMPLATE.md` Template A
if the outage is affecting multiple customers' ability to sign up or
reset a password.
