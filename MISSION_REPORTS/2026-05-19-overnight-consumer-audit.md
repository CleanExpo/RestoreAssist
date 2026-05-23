# RestoreAssist — Overnight Consumer Audit (2026-05-19)

**Auditor role:** Paying-consumer simulation + CEO Board gate (9 personas) + Senior PM second pass
**Scope:** `D:\RestoreAssist` codebase, Karpathy ship-chain, `.harness` Senior PM rounds 1–5, live **sandbox** + **prod** spot-check
**URLs:** https://restoreassist-sandbox.vercel.app · https://restoreassist.app

---

## Executive summary

| Layer | Verdict |
|-------|---------|
| **Sellability (Round 5)** | **AMBER** — GST/AUD on paid tiers OK; **P1 pricing copy fixed locally** (deploy pending); demo TTV still admin-only |
| **Reliability** | `/api/health` **20/20 sequential 200** on sandbox; false **Outage** on `/status` traced to SSR URL bug (**fix local, deploy pending**) |
| **Accessibility (Round 4)** | **FAIL** at scale (~90 unlabeled dashboard fields); **reduced-motion guard already in `globals.css`** (RA-1571) |
| **Board gate** | **APPROVED** — 6 Linear issues (5 filed via script when key present + 1 PM telemetry) |
| **Linear** | **Not created** — `LINEAR_API_KEY` absent from `.env.local` / process env → use `MISSION_REPORTS/linear-issues-manual.md` |
| **Code fixes shipped in repo** | `lib/pricing.ts` free tier, `app/pricing/page.tsx`, `app/status/page.tsx` SSR fetch, `pricing-integrity.test.ts` |

**Bottom line:** A paying contractor can browse marketing and pricing with improved honesty after deploy, but **cannot trust `/status` today on live sandbox**, **dashboard a11y blocks field crews**, and **iOS SSO (RA-2073)** remains a mobile churn risk. Do not announce GA until deploy + spot-check + Contrarian items tracked.

---

## Knowledge sources used

| Source | Path | Use |
|--------|------|-----|
| Karpathy ship-chain | `docs/ship-chain/00-index.md` … `04-karpathy-optimisations.md` | Evaluator mindset, single source of truth |
| Senior PM walks | `.harness/senior-pm-walkthrough-round-1.md` … `round-5.md` | UX, security, sellability rubric |
| Gap catalog | `docs/gap-catalog.md` | Infra/auth blockers |
| Board principles | `.claude/board-2026-04-18/progress-principles.md` | Governance |
| Pi governance gate | 9-persona pattern | Deliberation before Linear |
| Hermes wiki cross-ref | `D:\Hermes\wiki\entities\restoreassist.md` | Cross-project pointer |

---

## Live consumer journey

### Sandbox

| Route | Finding |
|-------|---------|
| `/` | Clear AU/IICRC positioning; footer Unite-Group Nexus; light social proof |
| `/pricing` | **P1 (live):** 30 vs 3 contradiction on free tier — **fixed in repo**, not yet on Vercel |
| `/login` | Email + Google; labeled fields OK |
| `/status` | **P2 (live):** False outage / empty checks — SSR fetch bug — **fixed in repo** |
| `/support` | Round 5 PASS |

### Prod spot-check

| Route | Finding |
|-------|---------|
| `/pricing` | Same 30 vs 3 mismatch until deploy; **ABN 62 580 077 456** in footer |
| `/status` | Same SSR symptom suspected (health API OK from edge, page does not render checks) |

### Product model clarification (post-audit)

| Concept | Truth in code |
|---------|----------------|
| **Marketing “Free” tier** | `PRICING_CONFIG.free.reportLimit = 3` one-time inspections |
| **Signup / trial** | `creditsRemaining: 30`, 30-day trial; `canCreateReport` allows unlimited during TRIAL |
| **Signup copy “30 free report credits”** | Aligns with **trial**, not the marketing free tier — keep distinct in UX |

---

## Fixes applied (this session)

1. **`lib/pricing.ts`** — Added `free` tier object (`reportLimit: 3`, aligned feature bullets).
2. **`app/pricing/page.tsx`** — Free plan + hero subtitle read from `PRICING_CONFIG.free`.
3. **`app/status/page.tsx`** — `fetchHealth()` uses `headers()` `x-forwarded-host` / `host` for same-origin SSR fetch on Vercel.
4. **`lib/__tests__/pricing-integrity.test.ts`** — Regression test: free tier copy must match `reportLimit`, no “30 free” drift.

**Tests run:** `pnpm exec vitest run lib/__tests__/pricing-integrity.test.ts` — **7/7 passed**.

**Not run:** `pnpm test:smoke:sandbox` (Playwright + env); full pilot e2e (credentials).

---

## CEO Board gate (9 personas — full)

**Action:** File overnight findings to Linear RestoreAssist; **no GA announcement**.

### CEO frame

**Real question:** Can we sell to a paying restoration contractor today without losing trust in the first 10 minutes?

**Fault lines:** Revenue (ship now) vs Product (measure TTV) vs Technical Architect (accuracy) vs Contrarian (a11y + iOS).

### Deliberation

| # | Persona | Vote | Rationale |
|---|---------|------|-----------|
| 1 | **Revenue** | APPROVE | Pricing contradiction is screenshot-able deal-killer; local fix approved for deploy |
| 2 | **Product Strategist** | APPROVE | File demo-loader + activation telemetry; hold broad GA until TTV measured |
| 3 | **Technical Architect** | APPROVE | Status bug is SSR/env, not API down; verify post-deploy on both envs |
| 4 | **Market Strategist** | APPROVE | GST/AUD present; strengthen trust footer (ABN on prod is good) |
| 5 | **Compounder** | APPROVE | Brand damage from contradictory limits > 1-day deploy delay |
| 6 | **Moonshot** | HOLD (defer) | Public ROI calculator — post-GA backlog |
| 7 | **AU Restoration Oracle** | APPROVE | IICRC/WHS messaging credible; fix limit honesty |
| 8 | **Contrarian** | CONDITIONAL | Reject GA until iOS SSO + dashboard a11y epic progress |
| 9 | **Operator / Execution** | APPROVE | Ship P1 fixes, manual Linear if no API key |

**VERDICT: APPROVED** — File issues; deploy pricing + status fixes; Contrarian conditions = RA-2073 + OA-6 epic, not blocking issue creation.

---

## Senior PM second pass

**Adds beyond initial report:**

1. Distinguish **free tier (3)** vs **trial (30 credits / unlimited reports)** in all customer-facing copy audits.
2. `prefers-reduced-motion` — **already implemented** in `app/globals.css`; close Round 4 motion item; keep field-label epic open.
3. Wire **activation events** (first report, first export, trial → paid) before next sellability review.
4. Re-run Lighthouse on `/pricing` + `/dashboard` after deploy.
5. Pilot sandbox run: `pilot-tester/README.md`.

**PM sign-off:** Ready for Linear ingestion (manual bodies prepared).

---

## Findings register

| ID | Issue | Priority | Status |
|----|-------|----------|--------|
| OA-1 | Free plan 30 vs 3 on `/pricing` | P1 | **Fixed locally** — deploy |
| OA-2 | `/status` false outage / missing health rows | P2 | **Fixed locally** — deploy |
| OA-3 | ~90 unlabeled dashboard fields | P1 | Open |
| OA-4 | No user-facing sample data loader | P2 | Open |
| OA-5 | iOS SSO gated (RA-2073) | P1 mobile | Open |
| OA-6 | Activation telemetry / TTV | P2 | Open (PM) |
| INF | Prisma migrate / env per gap-catalog | P0 ops | Human |

---

## Load / break tests

| Test | Result |
|------|--------|
| GET `/api/health` ×20 sequential (sandbox) | **20/20 HTTP 200** |
| GET `/api/health` ×20 parallel | Not completed — PowerShell 5.x / TLS tooling limits in agent shell |
| `pricing-integrity` vitest | **7/7 pass** |
| `test:smoke:sandbox` | Not run (needs Playwright + secrets) |

**Health JSON (sandbox):** `status: degraded` (missing Stripe etc.), DB reachable — consistent with honest **degraded** UI once SSR fix deploys.

---

## Linear push

| Item | Detail |
|------|--------|
| Script | `scripts/overnight-audit-linear-push.mjs` |
| Key | **Not found** in `.env.local` or process env (only `.env.example` template) |
| Manual | `MISSION_REPORTS/linear-issues-manual.md` (6 issues, copy-paste ready) |
| URLs created | **None** |

---

## Karpathy ship-chain alignment

- **Evaluator pass:** Consumer journey + health under load before wide release.
- **Optimisation:** `PRICING_CONFIG` as single source of truth for public tier copy (implemented for `free`).

---

## Remaining blockers

1. **Deploy** pricing + status fixes to sandbox → prod.
2. **LINEAR_API_KEY** for automated issue creation.
3. **OA-3** dashboard a11y codemod.
4. **RA-2073** iOS native SSO owner runbook.
5. **INF** gap-catalog env/migrate items for full e2e.

---

## Files changed (audit session)

| File | Change |
|------|--------|
| `lib/pricing.ts` | `free` tier config |
| `app/pricing/page.tsx` | Use `PRICING_CONFIG.free` |
| `app/status/page.tsx` | SSR health via request headers |
| `lib/__tests__/pricing-integrity.test.ts` | Free-tier drift test |
| `MISSION_REPORTS/linear-issues-manual.md` | New |
| `MISSION_REPORTS/2026-05-19-overnight-consumer-audit.md` | This report |
| `D:\Hermes\wiki\entities\restoreassist.md` | Cross-ref |

---

*Generated autonomously 2026-05-19. Reconcile live URLs after deploy.*
