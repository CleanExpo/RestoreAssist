# Implementation Plan

**Session:** fd8499334abf  
**Confidence:** 35%

**Risk notes:** No specific bug was described in the brief — only 'BUG — Bug Fix' with no reproduction steps, error message, or affected file. Plan is a diagnostic-first investigation across the highest-risk layers (auth, data, credits) identified in CLAUDE.md rules. Confidence is low because actual root cause is unknown; units 2–5 are speculative candidates. If the bug is in a UI component or integration layer (Ascora sync, webhooks) these units will need to be replaced. Recommend operator supplies the specific error message, stack trace, or affected route before execution.

## Unit 1: Reproduce & Diagnose — Identify failure condition from logs and recent commits

**Files:** `.claude/PROGRESS.md`, `app/api`, `lib`
**Test scenarios:**

- happy path: recent commit history reveals the offending change
- edge case: bug is intermittent and only triggered under specific session/auth state

## Unit 2: Auth / Session Guard — Verify getServerSession presence and session.user.id usage

**Files:** `app/api`, `lib/admin-auth.ts`
**Test scenarios:**

- happy path: all protected API routes return 401 when unauthenticated
- edge case: stale email in JWT does not bypass admin guard — DB re-validation fires

## Unit 3: Data Layer — Fix unbounded query or missing select/include causing runtime error

**Files:** `lib`, `app/api`, `prisma/schema.prisma`
**Test scenarios:**

- happy path: Prisma query with explicit select returns expected shape
- edge case: query with missing take limit does not time out or OOM under load

## Unit 4: Credit / Subscription Gate — Atomic deduction and subscription allowlist check

**Files:** `lib/credits.ts`, `app/api/ai`
**Test scenarios:**

- happy path: ACTIVE user deducts credit atomically, AI call proceeds
- edge case: CANCELED user receives 402 without credit deduction race condition

## Unit 5: Error Handling — Confirm 500 responses do not leak error.message to client

**Files:** `app/api`
**Test scenarios:**

- happy path: caught Prisma error returns { error: 'Internal server error' } with no stack trace
- edge case: validation error returns descriptive 400 without internal details

## Unit 6: Vitest Regression Suite — Run existing unit tests to confirm fix does not regress

**Files:** `lib/interview/__tests__`, `__tests__`
**Test scenarios:**

- happy path: npx vitest run exits 0 with all suites green
- edge case: newly touched module has no test coverage gap introduced

## Unit 7: Conventional Commit — Stage targeted fix with fix: prefix
