# Implementation Plan

**Session:** 10af68d04c23  
**Confidence:** 42%

**Risk notes:** Brief states 'FEATURE — Feature Build' without specifying which feature. Assumed Ascora integration based on presence of ASCORA_ANALYSIS.md at repo root — this is the most likely in-flight feature. If the intended feature differs (e.g. NIR matrix update, interview flow, reporting), all units should be discarded and re-planned. Prisma migration unit is non-behavioral but blocks units 3-5; it must land first. Dead-letter queue referenced in rule 13 assumed to be an existing mechanism — if not present, unit 3 complexity increases. Confidence is low due to ambiguous brief.

## Unit 1: Ascora API client service

**Files:** `lib/integrations/ascora/client.ts`, `lib/integrations/ascora/types.ts`, `lib/integrations/ascora/index.ts`
**Test scenarios:**

- happy path: fetchJob returns mapped AscorJob when API responds 200
- edge case: client throws IntegrationError on 401 and does not expose raw message
- edge case: retry with backoff on 429/503 before dead-lettering

## Unit 2: Prisma schema — AscoraSyncJob model and migration

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260418_add_ascora_sync_job/migration.sql`

## Unit 3: Ascora sync API route (pull jobs on demand)

**Files:** `app/api/integrations/ascora/sync/route.ts`
**Test scenarios:**

- happy path: POST with valid session enqueues sync, returns 202 with jobId
- edge case: unauthenticated request returns 401
- edge case: subscription not in TRIAL/ACTIVE/LIFETIME returns 402
- edge case: duplicate sync request within debounce window returns 202 idempotently

## Unit 4: Ascora inbound webhook handler

**Files:** `app/api/webhooks/ascora/route.ts`, `lib/integrations/ascora/webhook-validator.ts`
**Test scenarios:**

- happy path: valid HMAC signature triggers upsert of job record
- edge case: invalid signature returns 401 without processing payload
- edge case: unknown event type returns 200 (ignore, no error)

## Unit 5: Ascora jobs dashboard UI component

**Files:** `components/integrations/AscoraJobsTable.tsx`, `app/dashboard/integrations/ascora/page.tsx`
**Test scenarios:**

- happy path: renders paginated job list from /api/integrations/ascora/sync data
- edge case: empty state renders prompt to connect Ascora account
- edge case: loading skeleton shown while fetch is in flight

## Unit 6: Unit tests for Ascora integration layer

**Files:** `lib/integrations/ascora/__tests__/client.test.ts`, `lib/integrations/ascora/__tests__/webhook-validator.test.ts`
**Test scenarios:**

- happy path: mapAscoraJobToInternal correctly transforms all required fields
- edge case: missing required fields throw at parse time before DB write
- edge case: ABN normalisation strips spaces and validates 11-digit format
