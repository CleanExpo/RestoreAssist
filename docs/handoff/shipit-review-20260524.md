# /shipit Multi-Lens Review — 2026-05-24

Review of `shipit/2026-05-24` (off `origin/sandbox`) against the 18 review dimensions in `.claude/rules/review-dimensions.md`. Confidence ≥ 75 for every finding listed.

## Critical findings (must fix before merge — block ship)

### C1. React Hooks rules-of-hooks violations (12) — dim 1 (Architecture) + dim 5 (Type Safety) + correctness

**Why critical:** A hook called conditionally produces undefined behaviour — the hook order mismatch between renders causes wrong state binding, silent data loss, or runtime React errors. Top cause of "works locally / crashes in prod" bugs.

| File                                 | Lines    | Violation pattern                                                                               |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `app/dashboard/admin/usage/page.tsx` | 458, 466 | Two `useMemo` declared AFTER an `if (!isAdmin) return …` early-return block                     |
| `app/dashboard/success/page.tsx`     | 455      | `useEffect` declared AFTER `if (isAddonPurchase) return null`                                   |
| `app/pilot/adjuster-review/page.tsx` | 335-345  | 8 `useState` + 1 `useEffect` declared AFTER `if (inspectionId) return <AdjusterAnalysisPanel/>` |

**Fix:** Move every conditional early-return AFTER the hook declarations. Hooks must be called unconditionally in the same order every render.

### C2. Unsafe `hasOwnProperty` direct access (2) — dim 2 (Security)

**Why critical:** Direct `obj.hasOwnProperty(k)` is bypassed by an attacker-controlled `__proto__` payload or a `Object.create(null)` object. Use `Object.hasOwn(obj, k)`.

| File                                 | Lines    |
| ------------------------------------ | -------- |
| `app/dashboard/reports/new/page.tsx` | 179, 192 |

### C3. `no-async-promise-executor` (1) — dim 4 (Error Handling)

**Why critical:** `new Promise(async (resolve, reject) => { … })` swallows thrown errors from the async function — the surrounding promise resolves to `undefined` instead of rejecting. Silent data loss.

| File                                              | Line |
| ------------------------------------------------- | ---- |
| `app/api/reports/bulk-export-excel-list/route.ts` | 72   |

### C4. `no-unreachable` code (1) — dim 1 (Architecture)

**Why critical:** Code that never runs is either a bug (intent was to run it) or dead weight masking the real flow. Either way, ship gate must reject.

| File                           | Line |
| ------------------------------ | ---- |
| `app/api/scopes/[id]/route.ts` | 54   |

### C5. `no-constant-binary-expression` (3) — dim 1 (Architecture)

**Why critical:** `truthy && expr` or `null ?? expr` where one side is a known constant means the condition is dead — the intended branch never (or always) runs. Logic bug.

| File                                                  | Lines                                  |
| ----------------------------------------------------- | -------------------------------------- |
| `app/api/inspections/[id]/contents-pack-out/route.ts` | 94 (constant nullish on `??` LHS)      |
| `app/dashboard/inspections/[id]/capture/page.tsx`     | 1174 (×2; constant truthy on `&&` LHS) |

### C6. `no-restricted-globals` — native `alert()` (1) — dim 18 (UI/UX Consistency)

**Why critical:** RA-1566 ban; on Capacitor iOS the native `alert()` blocks the whole WebView event loop and breaks ship gate per CLAUDE.md rule 14 (shadcn-only).

| File                                        | Line |
| ------------------------------------------- | ---- |
| `components/inspection/ExportPdfButton.tsx` | 37   |

### C7. `no-case-declarations` (1) — dim 1 (Architecture)

**Why critical:** `let`/`const` in a `case` without `{}` leaks the binding into sibling cases — TDZ / re-decl bugs.

| File                                   | Line |
| -------------------------------------- | ---- |
| `components/RemediationProcedures.tsx` | 582  |

### C8. `no-redeclare` (5) — dim 5 (Type Safety)

**Why critical:** Two declarations sharing one name in scope — the second silently shadows the first. In TS this is typically a type re-declaration with a slightly different shape, causing wrong-shape bugs at consumer sites.

| File                                                      | Lines | Symbol                 |
| --------------------------------------------------------- | ----- | ---------------------- |
| `app/dashboard/analytics/components/AnalyticsFilters.tsx` | 48    | `AnalyticsFilters`     |
| `components/ai-elements/test-results.tsx`                 | 83    | `TestResultsSummary`   |
| `components/ai-elements/test-results.tsx`                 | 390   | `TestStatus`           |
| `components/ai-elements/transcription.tsx`                | 81    | `TranscriptionSegment` |
| `components/ui/circuit-board.tsx`                         | 631   | `CircuitNode`          |

## Important findings (should fix — flag in review)

### I1. `preserve-caught-error` (39) — dim 4 (Error Handling)

**Why important:** Re-throwing `new Error("…")` without `{ cause: error }` loses the upstream stack trace. Operationally this is the difference between a one-line fix and an hour of "where did this come from?" Sentry debugging.

**Fix:** Mechanical pass; every offender becomes `throw new Error(msg, { cause: error })`.

### I2. `@typescript-eslint/no-unused-vars` (73) — dim 1 + dim 13 (Code Style)

Mechanical: prefix `_` for intentionally-unused destructured args; delete the rest.

### I3. `no-useless-escape` (37) — dim 5 + regex correctness

Mechanical: remove unnecessary backslashes in regex/string literals.

### I4. `no-useless-assignment` (32) — dim 1 (Architecture)

Mechanical: a value assigned then never read = remove the assignment.

### I5. `no-empty` (6) + `no-control-regex` (6) + `no-irregular-whitespace` (1)

Mechanical regex/format hygiene.

### I6. `@next/next/no-img-element` (12 warnings) — dim 3 (Performance)

Defer to a focused `<img>` → `next/image` migration ticket — needs dimension audit per image.

## Suggestion findings (optional)

### S1. Pre-existing `SetNull` Prisma warning — dim 7 (Data Modelling)

`prisma validate` flags a relation using `onDelete: SetNull` against a required referenced field. Pre-existing; not introduced by this run.

### S2. 823 ESLint warnings (lint baseline) — dim 13 (Code Style)

Open a Linear ticket "Lint warning baseline cleanup" tracking the remaining warnings.

### S3. Untracked artefacts in working tree

`secret.txt`, `dist/`, `.hermes/`, `packages/`, `mobile/.env.example` should be triaged into `.gitignore` or committed deliberately.

## Verdict

**CHANGES REQUESTED** — 8 critical categories totalling 25 errors must be fixed before merge.

| Bucket             | Verdict                     |
| ------------------ | --------------------------- |
| Critical (C1–C8)   | Block merge — fix in Step 5 |
| Important (I1–I5)  | Fix in Step 5 (mechanical)  |
| Suggestion (S1–S3) | Defer to Linear in Step 6   |

## Next: Step 4 — propose specific fixes per finding
