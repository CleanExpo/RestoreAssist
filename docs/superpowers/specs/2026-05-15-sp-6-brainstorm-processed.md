# SP-6 — Email Provider BYOK — brainstorm-processed (senior-consultant pass)

> **Status:** Processed in Phill's absence. Each open question carries Evidence → Candidates → Recommendation → Reversibility. Phill confirms/redirects each in ~5 min. No code touched.

> **Investigation discipline log:** read SP-6 spec, SP-E storage substrate (`lib/storage/index.ts` — Supabase-primary + async mirror), `lib/email-send.ts` (raw-fetch Resend, fire-and-forget), `lib/email-retry.ts` (RA-1552 jittered backoff, 3 attempts, re-throws on final fail), `lib/email-audit.ts` (`EmailAudit` table — report emails only today), `lib/credential-vault.ts` (AES-256-GCM, NEXTAUTH_SECRET fallback key), signin-jobclose-audit §10.2 (BYOE pillar), wiki `restore-assist.md` (BYOK story = setup-wizard hub) + `ccw.md` (first client = CCW, invoicing to insurers Allianz/IAG/QBE/Suncorp/RACQ).

---

## Open question 1 — Provider set (Resend + SendGrid + SES vs subset)

**Evidence**

- `resend` v6.12.3 already in tree; no `@sendgrid/mail`, no `@aws-sdk/client-ses`.
- Total platform volume: ~1–2k emails/month. Individual tenant peak (CCW insurance invoicing) likely <500/month.
- SP-E shipped 3 storage providers (Supabase / S3 / Google Drive) — symmetric BYOK story across pillars matters for the BYOE positioning (§10.2).
- AWS SES sandbox mode requires production-mode application (24-72h AWS review) — onboarding friction tenants will hit, then complain to Phill.

**Candidates**

1. **All three** (Resend + SendGrid + SES) — matches the spec as-written.
2. **Two (Resend + SendGrid)** — cover small + enterprise; defer SES until a tenant asks.
3. **Resend only, with multi-account** — every tenant brings their own Resend key; no provider abstraction in v1.

**Recommendation: (2) Resend + SendGrid for v1, SES deferred to v1.1.**

- SES forces a multi-day AWS sandbox approval gate that breaks the "paste key, validate, done" UX promise made elsewhere in the spec (§6). It's not graceful degradation — it's a wall.
- SendGrid covers the high-volume / enterprise need (CCW invoicing to insurers wants reputable IP + analytics) without the sandbox blocker.
- Provider abstraction (`EmailProvider` interface) lands in v1 regardless — adding `aws-ses-provider.ts` later is a 1-day task once a tenant actually requests it. **Don't ship dead code.**
- Reversibility: **high** — adding a provider is additive; no schema or contract change.

---

## Open question 2 — Default provider (Resend vs SES for cost-sensitive)

**Evidence**

- `lib/email-send.ts` is already Resend; switching the platform default means rewriting a working path.
- Resend $0.00075/email × 2000/month = **$1.50/month** — cost is not a constraint.
- SES = $0.10/1000 emails = **$0.20/month** — saves $1.30/month at platform scale. Negligible.
- Deliverability moat for platform sends (welcome, password reset) matters more than $1.30. Resend's verified-domain DKIM is automatic; SES requires per-region identity setup.

**Candidates**

1. **Keep Resend as `PLATFORM_RESEND` default** — zero migration; preserves existing deliverability.
2. **Switch platform default to SES** — cheapest, but introduces sandbox/region friction for the platform account itself.
3. **Configurable platform default via env var** — `PLATFORM_EMAIL_PROVIDER=resend|ses`, decide later.

**Recommendation: (1) Keep Resend as platform default.**

- Cost delta is below noise threshold. Switching providers is a deliverability risk (warm-up new IP) for $1.30/month savings.
- Tenant BYOK is the cost-optimisation lever — high-volume tenants pick SendGrid/SES on their own account; platform stays on Resend for fallback.
- Reversibility: **medium** — switching platform default later requires DNS + warm-up; do it once, do it now (Resend) or not at all in v1.

---

## Open question 3 — DKIM/SPF/DMARC strictness (warn vs block at connect)

**Evidence**

- Spec §3.6 already locks "verification at connect time" but leaves strictness open in §19.3.
- RA-1548 envelope requires anti-spoofing compliance; tenants doing insurer-bound invoicing (CCW → Allianz/IAG) need deliverability.
- `lib/email-retry.ts` re-throws on final failure (RA-1552) — callers already surface failures to users. The "graceful degradation" pattern is fail-soft for transient errors, not config errors.
- SP-E pattern: invalid storage config → falls back to Supabase silently. Email's failure mode is different — silent fallback to platform Resend hides the tenant's DNS problem.

**Candidates**

1. **Warn only** — yellow banner; send goes via BYOK regardless of DKIM status.
2. **Block at connect** — `validate()` returns `valid: false` if DKIM inactive; tenant cannot save the provider config until DNS is fixed.
3. **Warn at connect, downgrade to fallback at send-time** — save the config, but the dispatcher routes via platform Resend until DKIM verified; banner reads "BYOK paused — fix DKIM to activate."

**Recommendation: (3) Warn at connect, downgrade to fallback at send.**

- Pure warn (1) lets tenants ship invoices that get spam-filtered by Allianz's mail gateway — the user sees "sent successfully" and the insurer never receives. Worst outcome.
- Hard block (2) is unfriendly — tenant pastes valid key, hits a wall, doesn't understand DNS. Setup-wizard abandonment.
- (3) preserves the spec's fail-soft promise while protecting deliverability. The status block in `/dashboard/settings/email` is the UX surface for the fix loop.
- Reversibility: **medium** — adding "paused" state is one enum value + one banner; relaxing it later is one DB update.

---

## Open question 4 — Fallback chain behaviour (BYOK ↔ platform)

**Evidence**

- Spec §4.5 says: BYOK up → BYOK; BYOK down/invalid → platform; no BYOK → platform.
- SP-E inverts this: **Supabase is always primary**, Drive/S3 is async mirror. Hot path never falls through to BYOK.
- CLAUDE.md rule 13: "All sync is fire-and-forget — failures queue to dead-letter, never block user-facing requests."
- Critical-path emails (password reset, invite, signup confirmation) cannot wait for a BYOK provider that's having a regional outage. RA-1552 retry window is seconds-to-minutes; BYOK outages can be hours.

**Candidates**

1. **Spec as-written** — BYOK primary, platform fallback on detected failure (current draft §4.5).
2. **SP-E parity** — platform primary on hot path, BYOK async mirror via `EmailSendJob` queue. User always gets the email; tenant gets the deliverability/analytics benefit on the queue replay.
3. **Email-class split** — transactional (password reset, invite, OTP) goes platform-Resend always; bulk/business (invoices, handover packages, reports) goes BYOK with platform fallback.

**Recommendation: (3) Email-class split.**

- (1) means a SendGrid outage breaks password reset = locked-out users = support tickets.
- (2) defeats the BYOK deliverability moat for the emails tenants actually care about (invoices reaching insurers from `@tenantdomain.com.au`).
- (3) gives each class its correct primary: transactional uses the always-warm platform IP; business uses the tenant-owned domain.
- Implementation: dispatcher accepts `emailClass: "transactional" | "business"` and routes accordingly. Defaults to `business` (BYOK-preferred) for new call sites; `transactional` explicit at password-reset / invite / verification call sites.
- Reversibility: **medium-low** — once tenants depend on "invoices send from my domain", reverting to platform-primary is a deliverability/branding regression. Get the routing right v1.

---

## Open question 5 — `EmailSendJob` queue depth + dead-letter handling

**Evidence**

- Spec §7.3: status `pending | sent | failed | skipped`; no DLQ concept.
- `lib/integrations/sync-queue.ts` (SP-E pattern referenced §14) uses `nextAttemptAt` + max-attempts; permanent failures stay rows with `status=failed`.
- RA-1552 retry: 3 attempts, jittered, re-throws. SP-6 queue should pick up where the request-lifecycle retry gives up.
- 2000 emails/month = ~70/day = trivial queue depth. Cron at 60s interval is sufficient.

**Candidates**

1. **5 attempts over 24h, then `status=failed` + org-owner notification.**
2. **3 attempts over 1h, then DLQ table + Linear-ticket fire-and-forget.**
3. **Unbounded with capped backoff (max 6h between attempts), expire after 72h.**

**Recommendation: (1) — 5 attempts, exponential backoff (1m, 5m, 30m, 2h, 6h), then `status=failed` + email org-owner via platform-Resend.**

- 24h window covers regional cloud outages without giving up too fast; matches industry transactional-email retry conventions (SendGrid/Postmark both retry ~72h, but RA tenants want to know sooner).
- Org-owner notification on permanent failure uses the platform fallback path (§4.5) — never the failing BYOK.
- No separate DLQ table — `EmailSendJob status=failed` IS the DLQ. Admin UI later (out of scope) can surface failed rows.
- Queue-depth cap: not needed at this volume. Add `@@index([orgId, status])` (already in spec) — that's enough.
- Reversibility: **high** — tune retry counts via env var; trivial.

---

## Open question 6 — Reply-To routing (per-tenant vs platform)

**Evidence**

- Spec §4.1 `send()` signature already accepts `replyTo?: string`.
- Current call sites in `lib/email.ts` — most omit reply-to (relies on `from: noreply@restoreassist.app`); a few (invite, signed-form) pass the admin/sender's email.
- CCW's invoicing email: insurer replies should reach the tenant's accounts team (`accounts@ccwarehouse.com.au`), NOT RestoreAssist support.
- `Organization` model already has an `email` field per spec §4.2; can serve as default reply-to.

**Candidates**

1. **Platform-wide reply-to** — all emails reply to `support@restoreassist.app`. Simplest.
2. **Per-org reply-to** — `Organization.replyToEmail` field; defaults to `Organization.email`; per-call override possible.
3. **Per-email-class reply-to** — transactional → platform support; business → tenant org email; per-call override.

**Recommendation: (3) Per-email-class reply-to, matching the class split from Q4.**

- Transactional (password reset, signup verification): reply-to `support@restoreassist.app` — replies need to reach the platform, not the tenant org owner who can't help with auth bugs.
- Business (invoice, handover, report-completed): reply-to `Organization.replyToEmail ?? Organization.email` — replies are about that tenant's job; must reach them.
- Adds one Prisma field `Organization.replyToEmail String?` (additive, no backfill — falls back to `Organization.email`).
- Reversibility: **high** — adding the override field later is trivial; changing the default after tenants depend on it is medium friction.

---

## Refined open-question summary (for Phill 5-min review)

| #   | Question         | Recommendation                                                                                                 | Reversibility |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Provider set     | Resend + SendGrid for v1; SES deferred                                                                         | high          |
| 2   | Platform default | Keep Resend                                                                                                    | medium        |
| 3   | DKIM strictness  | Warn at connect; downgrade to fallback at send until verified                                                  | medium        |
| 4   | Fallback chain   | Email-class split: transactional→platform-primary, business→BYOK-primary+platform-fallback                     | medium-low    |
| 5   | Queue retry/DLQ  | 5 attempts over 24h; `status=failed` = DLQ; notify org-owner via platform fallback                             | high          |
| 6   | Reply-To         | Per-class: transactional→support@restoreassist.app, business→`Organization.replyToEmail ?? Organization.email` | high          |

## Spec changes implied (one-paragraph diffs Phill confirms)

- **§5** — strike SES section; move to a new §12.x "Wave 2 candidates" with rationale.
- **§4.1** — `EmailProvider.send()` payload gains `emailClass: "transactional" | "business"` (required) and `replyTo` becomes the resolved value (not optional in dispatcher).
- **§4.5** — replace single fallback chain with the class-split routing matrix from Q4.
- **§7.2** — add `Organization.replyToEmail String?` + `emailProviderState EmailProviderState` enum (`ACTIVE | PAUSED_DKIM_PENDING | DISABLED`).
- **§7.3** — `EmailSendJob.emailClass` field; retry contract documented (5 attempts, backoff 1m/5m/30m/2h/6h).
- **§11** — DKIM verification flow tightened: save config in `PAUSED_DKIM_PENDING`, dispatcher routes via platform fallback until validation passes.
- **§19** — open questions 1–6 closed (reference this file); only Phill's redirects remain.

## Carrying assumptions explicitly (for Phill to challenge)

1. CCW is the first business-email customer; their `business`-class email (invoicing to insurers) is the deliverability priority.
2. Volume forecast (1–2k/month platform, <500/month per tenant) stays valid for 6 months; revisit at 10× growth.
3. Phill has access to verify on `resend.com` and `sendgrid.com` dashboards during E2E gate; no new account creation needed.
4. `Organization.email` is currently truthy for all production orgs (used as reply-to default).

---

## Verification ledger (mandatory)

- **Did:** Read SP-6 spec, the SP-E storage substrate, `lib/email-send.ts`, `lib/email-retry.ts`, `lib/email-audit.ts`, `lib/credential-vault.ts`, `lib/storage/index.ts`, signin-jobclose-audit §10.2, wiki `restore-assist.md` + `ccw.md`. Wrote this processed-brainstorm file.
- **Verified-with-citation:** SP-E pattern is Supabase-primary + async mirror (cited `lib/storage/index.ts:43-60` + comments at lines 50-55); Resend is the only email SDK in tree (no SendGrid/SES imports, grep clean); CCW is first business-class customer per wiki `ccw.md:20,30` + restore-assist.md:51-52 (Allianz/IAG/QBE/Suncorp/RACQ insurers). Volume estimate from SP-6 spec §1.
- **Would-change-my-mind:** (a) if Phill confirms CCW's tenant is fine receiving invoice replies at `support@restoreassist.app` (kills Q6 split); (b) if a tenant already requested SES specifically (re-includes it in Q1); (c) if RA-1552 retry budget was tightened recently to <3 attempts (would push Q5 toward shorter window).
