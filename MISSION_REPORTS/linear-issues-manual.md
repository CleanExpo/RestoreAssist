# Linear issues — manual create (no LINEAR_API_KEY)

**Team:** RestoreAssist (`a8a52f07-63cf-4ece-9ad2-3e3bd3c15673`)
**Workspace:** unite-group
**Script (when key available):** `node scripts/overnight-audit-linear-push.mjs`

---

## 1. [Overnight Audit] Free plan copy: 30 reports in bullets vs 3 in limit badge

**Priority:** Urgent (P1)
**Status:** Partial fix in repo — `PRICING_CONFIG.free` + `/pricing` wired; **deploy required**. Signup still correctly advertises **30 trial credits** (separate from free tier).

**Description:**

**Consumer impact:** Paying prospect reads contradictory limits on `/pricing` — erodes trust before signup.

**Evidence:** Sandbox/prod pricing showed "30 free inspection reports" in feature list but "3 Inspection Reports (one-time)" in limit callout.

**Fix (local):** `lib/pricing.ts` `free` tier with `reportLimit: 3`; `app/pricing/page.tsx` reads from config; `pricing-integrity.test.ts` guards drift.

**Remaining:** Align dashboard pricing helper text if product intends trial-only messaging on signup (signup `creditsRemaining: 30` is intentional for 30-day trial).

**Board:** Revenue + Product Strategist — APPROVED for filing.

---

## 2. [Overnight Audit] Status page SSR health fetch fails on Vercel edge

**Priority:** High (P2)
**Status:** Fix in repo — `app/status/page.tsx` uses `headers()` host for same-origin `/api/health`; **deploy required**.

**Description:**

`/status` showed **Outage — Health endpoint unreachable from public edge** while `GET /api/health` returned **200** from CLI/browser.

**Root cause:** SSR `fetchHealth()` built URL from `VERCEL_URL` (host-only) or missing `NEXT_PUBLIC_APP_URL`, so server-side fetch failed.

**Verify after deploy:** Sandbox + prod should show component rows (DB, storage, etc.) and overall **degraded** when env vars missing, not false outage.

---

## 3. [Overnight Audit] WCAG: ~90 unlabeled dashboard fields (Round 4 carry)

**Priority:** Urgent (P1)

**Description:**

Senior PM Round 4: widespread inputs without accessible names in authenticated dashboard flows.

**Note:** `globals.css` already includes `@media (prefers-reduced-motion: reduce)` (RA-1571). This issue is **field labeling**, not motion.

**Fix:** Codemod / audit pass on dashboard forms; re-run Lighthouse on `/dashboard`.

---

## 4. [Overnight Audit] User-facing Load sample data (demo TTV)

**Priority:** Normal (P3)

**Description:**

Seed/demo APIs exist (admin-only). Paying evaluator cannot experience most features without admin access.

**Sellability Round 5:** PARTIAL on demo mode.

**Proposal:** Dashboard CTA "Explore with sample data" gated to sandbox + opt-in on prod.

---

## 5. [Overnight Audit] iOS Google/Apple sign-in still gated (RA-2073)

**Priority:** Urgent (P1)

**Description:**

Login shows Google button on web sandbox. RA-2073 runbook: native sign-in gated on iOS App Store build.

**Consumer sticky point:** Mobile installer expects SSO; broken loop = churn.

**Refs:** `docs/RA-2073-OWNER-RUNBOOK.md`

---

## 6. [Overnight Audit] Activation telemetry / time-to-first-report

**Priority:** Normal (P3)
**Source:** Senior PM second pass (board discussion, non-blocking)

**Description:**

Round 5 sellability PARTIAL: no product analytics on first report, first export, trial conversion. Wire events before next GA review.

---

*Generated 2026-05-19 overnight consumer audit.*
