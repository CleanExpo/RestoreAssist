# Senior PM Walkthrough — Round 4 — 2026-04-22
## Round rubric: does every surface pass WCAG 2.1 AA + RA-1109 surface-treatment rules?

**Exit criterion:** Lighthouse accessibility ≥ 95; every async action has a progress surface; no silent success.

**Method:** static analysis on `/tmp/pi-ceo-workspaces/ra-1494-directurl/` post-Round-3 (scaffolds landed: `EmptyState`, `StatusBadge`, `ConfirmDialog`, `formatters.ts`, `prisma-helpers.ts`, colocated `error.tsx`). Counted drift across 14 WCAG dimensions — ARIA, labelling, focus, contrast, motion, async progress surfaces. Tailwind class-scan + JSX structural grep. No runtime Lighthouse run; static proxy only.

---

## Working — patterns already compliant

- **shadcn primitives carry ARIA by default.** `components/ui/{input,textarea,select,checkbox,switch,radio-group,tabs,toggle,slider,accordion,navigation-menu,scroll-area}.tsx` all include `focus-visible:` styling — 28 occurrences across 20 primitives. Keyboard users get a visible ring on all shadcn inputs out of the box. `button.tsx` includes `focus-visible:ring-2`.
- **`:focus { outline: none }` not present in `app/globals.css`.** The native outline is not globally suppressed; shadcn replaces it with `focus-visible:ring` per-primitive. Good pattern.
- **No `<div onClick>` anti-pattern.** Grep of `<div[^>]*onClick` across the tree returned **zero** hits. All clickable surfaces are `<button>`, `<Button>`, or `<Link>` — semantics preserved.
- **`tabindex > 0` not found** in app/dashboard routes sampled. Tab order follows DOM order.
- **`alt=""` / unlabelled `<img>` / `<Image>`.** Grep for `<img(?![^>]*alt=)` and `<Image(?![^>]*alt=)` returned **zero** matches. Image alt discipline is solid — a round-3 win carried forward.
- **Existing `aria-label` adoption.** 131 occurrences across 68 files — notification bell, theme toggle, sidebar collapse, calendar chevrons, and most toolbar icons on inspections/invoices already labelled. Baseline is decent.
- **`components/ui/sonner.tsx` (Sonner toast).** Sonner's `Toaster` primitive ships with `role="status"` + `aria-live="polite"` internally — so toast SR announcements are wired provided Sonner is the active library.

---

## Missing — rubric items not yet met

1. **Form inputs without associated `<label htmlFor>` (rubric #2).** 543 `<Input|<Textarea|<Select` call sites vs only 452 `htmlFor=` attributes across 107 files. Rough delta ≈ **90 unlabeled fields**. Top offenders by raw Input/Select density: `components/inspection/NIRClaimAssessmentPanel.tsx` (68 fields), `components/PricingConfiguration.tsx` (54), `components/inspection/capture/evidence-capture-form.tsx` (18), `app/dashboard/inspections/[id]/photos/page.tsx` (76 fields, 2 `htmlFor`), `components/EditableReportSection.tsx` (15 fields, 3 `htmlFor`), `app/dashboard/admin/evidence-review/page.tsx` (1 field, 0 `htmlFor`). The delta isn't perfectly 1:1 (some inputs use `aria-label` or are controlled inside `FormField` wrappers), but a ≥90-field gap is WCAG-blocking for name-role-value (SC 4.1.2).

2. **Reduced-motion not respected (rubric #13).** `app/globals.css` defines 10+ keyframes (`fadeIn`, `slideInLeft`, `slideInRight`, `pulse-slow`, `shimmer`, `heroFadeUp`) and applies `transition-all duration-300 hover:-translate-y-1` on cards. **Zero** `@media (prefers-reduced-motion: reduce)` block in `globals.css`. The only two repo-wide hits are `components/onboarding/ProductTour.tsx` (local guard) and `DESIGN.md` (doc). WCAG 2.3.3 (AAA) and vestibular safety (AA adjacent) both require gating decorative motion. Single 6-line media query fixes the entire app.

3. **Status messaging for screen readers (rubric #7, #11).** Only **21** occurrences of `aria-live` / `role="status"` across **10 files** — and 6 of those are shadcn primitives themselves. That leaves ~4 app-level live regions for an app with ~144 async disabled-button flows. Loading skeletons, inline spinners, "Saving…" captions, and toast success messages outside of Sonner (see rubric drift #2 from Round 3 — dual-toast-library situation) are silent to SR users. High-traffic silent surfaces: `components/ui/spinner.tsx` (the spinner itself has no `role="status"` / `aria-label="Loading"`), inline `Loading…` divs across `dashboard/inspections/[id]/capture`, `forms/interview`, `reports/[id]/edit`.

---

## Drifting — inconsistencies across surfaces

4. **Icon-only buttons without `aria-label` (rubric #1).** 14 `size="icon"` button occurrences across 10 files; spot-audit:
   - `components/notifications/NotificationBell.tsx` — `aria-label` present ✓
   - `components/theme-toggle.tsx` — ✓
   - `components/ui/sidebar.tsx`, `components/ui/calendar.tsx` — primitive, ✓
   - `components/workspace/OnboardingChecklist.tsx` — icon-only dismiss, **no aria-label**
   - `app/dashboard/reports/[id]/completeness/page.tsx` — icon-only action, no aria-label
   - `app/dashboard/invoices/[id]/variations/page.tsx` — row-action pencil/trash icons, no aria-label
   - `app/dashboard/inspections/[id]/contents/page.tsx` — icon-only filter clear, no aria-label
   - `app/dashboard/inspections/schedule/page.tsx` (2 occurrences) — toolbar chevrons, no aria-label
   - `app/dashboard/inspections/[id]/voice/page.tsx` — mic toggle, no aria-label
   **≈ 6 of 14 icon buttons fail SC 4.1.2.** Easy mass fix.

5. **Low-contrast text on pale backgrounds (rubric #4).** `text-slate-(300|400)` / `text-gray-(300|400)` appears **2,276 times across 223 files**. On a white card (`bg-white`/`bg-card`) slate-400 sits at ~3.9:1 — fails AA for body (needs 4.5:1). Worst concentrations: `components/NIRTechnicianInputForm.tsx` (68 uses), `components/PricingConfiguration.tsx` (54), `app/dashboard/clients/[id]/page.tsx` (47), `app/dashboard/invoices/credit-notes/page.tsx` (38), `app/dashboard/reports/page.tsx` (33), `components/EstimationEngine.tsx` (32), `components/IICRCReportBuilder.tsx` (30). Many of these are on `bg-slate-50` cards which makes the ratio even tighter. Bulk codemod `text-slate-400 → text-slate-600` is the canonical fix.

6. **Progress surfaces for async actions (rubric #8 — RA-1109 core).** Only **144** `disabled={...loading|submitting|pending}` patterns across 39 files. Meanwhile `onClick` + `fetch(`/`await` patterns across `app/dashboard/**` are in the hundreds. Coverage is ~30%. Representative silent-submit offenders: `app/dashboard/contractors/profile/page.tsx`, `app/dashboard/admin/evidence-review/page.tsx`, `app/dashboard/invoices/[id]/variations/page.tsx`, `app/dashboard/reports/[id]/edit/page.tsx` (42 Input fields, 10 `htmlFor`, 1 `disabled={loading}`). This is exactly the class RA-1109 was opened to prevent: button click → silent network → refresh shows new state with no interim toast/disabled/spinner. A `useAsyncAction()` primitive + codemod would retrofit these in bulk.

7. **Heading-hierarchy drift (rubric #9).** Sampling `app/dashboard/**` pages shows a mix of `<h1>`-in-layout + per-page `<h2>` (correct) and pages that open with `<h3>` directly (e.g. `inspections/[id]/page.tsx` has 22 heading tags, many `h3` before any `h2`). No multiple-`h1` detected on sampled routes, but skip-level is common. Lighthouse flags these as "Heading elements are not in a sequentially-descending order."

8. **Spinner has no accessible name (rubric #7).** `components/ui/spinner.tsx` renders a pure visual `Loader2` with no `role="status"` / `aria-label="Loading"` / `<span className="sr-only">Loading</span>`. Every page that imports it is silent-loading for SR users.

9. **Mobile target size (rubric #14).** `components/ui/button.tsx` default size is `h-9` (36px) — below the 44×44 CSS-pixel WCAG 2.5.5 AAA target. `size="icon"` is `size-9` (36×36). Touch targets in table row actions (pencil/trash) and `sketch/SketchDockToolbar.tsx` icons fall below threshold. Acceptable under AA but fails AAA mobile — Lighthouse PWA audit dings it.

10. **Keyboard traps in custom modal / drawer components.** shadcn `Dialog`/`Sheet` are compliant. But `components/OnboardingModal.tsx`, `components/OnboardingStepModal.tsx`, `components/BulkOperationModal.tsx`, and `components/authority-forms/SignatoryManager.tsx` appear hand-rolled (not using `@radix-ui/react-dialog`). These lack `FocusTrap` / focus-return-to-opener / `Escape`-to-close conventions. Need spot-verification; flagging for round-4 ticket.

---

## Opportunities — round-4 accessibility wins

- **`lib/a11y/useAsyncAction.ts`** — wraps `(fn) => ({ run, pending, error })` and returns ready-made `aria-busy` + `disabled` + toast hooks. Codemod silent-success call-sites.
- **Global reduced-motion block** in `app/globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *,*::before,*::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  ```
- **`components/ui/spinner.tsx`** — add `role="status"` + `<span className="sr-only">Loading…</span>`. One-line fix, dozens of surfaces benefit.
- **Contrast codemod.** Script to replace `text-slate-400` / `text-gray-400` inside non-muted contexts with `text-slate-600`. Pair with tailwind ESLint rule banning `text-{slate|gray|zinc}-(300|400)` in JSX class strings unless preceded by `dark:`.
- **`aria-label` lint rule.** Custom rule: `<Button size="icon">` without `aria-label` / `title` / `sr-only` child → error. Catches regression.
- **Label-field lint rule.** `eslint-plugin-jsx-a11y/label-has-associated-control` already covers this; just need to enable it in `eslint.config.mjs` with `components: ["Input","Textarea","Select"]`.

---

## Round-1/2/3 regression check

- **Round 1 scaffolds (RA-1539-1545):** `error.tsx` boundaries intact, toaster present. No regression.
- **Round 2 scaffolds (RA-1547-1558):** `lib/api-errors.ts`, `lib/fetch-with-retry.ts`, `lib/client/parse-api-error.ts`, `lib/email-retry.ts`, `lib/webhook-audit.ts`, `lib/audit-log.ts` all still present. No regression.
- **Round 3 scaffolds:** `components/EmptyState.tsx` (✓, 2 matches of `text-slate-400` — itself a contrast offender, see ticket #5), `components/StatusBadge.tsx` (✓), `components/ConfirmDialog.tsx` presumed ✓, `lib/formatters.ts` (✓), `lib/prisma-helpers.ts` (✓). **Minor regression:** `EmptyState.tsx` uses `text-slate-400` for its description — the shared primitive itself fails contrast, so every consumer inherits the defect. Noted in ticket #5.
- **No functional regressions detected.**

---

## Scorecard

| Rubric | Status |
|---|---|
| 1. ARIA on icon buttons | ⚠ ~6/14 missing |
| 2. Form label association | ❌ ~90-field gap |
| 3. Keyboard traps (custom modals) | ⚠ 4 hand-rolled modals need audit |
| 4. Colour contrast | ❌ 2,276 low-contrast class uses |
| 5. Focus-visible | ✅ shadcn covers primitives |
| 6. Image alt text | ✅ 0 unlabelled `<img>`/`<Image>` |
| 7. SR status messaging | ❌ 21 live-region uses app-wide |
| 8. Async progress surfaces (RA-1109) | ❌ ~30% coverage |
| 9. Heading hierarchy | ⚠ skip-level on detail pages |
| 10. Semantic elements | ✅ 0 `<div onClick>` |
| 11. Dynamic content announcements | ❌ tied to #7 |
| 12. Tab order | ✅ no `tabindex > 0` |
| 13. Reduced motion | ❌ 10+ keyframes, 0 media query |
| 14. Mobile target size | ⚠ default button 36px, below AAA 44px |

**Lighthouse accessibility score (projected):** ~78-85 — misses ≥95 exit criterion. Blockers: form-label gap, low contrast, and motion. Those three alone likely account for 15+ Lighthouse points.
