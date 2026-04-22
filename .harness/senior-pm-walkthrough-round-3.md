# Senior PM Walkthrough — Round 3 — 2026-04-22
## Round rubric: is every touchpoint consistent (emails / API / UI)?

**Exit criterion:** shared design tokens, unified validation shapes, single AU English voice.

**Method:** static analysis on `/tmp/pi-ceo-workspaces/ra-1494-directurl/` post-Round-2 (scaffolds landed: `lib/api-errors.ts`, `lib/fetch-with-retry.ts`, `lib/client/parse-api-error.ts`, `useFetchWithError`, `lib/email-retry.ts`, `lib/webhook-audit.ts`, `lib/audit-log.ts`, colocated `error.tsx`). Counted drift surfaces across API / emails / UI / AU copy / invoice PDF.

---

## Working — patterns already consistent

- **`lib/api-errors.ts`** exists from Round 2 — `apiError(code, message, status, eventId)` helper with shape `{ error, code, eventId }`. Adopted in 4 routes (`estimates/[id]/status`, `invoices/[id]`, `integrations/[id]`, `admin/users/[id]`). Template is sound; needs codemod.
- **`lib/email-templates.ts`** — the five lifecycle templates (Inspection Submitted, Scope Ready, Invoice Generated, Drying Goal Achieved, Report Ready) share a single `layout()` / `badge()` / `infoTable()` / `ctaButton()` primitive set. Brand tokens (#0f172a / #3b82f6 / #f8fafc) consistent. Footer disclaimer, sign-off, subject-line pattern `{Event} — {Number}` all uniform. Invoice email correctly uses `Intl.NumberFormat("en-AU", AUD)`. **This file is the gold standard** — the rest of the app should look like this.
- **AU voice in templates** — "colour" used in `badge()`, no US spellings surfaced in `lib/email-templates.ts`.
- **Colocated `loading.tsx`** — 88 files across dashboard use `Skeleton`/`animate-pulse` reasonably consistently (shadcn `Skeleton`).
- **No native `confirm()` in `/app/portal/**`** — 0 occurrences. Portal is clean.
- **shadcn `AlertDialog` in use** — 119 references across 6 files (invoices/templates, restoration-documents, contractors/certifications, forms/interview, team, reports). Pattern exists; just needs to replace the 6 remaining `confirm()` calls.

---

## Missing — rubric item not yet met

1. **API envelope inconsistency (rubric #1).** Only **4 files** (22 call sites) use `apiError()`. Grep of `NextResponse.json({ error | message | detail })` matches **100+ routes**. Shape drift: some return `{ error: "..." }`, some `{ message: "..." }`, some `{ detail: "..." }`, some `{ error, details: [...] }`. Client `parseApiError` can only recover the first shape. Top offenders (by occurrence count): `app/api/reports/[id]/download/route.ts` (16), `app/api/reports/[id]/generate-detailed/route.ts` (13), `app/api/reports/generate-cost-estimation/route.ts` (14), `app/api/reports/generate-scope-of-works/route.ts` (11), `app/api/analytics/route.ts` (3), `app/api/team/invites/route.ts` (4), `app/api/pricing-config/route.ts` (4).

2. **Two toast libraries coexist (rubric #3).** Both `sonner` (`components/ui/sonner.tsx` + call sites) AND `@/hooks/use-toast` (shadcn toaster) are imported across ~122 files. 145 total `toast(` / `useToast` / `sonner` occurrences. Same success confirmation renders differently depending on which the dev grabbed. Pick one; codemod the other.

3. **Inline formatting instead of `lib/formatters.ts` (rubric #6).** No `lib/formatters.ts` exists. `toLocaleDateString()` / `.toFixed(2)` appear **226 times across 85 files**. Drift examples: `toLocaleDateString("en-US")` vs `("en-AU")` vs bare `toLocaleDateString()` (browser-locale-dependent) — AU invoice dates will render `mm/dd/yyyy` for US-locale browsers. Currency likewise: some inlines use `$${n.toFixed(2)}` (no thousand separator), others `Intl.NumberFormat("en-AU", AUD)`.

4. **No shared `EmptyState` component (rubric #5).** Grep `EmptyState|empty-state` → only 5 files, and those are unrelated text matches — there is no `components/ui/empty-state.tsx`. Each list page (clients, invoices, inspections, reports, integrations) renders its own ad-hoc "No X yet" div with different icon / headline / CTA patterns.

5. **No breadcrumbs (rubric #8).** Grep `Breadcrumb|breadcrumb` across `/app/dashboard` → **1 file** (`forms/submissions/page.tsx`). Detail pages for invoices/reports/inspections/clients have no breadcrumbs — navigation context is lost on deep routes.

6. **No shared `StatusBadge` (rubric #7).** Grep `StatusBadge|status-badge|status-pill` → 3 files only, and two are local `StatusPipeline` components. Each page hand-rolls `Badge` variant logic, so "Draft" is grey in `invoices`, amber in `reports`, and `secondary` default in `inspections`. Verbs also drift: `inspections` uses `DRAFT|IN_PROGRESS|SUBMITTED|APPROVED`, `invoices` uses `Draft|Sent|Paid|Overdue|Void`, `reports` uses `draft|in_review|final`. No canonical lexicon.

---

## Drifting — inconsistencies across touchpoints

7. **Native `confirm()` still present in dashboard (rubric #10).** 6 files: `dashboard/subscription/page.tsx`, `dashboard/integrations/page.tsx`, `dashboard/inspections/[id]/page.tsx`, `dashboard/contractors/service-areas/page.tsx`, `dashboard/contractors/reviews/page.tsx`, `dashboard/contractors/profile/page.tsx`. Breaks shadcn consistency; destructive actions feel like a different app.

8. **AU English drift (rubric #11).** 58 occurrences of `organization|organize|favorite|customize|canceled` across 20 user-facing files (top offenders: `app/api/user/profile/route.ts` ×9, `app/api/admin/seed-demo/route.ts` ×7, `app/api/auth/register/route.ts` ×5, `app/dashboard/analytics/components/BillingOverview.tsx` ×5, `app/api/admin/stats/route.ts` ×2, `app/dashboard/team/page.tsx` ×4). Schema/DB column names aside, the user-visible strings/labels must be AU.

9. **Button-copy drift (rubric #4).** Same semantic action, 4 different verbs depending on surface. Drift clusters observed:
   - **Save drift**: `Save` (settings), `Save Changes` (profile), `Update` (client edit), `Submit` (forms/interview).
   - **Delete drift**: `Delete` (invoices), `Remove` (team members), `Archive` (clients), `Deactivate` (admin/users).
   - **Cancel drift**: `Cancel`, `Dismiss`, `Close`, `Back`.
   - **Create drift**: `Create`, `Add`, `New`, `+ Invoice`.
   - **Send drift**: `Send`, `Send Email`, `Email Invoice`, `Deliver`.

10. **ATO compliance: invoice PDF does NOT say "Tax Invoice" (rubric #12).** `lib/invoices/pdf-generator.ts:193` draws the literal text `"INVOICE"`. ATO GSTR 2013/1 requires "Tax Invoice" wording for any taxable supply where GST is claimable (>$82.50 inc. GST). **Compliance-blocking.** The templates doc (`docs/compliance/AU-GST-TAX.md`) acknowledges this; the PDF generator never picked it up. `RestorationInvoiceForm.tsx` also renders "Invoice" in the header.

11. **Tax-term drift.** 27 occurrences of `VAT|Tax Invoice|ABN` across 17 files but the split is: ABN appears on customer blocks only (invoice PDF line 534 OK), whereas the product copy sometimes says "Tax ID" (onboarding / admin seed), sometimes "VAT" (quote page, onboarding/account-type ×3). User-facing strings should be "ABN" in AU. `Tax Invoice` proper appears only in the `restoration-documents` flow, not the main `/invoices` flow.

12. **Loading affordance drift (rubric #9).** While 88 files use `Skeleton`, a long tail of pages still render `"Loading..."` text or an inline spinner mid-page (e.g. `app/dashboard/pricing-config/loading.tsx` uses skeleton but `app/dashboard/admin/pilot/page.tsx` inlines a spinner; `app/dashboard/notifications/page.tsx` mixes both). Skeleton vs spinner vs text-only is surface-by-surface.

---

## Opportunities — round-3 consistency wins

- **`components/ui/empty-state.tsx`** with `{ icon, title, description, cta }` props. One component, adopt on /clients, /invoices, /inspections, /reports, /integrations.
- **`components/ui/status-badge.tsx`** with a canonical `STATUS_TOKENS` map (`DRAFT → slate`, `PENDING → amber`, `APPROVED/PAID → emerald`, `OVERDUE/FAILED → rose`, `VOID/CANCELLED → zinc`). Invoices/reports/inspections/estimates all import from one place.
- **`lib/formatters.ts`** exporting `formatCurrency(n)`, `formatDate(d)`, `formatDateTime(d)`, `formatPercent(n)` — all locked to `en-AU`. Codemod 226 inline call-sites.
- **Single toast library.** Pick `sonner` (it's the newer one; shadcn's own default now). Remove `hooks/use-toast.ts` and `components/ui/toaster.tsx`; codemod imports.
- **`apiError` codemod.** Round 2 shipped the helper; round 3 needs to actually migrate the ~160 routes. Given the 100+ file count this is an L; a scaffold-first approach (migrate hot paths in invoices/reports/inspections first) is defensible.
- **Breadcrumb primitive.** shadcn has `<Breadcrumb>` — drop into dashboard layout with per-route slugs from `usePathname()`.
- **AU-English ESLint rule.** Simple custom rule banning `organization|organize|favorite|customize|canceled|color(?! tokens)` in JSX string literals — enforces at build time, prevents regression.

---

## Round-1/2 regression check

- **Round 1 (RA-1539-1545) shipped** — spot-verified: `components/ui/toaster.tsx` still present (though sonner now coexists → see ticket #2), `error.tsx` boundaries in place.
- **Round 2 (RA-1547-1558) shipped** — spot-verified: `lib/api-errors.ts` exists (√), `lib/fetch-with-retry.ts` (√), `lib/client/parse-api-error.ts` (√), `lib/email-retry.ts` (√), `lib/webhook-audit.ts` (√), `lib/audit-log.ts` (√).
- **No regressions detected.** Scaffolds are present but adoption is partial, which is expected for round-2 deliverables.

---

## Scorecard

| Rubric | Status |
|---|---|
| 1. API envelope consistency | ❌ 4/~160 adopted |
| 2. Email voice consistency | ✅ Gold standard in `lib/email-templates.ts` |
| 3. Toast surface | ❌ 2 libraries coexist |
| 4. Button copy | ❌ 5 drift clusters |
| 5. Empty states | ❌ No shared component |
| 6. Formatters | ❌ No `lib/formatters.ts`, 226 inline uses |
| 7. Status badges | ❌ No shared component, verbs drift |
| 8. Breadcrumbs | ❌ Missing on detail pages |
| 9. Loading skeletons | ⚠ 88 adopt, long tail mixes |
| 10. Confirmation dialogs | ⚠ 6 native `confirm()` remain |
| 11. AU English | ⚠ 58 drift occurrences |
| 12. ATO tax terminology | ❌ Invoice PDF says "INVOICE", not "Tax Invoice" |
