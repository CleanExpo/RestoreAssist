# Free Trial → 50 Report Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the honest free-trial report-credit grant from 30 to 50 (trial length 15 days and Quick Fill credits 30 unchanged), via the `PRICING_CONFIG` single source of truth.

**Architecture:** `lib/pricing.ts` → `PRICING_CONFIG.free` is the SSOT. All 4 signup paths, the trial report cap (`lib/report-limits.ts`), and the display pages already derive their numbers from it, so the only edits are the config value + its `reportLimit` alias + the two marketing-copy strings, plus the two test assertions that pin the literal `30`.

**Tech Stack:** TypeScript, Next.js, Vitest.

## Global Constraints

- **SSOT only:** change the number in `PRICING_CONFIG.free` — do NOT hardcode `50` in signup routes, the cap, or display pages (they read from config; the integrity test forbids hardcoding).
- **Change exactly these:** `trialReportCredits` 30→50, `reportLimit` 30→50, and the two `30 inspection report credits` copy strings → 50.
- **Do NOT change:** `trialDays` (15), `trialQuickFillCredits` (30), Quick Fill copy, or any paid-plan config.
- **No retroactive top-up:** existing trial users keep their balances (the change affects new grants and the cap going forward). No migration/backfill.
- **Repo:** Vitest (`globals: true`), pnpm; `npm run build` is the final gate.
- Branch `feat/trial-50-report-credits` (already created off current `main`).

## File Structure

- Modify: `lib/pricing.ts` — `PRICING_CONFIG.free` (the SSOT value, alias, and copy).
- Modify: `lib/__tests__/pricing-integrity.test.ts` — the `trialReportCredits` literal assertion + comment.
- Modify: `lib/__tests__/trial-report-cap.test.ts` — the `trialReportCredits` literal assertion + describe/comment strings.

No new files; everything else derives from the SSOT.

---

## Task 1: Bump trial report credits 30 → 50 (SSOT + copy + test expectations)

**Files:**
- Modify: `lib/pricing.ts:29,33,35,38`
- Modify: `lib/__tests__/pricing-integrity.test.ts:22,25`
- Modify: `lib/__tests__/trial-report-cap.test.ts:5,71,241,249,251`

**Interfaces:**
- Consumes: `PRICING_CONFIG.free.trialReportCredits` (number) — read by the 4 signup routes, `lib/report-limits.ts`, and the display pages (unchanged).
- Produces: `PRICING_CONFIG.free.trialReportCredits === 50` and `reportLimit === 50`; trial marketing copy reads "50 inspection report credits".

- [ ] **Step 1: Update the test expectations to 50 (RED)** — the two literal assertions and the comments/describe strings that name the count.

In `lib/__tests__/pricing-integrity.test.ts`:

```typescript
// line ~22 — comment
    // Decided model: a 15-day free trial that grants 50 report credits.
```
```typescript
// line ~25 — the literal assertion
    expect(free.trialReportCredits).toBe(50);
```
(Leave line 24 `expect(free.trialDays).toBe(15);` and line 28 `expect(free.reportLimit).toBe(free.trialReportCredits);` exactly as-is — the latter is value-agnostic.)

In `lib/__tests__/trial-report-cap.test.ts`:

```typescript
// line ~5 — comment (header)
 *      PRICING_CONFIG.free.trialReportCredits (50) reports, so the "50 report
```
```typescript
// line ~71 — describe name
describe("canCreateReport — trial 50-report cap", () => {
```
```typescript
// line ~241 — describe name
describe("every signup path grants a ~15-day / 50-credit trial from PRICING_CONFIG", () => {
```
```typescript
// line ~249 — it name
  it("PRICING_CONFIG is the 15-day / 50-credit SSOT", () => {
```
```typescript
// line ~251 — the literal assertion
    expect(PRICING_CONFIG.free.trialReportCredits).toBe(50);
```
(Leave line 250 `expect(PRICING_CONFIG.free.trialDays).toBe(15);` as-is. Leave the incidental `creditsRemaining: 30` on line ~101 — that test asserts trial **expiry**, not the cap value, and only needs a positive number.)

- [ ] **Step 2: Run the tests to confirm they fail (RED)**

Run: `npx vitest run lib/__tests__/pricing-integrity.test.ts lib/__tests__/trial-report-cap.test.ts`
Expected: FAIL — `pricing-integrity` reports `expected 30 to be 50` on `trialReportCredits`, and `trial-report-cap` fails the same `.toBe(50)`. (Config is still 30.)

- [ ] **Step 3: Change the SSOT value + alias + copy (GREEN)**

In `lib/pricing.ts` → `PRICING_CONFIG.free`:

```typescript
    /** Report credits granted on signup. Mirrors `creditsRemaining` in register/route.ts. */
    trialReportCredits: 50,
```
```typescript
    /** @deprecated Use `trialReportCredits`. Kept so display cards reading `reportLimit` still work. */
    reportLimit: 50,
```
```typescript
    description:
      "Try Restore Assist free for 15 days — 50 inspection report credits with basic features. No credit card required.",
```
```typescript
    features: [
      "15-day free trial",
      "50 inspection report credits",
```
(Do NOT touch `trialDays: 15`, `trialQuickFillCredits: 30`, or the `"30 Quick Fill credits …"` feature line.)

- [ ] **Step 4: Run the tests to confirm they pass (GREEN)**

Run: `npx vitest run lib/__tests__/pricing-integrity.test.ts lib/__tests__/trial-report-cap.test.ts`
Expected: PASS. (The copy-lock-step assertion in `pricing-integrity.test.ts` — `features.some(f => f.includes(\`${free.trialReportCredits} inspection report\`))` — now matches because both the config value and the copy say 50.)

- [ ] **Step 5: Verify no surface hardcodes the old number**

Run:
```bash
grep -rnE "30[ -]*(inspection )?report" --include='*.ts' --include='*.tsx' app components lib | grep -vE "__tests__|Quick Fill"
```
Expected: no output (display pages and routes derive from the SSOT; the only `30`s left are Quick Fill / paid-plan values). If anything prints a "30 ... report" string, change it to read from `PRICING_CONFIG.free.trialReportCredits` (do not hardcode 50).

- [ ] **Step 6: Build gate**

Run: `NODE_OPTIONS="--max-old-space-size=8192" npm run build`
Expected: exit 0 (compiles cleanly; this is a config/copy change, no new deps/imports).

- [ ] **Step 7: Commit**

```bash
git add lib/pricing.ts lib/__tests__/pricing-integrity.test.ts lib/__tests__/trial-report-cap.test.ts
git commit -m "feat(pricing): raise free-trial report credits 30 -> 50

trialReportCredits (and the deprecated reportLimit alias + marketing copy)
go 30 -> 50 in the PRICING_CONFIG SSOT. All signup grants, the trial report
cap, and display pages derive from it, so the usable cap follows to 50.
15-day length and 30 Quick Fill credits unchanged; no retroactive top-up."
```

---

## Self-Review

**Spec coverage:**
- Success #1 (new signups grant 50 report / 30 Quick Fill / 15 days) — Step 3 changes the SSOT the 4 routes read; trialQuickFillCredits/trialDays untouched. [x]
- Success #2 (cap follows to 50; 51st blocked) — the cap derives from `trialReportCredits` (`lib/report-limits.ts`), so no edit needed; credit-exhaustion enforces it. [x]
- Success #3 (signup/pricing/email read "50") — display pages read from config (verified); copy strings updated in Step 3. [x]
- Success #4 (both suites pass) — Steps 2 & 4. [x]
- Success #5 (`npm run build` passes) — Step 6. [x]
- "No retroactive top-up" — Global Constraints; no migration task by design. [x]
- Out of scope (paid plans, Quick Fill, trial length, tiers) — explicitly not touched. [x]

**Placeholder scan:** No TBD/TODO; every step has the exact code/command. [x]

**Type/name consistency:** `trialReportCredits`, `reportLimit`, `trialQuickFillCredits`, `trialDays`, `PRICING_CONFIG.free` used identically across config + both test files. [x]
