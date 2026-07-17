# RestoreAssist — Security Audit

**Auditor:** Senior Security Engineer (agent)
**Date:** 2026-04-22 (for 2026-04-23 review)
**Workspace:** `/tmp/pi-ceo-workspaces/ra-1494-directurl/`
**Scope:** Full application surface — auth, RBAC, secrets, input, CSRF/clickjacking, dependencies, logging, data, impersonation, IR, breach detection.

---

## Summary verdict

**AMBER — not RED for public launch, but NOT safe for design-partner pilots until Critical items fixed.**

The codebase is impressively defended for a pre-GA product: DB-resolved admin role guard, Origin-based CSRF on high-risk routes, Upstash rate-limiter with fail-closed option, turnstile CAPTCHA, timing-attack-hardened register flow, single-field admin whitelist (RA-1467), same-org guards, MUTATION audit log, HSTS + XFO + nosniff headers, per-host scraper circuit breaker, bcrypt cost 12, 12-char min password aligned across register/reset.

**But two findings are launch-blockers:** (1) 2FA is _structurally present but never enforced at login_ — enrolling does nothing; (2) the CSP that `next.config.mjs` says is "set per-request in middleware.ts" is **not implemented anywhere**, so the app ships with no CSP at all.

---

## CRITICAL — must-fix before design-partner pilots

### C1. 2FA enabled → login bypasses it entirely

- **Observed:** `lib/auth.ts` `CredentialsProvider.authorize` returns success on bcrypt match only. No reference to `twoFactorEnabled` / `twoFactorSecret` / a pending-2FA flag. `/api/auth/2fa/{setup,enable,disable}` exist and update the user row, but NextAuth never gates login on them. Grep for `twoFactor|TOTP|otpauth` in `lib/auth.ts` → zero matches.
- **Expected:** When `user.twoFactorEnabled`, `authorize` must either reject the credential-only attempt and re-route to a challenge step, or accept a combined `password + otpCode` input and verify via `lib/auth/two-factor.verifyToken` before returning the user. Recovery codes (see C2) must be an alternate path.
- **Blast radius:** Security-conscious admin enrols in 2FA, feels safe, attacker with just the password gets full session. Also makes RA-1260 shipped-work deceptive — users _believe_ 2FA is live. Urgent-grade regression risk once marketed.

### C2. No recovery / backup codes for 2FA

- **Observed:** `/api/auth/2fa/setup` returns `{ otpauthUrl, qrDataUrl, manualEntryKey }`. No recovery-code generation. No grep hits for `recoveryCode` / `backupCode` in the entire `app/` + `lib/` tree. Prisma schema has no such field. User who loses the authenticator device is locked out and must contact support (which has no documented unlock flow).
- **Expected:** 10 single-use hashed recovery codes generated at `/enable` time, displayed once, stored as bcrypt/argon2 hashes; a `/api/auth/2fa/recover` endpoint that accepts one, burns it, issues a session, forces re-enrolment.
- **Blast radius:** Real users will hit this on day one of GA. Without recovery, support ends up disabling 2FA manually → social-engineering bypass.

### C3. CSP header not actually sent (next.config lies to middleware)

- **Observed:** `next.config.mjs` comment: _"Content-Security-Policy is set per-request in middleware.ts with a fresh nonce."_ Grep `Content-Security-Policy|nonce` in `middleware.ts` → zero matches. Middleware only does rate-limiting + onboarding redirect. Net effect: no CSP header is served.
- **Expected:** Either (a) implement the nonce-based per-request CSP in middleware as the comment claims, or (b) add a conservative static CSP in `next.config.mjs` `headers()` until dynamic nonces are shipped.
- **Blast radius:** Any stored-XSS vector (see the 13 `dangerouslySetInnerHTML` sites — most are safe JSON-LD but user-content ones deserve scrutiny) has no second line of defence. Clickjacking is covered by `X-Frame-Options: DENY`, but inline-script injection is wide open.

---

## HIGH — pre-GA blockers

### H1. No account-lockout after N failed logins

`lib/auth.ts` `authorize` has no failed-attempt counter. Rate-limit is IP-based via middleware (120/min) + Upstash — slow brute is throttled but a single targeted account has no lockout.
**Expected:** `failedLoginCount` + `lockedUntil` columns, 5-failures → 15-min lock, email notification on lock.

### H2. No HIBP / breach-password check on register / reset

12-char min is good; but NIST 800-63B §5.1.1.2 also requires checking against breach lists. Trivial to add via a k-anonymised HIBP range request.

### H3. Impersonation token not runtime-integrated (RA-1352 unfinished)

`lib/admin-impersonation.ts` docstring: _"Integrating the token into the session … is a follow-up ticket."_ So impersonation is **advertised but non-functional**. Either ship the runtime integration (with target-user banner, write-tagging, auto-expire) or remove the UI surface until it works. Shipping a half-feature erodes the audit trail — admins will page support instead of using it.

### H4. NextAuth session config missing (defaults apply)

`authOptions.session.strategy = "jwt"` is set; no `maxAge`, no `updateAge`, no rotation on privilege change, no device-list / session-revocation path. Default 30-day session is too long for a tool that mints impersonation tokens.
**Expected:** `maxAge: 8h`, `updateAge: 1h`; on 2FA enable/disable, on role change, on password reset — invalidate all other sessions (requires tracking `tokensValidAfter` on User + a `jwt` callback check).

### H5. Session-listing & revoke-all for users

No UI or endpoint for a user to see active sessions and kill them. With JWT strategy, this requires `tokensValidAfter` comparison in the `jwt` callback.

### H6. No Dependabot / Renovate; no audit in CI

No `.github/dependabot.yml`, no `renovate.json`. `.github/workflows/pr-checks.yml` etc. do not run `bun audit` / `npm audit --audit-level=high`. A single-line add to CI.

### H7. Impersonation token not bound to IP / UA

`parseImpersonationToken` verifies HMAC + expiry only. Token stolen from an admin's browser is replayable from anywhere until TTL. Signed payload should include `adminUserId`'s IP or UA hash, and the verifier should compare.

---

## MEDIUM — sprint-planned hardening

### M1. No `security.txt` at `/.well-known/security.txt`

`public/` has no `.well-known/` folder. RFC 9116 expects `/security.txt` with contact, expiry, PGP, policy URL. Easy PR.

### M2. Hardcoded service-account email fallback in error messages

`lib/google-drive.ts:124` returns `process.env.GOOGLE_CLIENT_EMAIL || "your-service-account@project.iam.gserviceaccount.com"` inside a user-facing 403 message. Not a secret, but leaks infra-shape + reveals env gap when unset.

### M3. JIT-provisioning over-privileges OAuth signups

`events.createUser` (lib/auth.ts:108) sets `role: "ADMIN"` for every Google sign-up automatically. That's intentional today (every signup = own org) but means an attacker who can register any Google email at your domain gets an ADMIN role. At minimum, add a comment justifying and ensure `needsOnboarding` gate blocks admin-only endpoints until onboarding is complete (verify `verifyAdminFromDb` rejects `needsOnboarding=true`).

### M4. Public-token rotation story missing

`Invoice.publicToken` (schema:3658) is `String?` with no rotation column, no expiry, no view-count-based burn. If ever leaked in a forwarded email thread, token is valid forever. Add `publicTokenExpiresAt` + a rotation endpoint.

### M5. No PII redaction contract on SecurityEvent

`lib/security-audit.ts` writes a `details` JSON blob. No documented schema or redaction helper. Future contributors will log raw bodies / tokens. Add a `redact()` helper + lint rule (or at minimum a doc comment).

### M6. `console.log` of impersonation metadata

`app/api/admin/impersonate/route.ts:114` logs `{auditId, adminUserId, targetUserId, reason, ip, ttlMs}`. No token is logged (good), but reason strings may contain PII (support ticket details). Acceptable given the audit purpose, but confirm Vercel log retention + access ACL match the sensitivity.

### M7. No anomaly-detection / alerting pipeline on SecurityEvent

Rows are written, never read. No impossible-travel check, no multi-concurrent-session alert, no admin page to browse events.

---

## LOW — backlog / nice-to-have

- **L1.** `lib/pricing.ts:4-5` has `process.env.STRIPE_PRICE_MONTHLY || "MONTHLY_PLAN"` — placeholder string will be passed to Stripe if env missing. Turn into throw.
- **L2.** `lib/ai/gemma-client.ts:72` `process.env.GEMMA_API_KEY || "not-required"` — harmless for self-hosted; add comment explaining.
- **L3.** `lib/analytics/track.ts:42` — PostHog host fallback to `app.posthog.com`; fine, but analytics PII review pending.
- **L4.** 13 `dangerouslySetInnerHTML` sites — most JSON-LD schema, but viewer components (`RestorationInspectionReportViewer`, `ScopeOfWorksViewer`) should be spot-checked for user-content paths.
- **L5.** No `pepper` applied to bcrypt. Marginal added value over cost-12; backlog.
- **L6.** `lib/csrf.ts` allows requests with _no_ Origin header (curl, server-to-server). Fine for this threat model but document it.

---

## Already good — patterns to preserve

- **DB-resolved admin role guard** (`verifyAdminFromDb`) used on `/api/admin/users/[id]` and elsewhere — not JWT-only.
- **Same-org guard** on `/api/admin/users/[id]` (RA-1467) — classic IDOR/cross-tenant blocker.
- **Single-field whitelist** on admin mutations — defends mass-assignment even when body shape changes.
- **Invoice GET** (`/api/invoices/[id]/route.ts`) filters by `userId: session.user.id` — IDOR-safe.
- **Timing-attack hardening** on register (RA-1340) — bcrypt runs before the uniqueness check.
- **Dual rate-limit** on forgot-password (IP + email) — RA-1341 defeats residential-proxy rotation.
- **Turnstile CAPTCHA** on register / forgot / reset — soft-allow when env unset is correct dev ergonomics.
- **Fail-closed rate-limit** opt-in for AI-cost-sensitive routes — RA-1319.
- **Impersonation audit** — IP, UA, reason, jti, expiresAt persisted; loud console.info on start.
- **Origin-check CSRF** + SameSite=Lax defense-in-depth.
- **Password reset min-length aligned** with register (12 chars) — RA-1342.
- **HSTS (1-year + subdomains)** + `X-Frame-Options: DENY` + `nosniff` + conservative `Permissions-Policy`.
- **`serverExternalPackages`** correctly excludes `bcryptjs`, `jsonwebtoken` from client bundles.
- **Prisma everywhere, no `$queryRawUnsafe` in user-reachable routes** (the 8 matches are scripts / vector/RAG / ingestion — review separately but not in auth path).

---

## Notes for next auditor

- `app/api/properties/scrape/route.ts` uses hardcoded OTH/Domain bases — not a user-URL SSRF, OK.
- `app/api/admin/publish/app-store/route.ts` has a `fetch(url)` but the URL is env-sourced — OK.
- Recommend pen-testing the 2FA flow first once C1/C2 ship; half-baked 2FA is worse than none because it gives false assurance.
- Before GA, run `bun audit` locally and triage everything `>= high`.
