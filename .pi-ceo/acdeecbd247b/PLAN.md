# Implementation Plan

**Session:** acdeecbd247b  
**Confidence:** 38%

**Risk notes:** No specific bug description was provided in the brief — plan is based on the standard Bug Fix workflow and CLAUDE.md conventions (auth, API routes, Prisma queries, response shapes). Actual affected files are unknown; file paths are representative patterns. Confidence is low because: (1) the exact failure condition is unspecified, (2) root cause may span more than 3 files triggering tier-worker escalation, (3) the fix could touch Prisma schema (requiring a migration unit) or integration layer (requiring idempotency/webhook considerations). Assumptions: bug is in application logic (app/api or lib), not in Prisma schema or CI infrastructure; fix does not require a new migration; vitest unit tests are sufficient without Playwright E2E. If bug involves prisma/schema.prisma, add a migration unit between units 3 and 4.

## Unit 1: Reproduce & Diagnose — Identify failure condition and root cause

**Files:** `.claude/PROGRESS.md`, `app/api/**/*.ts`, `lib/**/*.ts`
**Test scenarios:**

- happy path: reproduce the reported error in isolation with minimal input
- edge case: confirm failure does not occur on adjacent code paths

## Unit 2: Audit recent git changes — correlate commits to regression window

**Files:** `.claude/PROGRESS.md`

## Unit 3: Fix — Apply minimal targeted patch to root cause file(s)

**Files:** `app/api/**/*.ts`, `lib/**/*.ts`, `components/**/*.tsx`
**Test scenarios:**

- happy path: fixed code path returns correct response/output
- edge case: null/undefined inputs handled without throwing
- edge case: auth guard still enforces session check after fix
- edge case: error response shape matches { error: string } convention

## Unit 4: Unit test — Write or update vitest test covering the fixed behaviour

**Files:** `lib/__tests__/**/*.test.ts`, `__tests__/**/*.test.ts`
**Test scenarios:**

- happy path: test passes with corrected logic
- edge case: test fails against old (unfixed) logic — confirming regression coverage

## Unit 5: Type-check & lint — Confirm no TypeScript or ESLint regressions

**Files:** `tsconfig.json`, `.eslintrc*`, `package.json`

## Unit 6: Commit — Stage fix with conventional commit message (fix: ...)

**Files:** `.claude/PROGRESS.md`
