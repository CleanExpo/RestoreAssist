---
title: Runbook — Transactional email delivery failure
version: 1.0.0
owner: Phill McGurk
applies_from: 2026-07-05
severity_default: P1 (P0 if password-reset/verification email is down platform-wide)
---

# Runbook — Transactional email delivery failure

## Symptom

Transactional email (password reset, welcome, Google-signin proof,
team invite, signed-form delivery, support-ticket reply) does not arrive.
RestoreAssist sends via Resend using a lightweight fetch-based sender —
there is no email SDK and no durable send queue (`lib/email-send.ts`,
header comment: "Fire-and-forget... Not a durable queue"). Reported as:

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
(`RESEND_API_KEY` missing, non-2xx Resend response, or a thrown
fetch/timeout error) both `console.error`s with an `[email-send]` prefix
AND calls `reportError()` with `stage` one of `email-send-config`,
`email-send`. Filter Vercel Function logs for:

```
[email-send]
```

`resendStatus` is included in the payload when Resend itself returned a
non-2xx (e.g. `resendStatus: 429` = rate-limited by Resend;
`resendStatus: 401/403` = API key invalid/revoked; `resendStatus: 422` =
malformed payload, likely a `RESEND_FROM_EMAIL` domain-verification
problem).

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

Filter Vercel Function logs for the specific `stage` tag relevant to the
affected flow, or broadly for:

```
"retrying":false
```

which marks the final, non-retrying failure record of a `sendWithRetry`
exhaustion (as opposed to `"retrying":true` for attempts 0/1, which are
expected transient noise, not incidents on their own).

**Support-ticket replies specifically** persist to `SupportTicketReply`
(`prisma/schema.prisma` line ~5346) with `sentToEmail` — a reply row exists
regardless of whether the email actually arrived (the row records "we
attempted to send", not "Resend confirmed delivery"). Cross-reference a
customer's "I never got the reply" complaint against
`SupportTicketReply.createdAt` for their ticket, then check
`[email-send]`/`sendWithRetry` logs at that timestamp for the failure
detail.

**Monitoring gap:** there is no persisted delivery-failure table, no
delivery-rate dashboard, and no alert on `[email-send]` frequency — this
must be found by log search during a specific complaint's time window.
There is also no bounce/complaint webhook wired from Resend, so a
systemic deliverability problem (e.g. domain reputation, DKIM/SPF
misconfiguration) would only surface via customer complaints, not
proactively. See `docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md`.

## Triage steps

1. Search Vercel Function logs for `[email-send]` in the incident window.
   No hits at all during a window where users say email didn't arrive →
   the send was never attempted (check the calling route logic, not
   Resend) or `RESEND_API_KEY` is unset (`email-send-config` stage — this
   is loud in logs, not silent, so absence of the log line during a real
   outage window would itself be the anomaly to explain).
2. If hits show `resendStatus`, triage by code:
   - `401`/`403` → `RESEND_API_KEY` invalid or revoked in Resend's
     dashboard — check the Vercel env var still matches an active key.
   - `422` → payload/from-address problem — check
     `RESEND_FROM_EMAIL`/`getFromEmail()` still resolves to a
     domain-verified sender in Resend (per the memory record, RestoreAssist
     verified `send.restoreassist.app` as a Resend subdomain — the root
     domain is owned by a different Resend team and is NOT verified;
     sending "from" the unverified root domain would fail here).
   - `429` → Resend rate limit — check current plan's send-rate ceiling
     (memory record: free plan ~100/day) against actual volume; this is a
     capacity problem, not a bug.
3. If `sendWithRetry` shows repeated `"retrying":false` failures across
   many different `stage` values simultaneously, this is a platform-wide
   Resend outage or credential problem — check Resend's own status page
   before assuming an application bug.
4. If it's isolated to one recipient across multiple send attempts, the
   likely cause is the recipient's mail server rejecting/bouncing (spam
   filter, full mailbox, typo'd address) — this will show as a Resend
   `200` (accepted) in our logs even though the email never reaches the
   inbox, since RestoreAssist has no bounce webhook. Advise the customer to
   check spam and confirm the address.

## Rollback / mitigation

- **Invalid/revoked API key:** regenerate the key in Resend, update
  `RESEND_API_KEY` in the Vercel Production environment, no redeploy
  required (read at request time).
- **Rate-limited (429):** either wait out the window or upgrade the Resend
  plan; there is no in-app throttle to relax.
- **Sender-domain verification lapsed:** re-verify DNS records for
  `send.restoreassist.app` in the Resend dashboard/Vercel DNS.
- **Systemic Resend outage:** no fallback provider is wired — this is an
  accepted single-vendor dependency; mitigation is customer communication
  (see below) and waiting for Resend to recover, not a code change.
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
