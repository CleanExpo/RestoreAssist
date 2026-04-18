# Implementation Plan

**Session:** c68d35d850d0  
**Confidence:** 38%

**Risk notes:** No specific bug was described in the brief — 'BUG — Bug Fix' with no further detail. Plan is structured around the most common failure vectors in this codebase per CLAUDE.md rules: auth/session integrity (rules 1-3), Prisma query safety (rules 4-6), atomic credit deduction (rule 9), and subscription gating (rule 8). Actual file paths for the fix unit (id 5) will only be determinable after reproduction and root-cause analysis in units 1-4. Confidence is low until the specific bug is identified. If a concrete bug description, error message, or stack trace is provided, re-plan with high confidence.

## Unit 1: Reproduce & Triage — Identify exact failure condition

**Files:** `.claude/PROGRESS.md`, `app/api`, `lib`
**Test scenarios:**

- happy path: reproduce the reported failure in a controlled environment
- edge case: confirm failure is deterministic across multiple invocations
- edge case: confirm no concurrent-session or cold-start variability

## Unit 2: Root Cause — Trace through auth, session, and API route chain

**Files:** `app/api`, `lib/admin-auth.ts`, `lib/auth.ts`
**Test scenarios:**

- happy path: getServerSession returns valid session on protected routes
- edge case: stale JWT role claim rejected — DB re-validation via verifyAdminFromDb() fires correctly
- edge case: session.user.id used instead of session.user.email in identity checks

## Unit 3: Root Cause — Inspect Prisma queries for unbounded findMany or missing select

**Files:** `prisma/schema.prisma`, `lib`, `app/api`
**Test scenarios:**

- happy path: all Prisma queries use explicit select/include with take limit
- edge case: $queryRaw calls use Prisma.sql tagged template — no string interpolation of user values

## Unit 4: Root Cause — Verify credit deduction and subscription gate atomicity

**Files:** `lib/credits.ts`, `app/api`
**Test scenarios:**

- happy path: atomic updateMany deducts credit only when creditsRemaining >= 1
- edge case: result.count === 0 check fires 402 before AI call proceeds
- edge case: CANCELED/PAST_DUE subscription blocked at subscription gate before AI invocation

## Unit 5: Apply Fix — Targeted surgical change to identified root cause file(s)

**Files:** `app/api`, `lib`
**Test scenarios:**

- happy path: fix resolves the reported failure condition
- edge case: no regressions introduced in adjacent code paths
- edge case: error responses never expose error.message — return generic 500 shape

## Unit 6: Verify — Run type-check and targeted vitest suite

**Files:** `__tests__`, `lib/interview/__tests__`
**Test scenarios:**

- happy path: pnpm type-check exits 0 after fix
- happy path: npx vitest run on affected lib passes all assertions
- edge case: no new TypeScript errors introduced by the change

## Unit 7: Commit — Conventional commit with fix: prefix

**Files:** `.claude/PROGRESS.md`
