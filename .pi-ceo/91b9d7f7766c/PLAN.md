# Implementation Plan

**Session:** 91b9d7f7766c  
**Confidence:** 38%

**Risk notes:** Feature intent was not specified in the brief — assumed ASCORA integration based on ASCORA_ANALYSIS.md in repo root and product roadmap signals. All file paths are inferred from Next.js App Router conventions and existing lib/integrations/ pattern; actual paths may differ. Prisma schema may already contain ASCORA models — unit 1 could be a no-op. Dead-letter queue implementation in unit 3 assumes an existing queue mechanism; if none exists, scope expands significantly. Confidence is low due to feature ambiguity; plan should be validated against PRODUCT-ROADMAP.md and ASCORA_ANALYSIS.md before execution.

## Unit 1: Prisma schema: ASCORA job sync models

**Files:** `prisma/schema.prisma`, `prisma/migrations/`

## Unit 2: ASCORA integration service layer

**Files:** `lib/integrations/ascora.ts`, `lib/integrations/ascora-mapper.ts`
**Test scenarios:**

- happy path: maps ASCORA job payload to internal ClaimJob model correctly
- edge case: missing required ASCORA fields returns structured error, not throw
- edge case: ABN with non-11-digit format is rejected before DB write

## Unit 3: API routes: ASCORA webhook ingest and job sync

**Files:** `app/api/integrations/ascora/webhook/route.ts`, `app/api/integrations/ascora/sync/route.ts`
**Test scenarios:**

- happy path: valid webhook signature triggers job upsert and returns 200
- edge case: missing or invalid HMAC signature returns 401
- edge case: duplicate webhook event is idempotent (no duplicate DB rows)
- edge case: upstream ASCORA timeout queues to dead-letter, returns 202

## Unit 4: Dashboard UI: ASCORA job list and status panel

**Files:** `app/dashboard/ascora/page.tsx`, `components/ascora/JobCard.tsx`, `components/ascora/SyncStatusBadge.tsx`
**Test scenarios:**

- happy path: job list renders with correct IICRC compliance fields and state badge
- edge case: empty state renders informational CTA, not blank screen
- edge case: sync error state shows retry button without crashing

## Unit 5: Unit tests for ASCORA service and mapper

**Files:** `lib/integrations/__tests__/ascora.test.ts`, `lib/integrations/__tests__/ascora-mapper.test.ts`
**Test scenarios:**

- happy path: full round-trip mapping preserves all required compliance fields
- edge case: null/undefined optional ASCORA fields do not propagate to output object
- edge case: GST calculation always applies 10% and rounds to 2 decimal places

## Unit 6: E2E smoke test: ASCORA sync flow

**Files:** `e2e/ascora-sync.spec.ts`
**Test scenarios:**

- happy path: authenticated user navigates to ASCORA dashboard, triggers manual sync, sees updated job list
- edge case: unauthenticated user is redirected to login before reaching ASCORA routes
