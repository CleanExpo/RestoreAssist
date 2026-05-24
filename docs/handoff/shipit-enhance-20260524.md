# /shipit Enhance/Debloat — 2026-05-24

Surgical fix-plan for every Critical/Important finding from `shipit-review-20260524.md`. Bucketed by feasibility.

## Bucket A — fix-now-in-scope (apply in Step 5)

### A1. React hooks rules-of-hooks (3 files, 11 errors)

| File                                 | Fix                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/pilot/adjuster-review/page.tsx` | Move the `if (inspectionId) return <AdjusterAnalysisPanel …/>` from lines 331-333 to AFTER the `useEffect` at line 347. Hooks now run unconditionally on every render.                                                                 |
| `app/dashboard/admin/usage/page.tsx` | Move the `if (!isAdmin) return <AccessDenied/>` block from lines 434-455 to AFTER the two `useMemo` declarations (after line ~480). The AccessDenied card doesn't depend on `filteredEventTypes`/`filteredUsers`, so the move is safe. |
| `app/dashboard/success/page.tsx`     | Move the `useEffect` from line 455 to BEFORE the `if (isAddonPurchase) return null` at line 449. Both hooks then sit together; early return goes last.                                                                                 |

### A2. `no-prototype-builtins` (security)

| File                                         | Fix                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| `app/dashboard/reports/new/page.tsx:179,192` | Replace `obj.hasOwnProperty(k)` with `Object.hasOwn(obj, k)` |

### A3. `no-async-promise-executor`

| File                                                 | Fix                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/reports/bulk-export-excel-list/route.ts:72` | Replace `new Promise(async (resolve, reject) => { …await… })` with an explicit async IIFE that resolves the surrounding promise; ensure rejection on throw. |

### A4. `no-unreachable`

| File                              | Fix                                                              |
| --------------------------------- | ---------------------------------------------------------------- |
| `app/api/scopes/[id]/route.ts:54` | Inspect — likely dead code after early `return`/`throw`. Remove. |

### A5. `no-constant-binary-expression`

| File                                                     | Fix                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `app/api/inspections/[id]/contents-pack-out/route.ts:94` | `??` LHS is a known non-null literal — drop the `?? fallback` |
| `app/dashboard/inspections/[id]/capture/page.tsx:1174`   | `&&` LHS is constant truthy — drop the guard                  |

### A6. `no-restricted-globals` — native `alert()`

| File                                           | Fix                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `components/inspection/ExportPdfButton.tsx:37` | Replace `alert(...)` with a shadcn `toast`/`AlertDialog`. Will need component-level state for dialog open/close. |

### A7. `no-case-declarations`

| File                                       | Fix                                                        |
| ------------------------------------------ | ---------------------------------------------------------- |
| `components/RemediationProcedures.tsx:582` | Wrap the `case` body in `{ … }` to scope the `let`/`const` |

### A8. `no-redeclare` (5)

| File                                                                                       | Fix                                                |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `app/dashboard/analytics/components/AnalyticsFilters.tsx:48` (`AnalyticsFilters`)          | Rename inner symbol or drop the second declaration |
| `components/ai-elements/test-results.tsx:83` (`TestResultsSummary`), `:390` (`TestStatus`) | Same                                               |
| `components/ai-elements/transcription.tsx:81` (`TranscriptionSegment`)                     | Same                                               |
| `components/ui/circuit-board.tsx:631` (`CircuitNode`)                                      | Same                                               |

### A9. `preserve-caught-error` (39)

Mechanical pass over all 39 sites: `throw new Error(msg)` inside a `catch (error)` → `throw new Error(msg, { cause: error })`.

### A10. Other mechanical batches

| Rule                                | Count | Approach                                                              |
| ----------------------------------- | ----- | --------------------------------------------------------------------- |
| `@typescript-eslint/no-unused-vars` | 73    | Prefix `_` for intentional / delete the rest                          |
| `no-useless-escape`                 | 37    | Strip unnecessary `\`                                                 |
| `no-useless-assignment`             | 32    | Remove assignment that's never read                                   |
| `no-empty`                          | 6     | Add comment or handle                                                 |
| `no-control-regex`                  | 6     | Wrap in unicode escape or add eslint-disable-next-line with rationale |
| `no-irregular-whitespace`           | 1     | Replace with normal whitespace                                        |

## Bucket B — defer (Linear in Step 6)

| Item                                 | Reason                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `@next/next/no-img-element` (12)     | Each `<img>` → `<Image>` needs intrinsic dimensions audit — out of scope for ship gate |
| 823 ESLint warnings remaining        | Track as "Lint warning baseline cleanup" ticket                                        |
| Prisma `SetNull`-on-required warning | Relation-design decision — needs schema-owner sign-off                                 |

## Bucket C — out of scope this run

| Item                             | Why                                                      |
| -------------------------------- | -------------------------------------------------------- |
| DB-dependent vitest tests (42)   | Pass in CI where `DATABASE_URL` is provisioned           |
| Playwright E2E full pass         | Needs running dev server + Vercel preview; runs in PR CI |
| Stress/bench checks (RA-5035 AC) | Needs traffic generation infra — separate runbook        |
| Production health checks         | Requires deploy first                                    |

## Apply order in Step 5

1. **A1** (react-hooks) — 3 surgical edits, run targeted lint per file to verify
2. **A2–A8** (other criticals) — 7 files, sequential
3. **A9** (preserve-caught-error mass) — automated grep-and-edit pass with manual review
4. **A10** (mechanical batches) — automated codemod where safe, manual for ambiguous
5. After each batch: `pnpm type-check` + targeted `pnpm exec eslint <files>` to keep oracle green incrementally

## Re-verification gate

After all Bucket A fixes:

- `pnpm lint` must drop to 0 errors (warnings acceptable per CLAUDE.md)
- `pnpm type-check` must remain PASS
- `npx vitest run` non-DB tests must remain at 1659/1659
