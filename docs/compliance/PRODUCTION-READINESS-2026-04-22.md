# RestoreAssist Production Readiness Declaration — 2026-04-22

**Verdict: AMBER** — ship to design-partner / pilot customers under a
signed engagement. Hold unauthenticated public self-serve signup until
the High-priority Round 5 items land.

## Scope of this declaration

Covers the autonomous engineering sweep executed between 2026-04-21
and 2026-04-22 (≈16h). Five Senior-PM-style walkthroughs, each with a
stricter rubric, followed by a Karpathy/G-Stack fix wave. 33 Linear
tickets filed across rounds; 23 shipped (5 PRs skipped as follow-up
codemods or product-decision gates).

## Rounds + exit criteria

| Round | Rubric | Outcome |
|------:|--------|---------|
| 1 | Does every flow complete without errors? | 6 of 7 shipped (RA-1539/1540/1541/1543/1544/1545). RA-1542 closed as PM false positive (cron auth already present). |
| 2 | Does every edge case degrade gracefully? | 11 of 12 shipped; RA-1557 (integration-health banner) deferred as design-decision. |
| 3 | Is every touchpoint consistent (emails/API/UI)? | 5 of 11 shipped (RA-1559/1563/1564/1565/1566). Remainder are L/XL codemods queued as follow-up (RA-1560/1561/1562/1567/1568/1569). |
| 4 | Does every surface pass WCAG 2.1 AA + RA-1109? | 4 of 10 shipped (RA-1571/1572/1573/1579). Remainder are codemod labour against form inputs, colour tokens, and heading hierarchy. Lighthouse a11y projected 78–85; exit criterion of ≥95 not met. |
| 5 | Is the product sellable? | All 3 Urgent launch blockers shipped (RA-1580/1581/1582). High items (RA-1583/1584/1585) and Medium (RA-1586) queued for pre-GA. |

## What shipped in this sweep (23 PRs merged to main)

### Foundational helpers (reusable primitives)
- `lib/api-errors.ts` — unified envelope + Prisma error mapping (RA-1548/1554)
- `lib/fetch-with-retry.ts` — 429 / Retry-After aware fetch (RA-1550)
- `lib/client/parse-api-error.ts` — client-side envelope parser (RA-1555)
- `lib/client/useFetchWithError.ts` — tri-state loading/error/data hook (RA-1556)
- `lib/client/use-async-action.ts` — RA-1109 progress-surface hook (RA-1573)
- `lib/audit-log.ts` — generic mutation audit writer (RA-1541)
- `lib/webhook-audit.ts` — cross-provider dead-letter audit (RA-1558)
- `lib/email-retry.ts` — jittered retry wrapper for transactional email (RA-1552)
- `lib/prisma-helpers.ts` — `softDelete` that only swallows P2025 (RA-1551)
- `lib/formatters.ts` — canonical AU locale formatters (RA-1563)
- `components/EmptyState.tsx` — shared empty-state treatment (RA-1564)
- `components/StatusBadge.tsx` — canonical 5-tone status pill (RA-1565)
- `components/ConfirmDialog.tsx` — Promise-based shadcn AlertDialog wrapper (RA-1566)
- `components/LiveRegion.tsx` — polite/assertive aria-live announcer (RA-1572)

### Route-level fixes
- Middleware default rate-limit baseline on `/api/*` mutations (RA-1540)
- Admin migrate-v2 third-layer auth + adminUserId logging (RA-1539)
- Admin impersonate CSRF + per-admin rate-limit (RA-1545)
- Dashboard + Portal error boundaries ship to Observability (RA-1543/1544)
- Colocated `error.tsx` on `/dashboard/{inspections,reports,invoices,clients}/[id]` (RA-1549)
- Invoice list surfaces FAILED external sync (RA-1553)
- Six specialised inspection DELETE handlers narrowed silent catches (RA-1551)
- Invoice PDF reads "TAX INVOICE" per ATO GSTR 2013/1 (RA-1559)
- Pricing page states "AUD, incl. GST. Tax invoices issued monthly" (RA-1580)
- Footer surfaces ABN + registered address + support@ + security@ (RA-1582)
- Public `/status` heartbeat page proxying `/api/health` (RA-1581)
- Global `prefers-reduced-motion` CSS media query (RA-1571)

## Gaps acknowledged (AMBER drivers)

1. **Lighthouse accessibility < 95** — RA-1570 (form labels), RA-1574
   (2,276 `text-slate-400` uses below 4.5:1), RA-1575 (icon button
   aria-labels) are codemod labour. Primitive foundation is now in
   place; progressive adoption can land sprint-by-sprint without
   blocking a design-partner pilot.
2. **Round 2 / 3 helpers are scaffolded, not fully adopted** —
   `apiError()` lives on ~10 high-value routes; the long-tail
   migration is RA-1561. Same applies to `useAsyncAction`,
   `useFetchWithError`, `StatusBadge`, `EmptyState`, `formatters`.
3. **Sellability High items** — RA-1583 (sample-data button), RA-1584
   (in-app refund path), RA-1585 (pricing drift CI guard), RA-1586
   (PWA install polish) all needed before self-serve.
4. **Dead-letter adoption partial** — `lib/webhook-audit.ts` shipped
   but individual handler migration (xero/servicem8/quickbooks/ascora/
   github/dr-nrpg) pending.
5. **CI stability** — green-on-HEAD across the last 23 merges, but
   the 24h rolling-green requirement from the original plan has not
   yet accrued. Expected by 2026-04-23.

## Recommendation

Open the door to design-partner customers under a written engagement
today. Gate public self-serve + paid landing-page conversion until:

- RA-1583 (DEMO mode), RA-1584 (refund path), RA-1585 (pricing drift
  guard) merged + smoke-tested.
- One external user completes signup → first report → first invoice
  end-to-end, captured via activation events.
- 24 hours of green CI on main after the above lands.

Evidence PRs #644–#669. Walkthrough markdown at
`.harness/senior-pm-walkthrough-round-{1..5}.md`.
