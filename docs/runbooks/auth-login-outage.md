---
title: Runbook — Auth failures / login outage
version: 1.0.0
owner: Phill McGurk
applies_from: 2026-07-05
severity_default: P1 (P0 if all users affected)
---

# Runbook — Auth failures / login outage

## Symptom

Users cannot sign in. This shows up as any of:

- Support tickets ("can't log in", "password not accepted", stuck on the
  2FA screen) via `app/api/support/tickets`.
- A spike in NextAuth `CredentialsProvider.authorize()` returning `null`
  or throwing `ACCOUNT_LOCKED:<seconds>` / `2FA_REQUIRED` / `2FA_INVALID`
  (`lib/auth.ts`).
- `/api/auth/*` 5xx responses (NextAuth internal error, not a bad
  credential — those return `null`/redirect, not 5xx).
- Google sign-in failing at the HMAC-proof step (`verifyGoogleAuthToken`,
  `lib/auth.ts` line ~148).

This is P0 if sign-in is broken for all users (deploy regression,
`NEXTAUTH_SECRET`/`NEXTAUTH_URL` misconfigured, database unreachable). It is
P1 if a subset is affected (one auth method, one workspace, a lockout wave
from a credential-stuffing attempt).

## How to detect

All login attempts — success and failure — are written to `SecurityEvent`
(`lib/security-audit.ts`, model at `prisma/schema.prisma` line ~4373).
Every `LOGIN_FAILED` row carries a `details.reason` field written at the
call site in `lib/auth.ts`:

| `details.reason` | Meaning | File:line (approx) |
|---|---|---|
| `user_not_found` | Email doesn't match a user | `lib/auth.ts:134-139` |
| `bad_password` | Password hash mismatch | `lib/auth.ts:169-181` |
| `google_hmac_invalid` | Google sign-in HMAC proof failed | `lib/auth.ts:146-157` |
| `no_password_on_file` | Account has no password set (Google-only account attempting password login) | `lib/auth.ts:159-167` |
| `2fa_required` / `2fa_invalid` / `2fa_recovery_invalid` / `2fa_recovery_no_codes_enrolled` | TOTP/recovery-code step failing | `lib/auth.ts:185-280` |
| `2fa_enabled_but_no_secret` | Data-integrity issue — `twoFactorEnabled=true` but no secret stored | `lib/auth.ts:198-209` |

Query recent failures directly (via a Prisma console, or the DB client):

```sql
select "details"::json->>'reason' as reason, count(*)
from "SecurityEvent"
where "eventType" = 'LOGIN_FAILED'
  and "createdAt" > now() - interval '1 hour'
group by 1
order by 2 desc;
```

A spike concentrated in one `reason` value tells you which stage broke.
A spike in `bad_password` across many distinct emails within a short
window is more likely credential stuffing than an outage — check whether
those emails correlate with a small set of IPs:

```sql
select "ipAddress", count(distinct "email") as distinct_emails, count(*) as attempts
from "SecurityEvent"
where "eventType" = 'LOGIN_FAILED' and "createdAt" > now() - interval '1 hour'
group by 1
order by 3 desc
limit 20;
```

**Account lockouts** (`lib/security-audit.ts:85-152`, `getAccountLockoutStatus`)
trigger automatically at 5 failures in a 15-minute rolling window per
email, with a 15-minute lockout. A wave of `ACCOUNT_LOCKED:<n>` errors
surfacing as support tickets is expected behaviour under a credential-
stuffing attempt, not a bug — do not disable lockout to "fix" it.

**Client-side auth page errors** (login page JS exceptions, not
authorize() rejections) land in `app/api/observability/client-error`
(`lib/observability.ts` `reportClientError`) and are indexed by Vercel
Observability under the `[error]` prefix with `route` in the payload.
Filter Vercel Function logs for `"route":"/api/observability/client-error"`
combined with a URL containing `/login` or `/signin`.

**Monitoring gap:** there is no automated alert firing on a `LOGIN_FAILED`
rate spike today — this query must be run manually or via a dashboard the
owner builds. See `docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md`.

## Triage steps

1. **Scope the blast radius.** Run the SQL above for the last 15/60
   minutes. All-methods, all-users failure → treat as P0 and go to step 2.
   Single-method or single-workspace → P1, go to step 3.
2. **P0 — total outage:**
   - Check `/api/auth/session` and `/api/auth/providers` respond (NextAuth
     route health). A 500 here usually means `NEXTAUTH_SECRET` or
     `NEXTAUTH_URL` is missing/wrong in the active Vercel environment, or
     the database is unreachable (`prisma.user.findUnique` in
     `authorize()` throws before any `LOGIN_FAILED` row can even be
     written — an absence of `SecurityEvent` rows during a known outage
     window is itself a signal the DB is down, not that nobody tried).
   - Check the most recent deploy (`vercel ls` / GitHub Actions) for
     anything touching `lib/auth.ts`, `middleware.ts`, or env vars — revert
     first, diagnose after, per the standard rollback bias.
   - Check Vercel status page / DigitalOcean status page for a provider
     outage before assuming an application bug.
3. **P1 — partial:**
   - Google sign-in only: verify `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
     haven't rotated out of sync with the OAuth console
     (`lib/connections/status.ts` `googleOauthReady` check gives a quick
     env-presence read via `/api/v1/connections/status`).
   - 2FA-only: confirm the affected user's `twoFactorSecret` is intact
     (`2fa_enabled_but_no_secret` reason) — this is a data issue, not a
     systemic outage; support can walk the user through recovery-code
     login (`lib/auth.ts:224-244`) or admin-assisted 2FA reset.
   - Credential-stuffing wave: lockouts are working as designed; consider
     temporarily tightening rate limits on `/api/auth/*`
     (`lib/rate-limiter.ts`) if volume threatens infra, but do not disable
     the lockout mechanism.

## Rollback / mitigation

- **Bad deploy:** revert to the previous Vercel deployment (Vercel
  dashboard → Deployments → promote previous → "Instant Rollback"). This
  is the fastest P0 mitigation and should happen before root-causing.
- **Env var drift:** re-set the affected var in the Vercel project env
  (Production) and redeploy — env var changes do not take effect on a
  running deployment.
- **DB unreachable:** this is a platform-wide incident, not auth-specific;
  escalate immediately (see below) rather than attempting an auth-only fix.
- **Credential-stuffing:** no rollback needed — the lockout mechanism is
  the mitigation. If attempt volume is degrading the DB/API, add a
  temporary Vercel Edge/WAF rule blocking the offending IP range.

## Escalation

Per `docs/SUPPORT_SLA.md`: P0 (total outage) → founder-notified
immediately, ≤30 min first response, 24/7. P1 (partial) → ≤1h business
hours / ≤2h after-hours. Any incident touching account security
(credential-stuffing, suspected breach) escalates to the founder
regardless of severity tier, per the compliance-escalation rule in
`docs/SUPPORT_SLA.md`. Use `docs/CUSTOMER_COMMS_TEMPLATE.md` Template A for
first customer contact if the outage is customer-visible.
