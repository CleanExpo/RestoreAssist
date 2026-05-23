# Backlog audit — 2026-05-18

**Scope:** Everything still in flight that affects "production-ready + paying-client onboarding workflow."
**Method:** open-PR sweep · git log since 2026-04-15 · in-code TODO/FIXME sweep · MASTER_PLAN cross-ref · CLAUDE.md non-negotiables · handover / setup / billing spot-checks · punch-list reconciliation.
**Severity scale:** **P0** = pilot-blocker / data-loss / security · **P1** = ships-without-but-bleeds (Xero deadline, adoption, brand) · **P2** = nice-to-have / polish.
**Linear MCP:** **unreachable this session** (`Server not found` on `list_issues`). Backlog tickets quoted from MASTER_PLAN.md, not re-fetched. Re-query before Stage 1 kicks off.

---

## Open PRs (with state)

| # | Title | Author | Age | CI | Blocker? |
|---|---|---|---|---|---|
| 1116 | `chore(deps): bump react-resizable-panels 2.1.9 → 4.11.1` | dependabot | ~1d | Quality Checks **FAILURE** (jobs/76507858950); Vercel previews green | **P1** — Quality Gate red; major-version bump (2 → 4) may carry breaking API change. Do **not** merge until type-check + e2e pass. |
| 1109 | `chore(deps): bump tailwind-merge 2.6.1 → 3.6.0` | dependabot | ~1d | All green | P2 — safe to land. |

**Two open PRs only.** Sandbox / main are caught up post-#1117 release.

---

## In-code TODOs that block production

Real flagged-work items, filtered for production-impact. Pure-comment style notes (e.g. recovery-code grouping in `lib/auth/two-factor.ts:91`, NIR number format in `lib/dr-nrpg/inbound-mapper.ts:80`) excluded.

### P0 — pilot blocker

- **`lib/oauth-native.ts:64`** — Google OAuth Web client ID hardcoded as literal `"TODO-from-google-cloud-console-web-client-id"`. Any native (iOS/Android) sign-in that hits this path will fail until replaced. Trace where the constant is consumed before pilot.

### P1 — bleeds in production but won't stop a pilot

- **`app/api/inspections/[id]/guidewire/route.ts:174`** — `certifications: []` hard-stub; insurer Guidewire export ships an empty certs array. Fine for SP-A close, **wrong** for any Guidewire-integrated pilot (Beyond Clean uses an insurer pipe).
- **`app/api/inspections/[id]/guidewire/route.ts:262`** — `latitude: 0` hard-stub; GPS EXIF extraction unimplemented. Same risk: insurer payload has no geolocation.
- **`app/api/inspections/[id]/reopen/route.ts:139`** — `voidInvoice === true` branch is a no-op; reopening an invoiced inspection cannot reverse the Stripe charge. P1 for Stage 5 (Xero stability sprint, 2026-06-20 deadline).
- **`lib/cron/board-meeting.ts:34-35` / `lib/cron/scout-agent.ts:411`** — hardcoded fallback `LINEAR_RA_TODO_STATE_ID = "285c7d2f-…"` if env unset. If the Linear board state UUID drifts, scout-agent files tickets into the wrong state silently.
- **`lib/live-teacher/tools/flag-whs-hazard.ts:74`** — `userId: "system"` hard-stub for WHS hazard logs. Any pilot using Live Teacher has unattributed WHS records → audit-trail break under RA-1376 rule 21 (cryptographic chain-of-custody).
- **`lib/live-teacher/tools/capture-photo.ts:23`** — Cloudinary upload not wired (`sourceUri` ignored). Live Teacher photo-capture is dead-end.

### P2 — flagged but non-blocking

- **`lib/nir-bluetooth-service.ts:51–90, 406–420`** — five BLE UUIDs marked "TODO: validate" against manufacturer firmware. Bluetooth meter integration ships unverified. Acceptable for V1 pilot (techs can also manually enter readings), block before V2 floor-plan / hardware-bundled tier.
- **`lib/compliance/nzbs-compliance-gate.ts:15-69`** + **`safework-notification-gate.ts:23–113`** — RA-1120: `propertyCountry` not on Inspection schema; both gates are no-ops on all rows. Acceptable for AU-only pilot; **must** be resolved before any NZ tenant.
- **`lib/weather/auto-tag.ts:8` / `weather-provider.ts:6,218`** — `weatherSnapshot` Json column not added; NIWA (NZ weather) integration stubbed. Same NZ-tenant gate as above.
- **`lib/nir-location-services.ts:19–197`** — government flood-mapping API, state Planning Portal API, Heritage SA/VHR/NSW SHR lookups all stubbed. Drives location-context cards on inspection start; degrades to fallback.
- **`lib/ai/auto-classify.ts:365`** — `logAiUsage()` call commented out (RA-1087). AI usage telemetry not captured on this path; affects billing-reconciliation accuracy at high tech counts (not at 3 pilots).
- **`app/api/setup/hydrate/route.ts:16`** — rate-limit keyed on session OR IP (not strict `session.user.id`); violates Rule 10. **Tighten before Stage 7 Wave 2 ships SP-G AI Setup Agent on top.**
- **`app/api/setup/hydrate/stream/route.ts:1`** — 1s polling; should use Postgres `NOTIFY/LISTEN`. Polite optimization; not a blocker.
- **`app/api/live-teacher/turn/route.ts:24`** + **`lib/live-teacher/claude-cloud.ts:2,188,245`** — Live Teacher integration wired to placeholder modules; whole RA-1132 feature surface is half-stitched. Live Teacher is **not** on the pilot critical path; can ship dark.

---

## Half-shipped features

- **Live Teacher (RA-1132 series)** — server routes, type stubs, and 4 TODOs across `lib/live-teacher/` reference modules that "merge later." Surface is dark. Either gate it behind a feature flag (it currently mounts in dashboard navigation) or finish the merge chain. **P1 (P0 if the feature is on the pilot demo deck).**
- **NIR Bluetooth meters (`lib/nir-bluetooth-service.ts`)** — full driver code shipped, but all 5 device UUIDs are unverified against firmware spec. First time a tech connects a real meter is the field test. P2 unless a pilot is hardware-bundled.
- **`lib/ai/lifecycle/` hooks** — 1-of-6 shipped (`on-close.ts`). Missing: `draft-invoice.ts`, `auto-tag-photo.ts`, `next-action.ts`, `smart-search.ts`, `mirror-recovery.ts`. Spec §5 line items. P1 (each one is its own AI-quality-of-life win; none block close-to-handover flow).
- **Guidewire insurer export** — route ships, but `certifications` and `gps lat/long` are placeholder values (see TODOs above). Half a payload. **P0 if a pilot ships to a Guidewire-using insurer; P1 otherwise.**
- **App Store / Play Console submission** — Play Console restricted since 2026-04-08, App Store status unknown. iOS + Android binaries built; can't actually submit. Stage 6 in MASTER_PLAN. **P0 for any tech-on-phone pilot; P1 if pilots run desktop-only.**
- **`StorageMirrorJob` recovery hook** — model shipped (#1022) but `lib/ai/lifecycle/mirror-recovery.ts` placeholder above is what would reconcile a failed mirror. Dual-write currently logs but never auto-retries. **P1.**

---

## Paying-client onboarding gaps

Routes inventoried — most surface exists. Gaps are quality + edge-case, not missing-feature.

### Routes / pages that DO exist and look complete
- `/setup` page + `SetupShell` + `BrandCard`, `BusinessDetailsCard`, `IntegrationsCard`, `PricingCard`, `StorageCard`, `VideoExplainer` (8 setup components present).
- `/onboarding/account-type/page.tsx` — Google OAuth signup follow-up form (business name / ABN / state).
- `/billing/upgrade/page.tsx` + `TierGrid` + `CheckoutCTA` + `UpgradeHeader`.
- `/billing/success/page.tsx`.
- `app/api/setup/{activate,checks,hydrate,pricing,state}` — full Setup Wizard backend.
- `app/api/billing/{checkout,trial-status}` — Stripe checkout-session creation present, `getServerSession` enforced.
- `app/api/webhooks/stripe` — webhook receiver present.

### Real gaps

- **`app/api/setup/activate/route.ts:139`** — welcome-email links to `https://app.restoreassist.com.au/dashboard`. **Production domain is `restoreassist.app`** (confirmed memory — Phill has flagged the .com.au mistake twice already). **P0 — every newly-activated customer gets a dead link in their welcome email.** One-line fix.
- **No `/dashboard/billing` route.** Users in TRIAL or ACTIVE state have no dashboard surface to view their plan, change tier mid-cycle, see invoices, or cancel. Only `/billing/upgrade` (the funnel entry) and `/billing/success` (the receipt) exist. Stripe Customer Portal pattern is sketched in `app/api/subscription/portal` but the dashboard entry-point page is missing. **P1 — Stripe self-service is non-negotiable for a SaaS pilot; ATO compliance and tax-invoice access also flow through it.**
- **`/signup`, `/onboarding`, `/register` routing-discoverability** — `/signin → /login` redirect is now in `next.config.mjs:39` (good). `/onboarding` returns 404 (only `/onboarding/account-type` exists). Per punch-list P2 — fix or leave; not a critical blocker but adds support-ticket noise from "I tried /onboarding."
- **No `lib/lifecycle/subscribers/invoice-paid.ts`** — punch-list P1 item #21. Stripe webhook updates `Invoice.status = PAID` but inspection state does not advance through the close → invoice → paid → archive flow. **P1 — breaks the SP-A close terminal-state contract; tech sees stale "awaiting payment" status after the customer paid.**
- **Welcome email defaults** — `app/api/setup/activate/route.ts:140-141` hardcodes `trialDays: TRIAL_DAYS, trialCredits: 10`. Verify TRIAL_DAYS const matches the public marketing page; mismatch surfaces as "I was promised 14 days, got 7" support pings.
- **`TODO(setup-wizard Phase 7+): wire to existing analytics`** at `app/api/setup/activate/route.ts:9` — activation analytics is `console.log` only. No funnel metric for "Setup Wizard → activated user." **P2 — telemetry, not user-facing; can ship dark.**
- **Trial-status edge-case** at `app/api/user/trial-status/route.ts:54` — `TrialBanner` hide logic for LIFETIME/OWNER accounts only stubbed. P2.

---

## CLAUDE.md non-negotiable-rule violations in current code

Sampled — full sweep would need ~3 hours of route-by-route audit. Specific violations found:

| Rule # | Rule | Violation site |
|---|---|---|
| **2** | `session.user.id` is the rate-limit key, NOT IP | `app/api/setup/hydrate/route.ts:16` — TODO explicitly says "tighten rate limit key to session.user.id once…" |
| **20** | Read source before modifying — `propertyCountry` not on Inspection schema | `lib/compliance/nzbs-compliance-gate.ts:55,69` and `safework-notification-gate.ts:94,113` ship no-op gates because schema column was never added (RA-1120) |
| **14** | IICRC refs cite edition + section | `lib/nir-standards-mapping.ts:14` cites `S540:2023`; verify against current S540 edition. Likely fine but worth confirming. |
| **10** | Rate-limit keys must use `session.user.id` | `app/api/contractors/route.ts` uses `prefix: "contractors"` with no key arg — falls back to IP. **Documented as "public endpoint by design" with rate-limit-to-prevent-scraping; acceptable exception.** |
| **17** | Brand `#1C2E47` / `#8A6B4E` / `#D4A574` / `#050505` | Punch-list P2: `#D4A574` declared but unused; three different "dark bg" greys live in the wild (`slate-950`, `neutral-950`, `#050505`). Token hygiene, P2. |
| **15** | Australian compliance state codes via `lib/nir-jurisdictional-matrix.ts` | OK — verified used. |
| **9** | No `error.message` in 500s | 10 routes match `err.message`/`error.message`; most use `apiError` (RA-1548) which strips internally. Spot-check `app/api/forms/submit/route.ts` + `app/api/auth/register/route.ts` — both are pre-`apiError` migration. **P1 — RA-1548 envelope refactor is ~290 routes remaining per session memory; finish it.** |
| **11** | File uploads validate magic bytes | OK — `app/api/upload/route.ts` is canonical and used; SP-7 Seam F magic-byte gate shipped (#1024). |
| **3** | Admin routes re-validate via `verifyAdminFromDb()` | RA-3009 still In Progress — `/api/admin/seed-demo` uses `?key=` query secret instead of `verifyAdminFromDb`. **P0 if route is still reachable in prod.** |

### Likely-not-violations (false-positive on grep)
- 14 "no auth" route paths surfaced by the `grep -L getServerSession` sweep are intentional: `/api/test/*` (gated by `ALLOW_TEST_HELPERS` env), `/api/health/*` (health-check), `/api/observability/client-error` (pre-auth error sink), `/api/contractors` (public directory, rate-limited), `/api/portal/[token]/*` (token-based auth), `/api/invites/[token]` (token-based), `/api/authority-forms/sign/[token]` (token-based), OAuth callbacks. Each was sampled — design-justified.

---

## Progress Framework (RA-1376) remaining work

Rules 21–28 in `.claude/RULES.md`. Cross-ref against `lib/progress/**`.

| Rule | Status |
|---|---|
| **21 — Cryptographic chain-of-custody (C2PA manifest)** | `lib/progress/signature.ts` exists (Pi-Sign, RA-1703). Verify every evidence-capture path (`app/api/upload/route.ts`, `lib/live-teacher/tools/capture-photo.ts`) writes manifest. **`flag-whs-hazard.ts:74` uses `userId: "system"` — manifest user-hash is wrong on WHS hazard logs.** P1. |
| **22 — Append-only audit (no UPDATE/DELETE on `ProgressTransition` / `ProgressAttestation` outside cascade)** | `lib/progress/service.ts` line 9 explicitly enforces this. ✅ |
| **23 — Evidence-gated promotion (`{ok:false, missing:[]}`)** | `lib/progress/gate-policy.ts` + state machine implement this. ✅ |
| **24 — Offline-first capture + idempotent flush** | `lib/idempotency.ts` is wired into handover and other terminal routes. Verify mobile capture path flushes through same primitive. **Spot-check needed.** P2. |
| **25 — Role-based disclosure (`canPerformTransition`)** | `lib/progress/permissions.ts` exists; verify `<TransitionButton>` consumes it. P2 — verify, don't assume. |
| **26 — Immutable attestation (logical-delete only via `withdrawnAt`)** | `lib/progress/service.ts` enforces. ✅ |
| **27 — Deterministic integration fan-out** | `lib/progress/integrations/xero.ts` + `stabilisation-packet.ts` exist; **dedup by `(transitionId, integrationKey)` should be a unique constraint in schema — verify.** P1. |
| **28 — Engagement-time licence verification** | `Authorisation` model exists; verify check fires on attestation-write, not login. P2 — verify. |

### Hard finding (not in any Linear ticket yet)
- **`Authorisation.subjectLicenceClass` is free-text** (punch-list P1 #19) — 8 AU jurisdictions × multiple classes uncodified. Rule 28 hinges on this enum existing. **P1 — open ticket: enumify `subjectLicenceClass`.**

---

## Production blockers from MASTER_PLAN.md not yet in Linear

Re-promoted from the MASTER_PLAN aggregation — these are not in the open-Linear list per the plan author.

1. **🚨 Supabase RLS disabled on ~119 of ~180 prod tables** (`udooysjajglluvuxkijp`). Anyone with the anon key (which Next.js ships to the browser) can read/write `User`, `Account`, `Organization`, `UserInvite`, `Notification`, `ChatMessage`, `WebhookEvent`, `StripeWebhookEvent`, `SecurityEvent`, clinical assessment tables, integration auth tables (Xero, Ascora, DR/NRPG). **P0 — single biggest production-readiness gap not yet in Linear. Recent commits #1140/#1141/#1142/#1143 (RA-4827) are wrapping `auth.uid()` and indexing for the policies that DO exist; the RLS-disabled-table count itself is the remaining work. Open Linear P0 as sub-issue of RA-4956.**
2. **🟠 `NODE_TLS_REJECT_UNAUTHORIZED` in Vercel Production env vars (50d old)** — disables TLS cert verification. Documented in source as "dev/Ascora self-signed-cert workaround" (`app/api/ascora/{sync,connect}/route.ts`). **Verify this env var is NOT actually set in Vercel Production (the comments say "dev or prod" but it should be dev-only). P0 if set.**
3. **🟠 `deploy-production.yml` broken since 2026-04-25 (RA-3004)** — prod deploys haven't fired from CI in 24 days. Vercel-from-GitHub-default is doing it. Either fix or delete; clarify trigger surface.
4. **🟠 Decision pending — decommission `oxeiaavuspvpvanzcrjc` Supabase project** or document as deliberate dual-project state.

---

## Stage 5 Xero deadline (2026-06-20 ATO EOFY)

Per MASTER_PLAN; six issues all currently in pre-shipped state:

| Ticket | Title | Status | Severity for cutover |
|---|---|---|---|
| RA-902 | `syncInvoiceToProvider` is a stub in-memory queue | Open | **P0 — verify whether customer-exposed before EOFY** |
| RA-868 | `xeroTokenManager.ts` — centralised token refresh | Open | P0 |
| RA-869 | `xeroAccountCodeResolver.ts` — category routing | Open | P0 |
| RA-870 | Xero discount GST bug (taxType none, ABN `taxNumber`) | Open | P0 |
| RA-871 | `xeroWebhookProcessor.ts` — payment back-sync cron | Open | P0 |
| RA-920 | Xero stale event rejection blocks sync retries (409) | Open | P0 |

**Hard date math from MASTER_PLAN:** Stages 1+2 must close by **2026-05-25** to leave 19-day buffer for Stage 5. Today is 2026-05-18; **7 days to clear Stage 1+2.**

---

## Recommended sequence for cutover

Sequenced for the hard 2026-06-20 EOFY deadline + minimum-risk pilot launch.

1. **(today, < 4 hours)** Fix the welcome-email domain in `app/api/setup/activate/route.ts:139` (`app.restoreassist.com.au` → `restoreassist.app`). **Trivial P0; every new trial gets a dead link.** Open Linear ticket, one-commit PR.
2. **(today)** Open Linear P0 for **Supabase RLS on 119 tables** as sub-issue of RA-4956. This is the single biggest unmarked production gap. Estimate 2–3 days; sequence the policies in batches matching the existing #1140/#1141 RLS wrap pattern.
3. **(today)** Audit + remove `NODE_TLS_REJECT_UNAUTHORIZED` from Vercel **Production** env (keep in dev only). Confirm by `vercel env ls production | grep NODE_TLS`.
4. **(this week)** Close PR #1116 (react-resizable-panels major bump) — either resolve quality-check failure or close as won't-fix; it's blocking dependabot's next sweep.
5. **(this week — Stage 1)** Close RA-4956 + 5 sub-issues (RA-4951/4952/4859/4953/4954/4955) per MASTER_PLAN.
6. **(parallel — Stage 2)** Security cluster: RA-2989 (key rotation), RA-3009 (admin-seed-demo), RA-3034 (Supabase SERVICE_ROLE in git history), RA-3025 (.npmrc), RA-3004 (deploy-production.yml).
7. **(this week)** Land RA-1548 envelope migration on the ~10 remaining `error.message`-in-500 routes (`forms/submit`, `auth/register`, `forms/interview/*`, `progress/[reportId]/attest`, `addons/purchases`). Rule 9 violation surface.
8. **(this week)** Add `/dashboard/billing` page that mounts Stripe Customer Portal — non-negotiable for paying-pilot self-service.
9. **(2026-05-25 latest — Stage 3)** Beyond Clean soft-pilot 24h hold per `docs/PILOT_CUTOVER_CHECKLIST.md`. Stage 4 (Elite + CRSA) follows on day +2.
10. **(2026-05-25 → 2026-06-20 — Stage 5)** Xero Stability Sprint, all six tickets. **Hard ATO EOFY deadline.**
11. **(parallel — Stage 6)** Play Console + App Store escalation. Gmail watch already in place per session memory.
12. **(post-pilot — Stage 7)** Wave 2 implementation: SP-G AI Setup Agent → SP-6 Email BYOK → Customer Portal → SP-H Knowledge Substrate. Specs locked, implementation has not started.
13. **(opportunistic — Stage 9)** RA-2074 "Stay logged in" persistent sign-in (500-tech-target adoption blocker per wiki master plan).
14. **(post-Wave-2 — Stage 8)** RA-2947 V2 Floor Plan epic. 8 sub-tickets, 12–16 weeks.

---

## Notes

- **Linear MCP was unreachable for this audit.** Backlog ticket statuses (Todo / In Progress / Ready for Pi-Dev) quoted from MASTER_PLAN; verify Stage 1 ticket states with `mcp__claude_ai_Linear__list_issues` before kickoff.
- **Submit-route auto-COMPLETED bug** flagged in 2026-05-15 punch-list is **resolved** — `app/api/inspections/[id]/submit/route.ts:570` now writes `ESTIMATED` and is guarded by `__tests__/no-auto-complete.test.ts`.
- **/signin 404** flagged in punch-list is **resolved** — `next.config.mjs:39` `{ source: "/signin", destination: "/login", permanent: true }`.
- **`POST /api/inspections/[id]/reopen`** flagged missing in punch-list **is shipped** — route file present with apiError envelope. The `voidInvoice` branch inside it is still TODO (line 139), but the route itself exists.
- **`ClientPortalAccount` model** flagged missing in punch-list **is shipped** — `prisma/schema.prisma:407`.
- **POST handover route** flagged missing in punch-list **is shipped** — `app/api/inspections/[id]/handover/route.ts`, full state-machine + CAS + audit + signed-URL wiring; reviewed end-to-end and looks production-ready.
- **`SetupShell` + 8 setup components** all exist.
- **Setup wizard backend (`/api/setup/{activate,checks,hydrate,pricing,state}`)** all shipped with `getServerSession` enforcement.
