# Implementation Plan

**Session:** 731def2b0ab1  
**Confidence:** 28%

**Risk notes:** CRITICAL ASSUMPTION: The brief is marked [ADVANCED BRIEF] but contains no feature specification — only the workflow type (Feature Build). This plan assumes the feature targets NIR (Notice of Intent to Repair) compliance tracking, inferred from the existing `lib/nir-jurisdictional-matrix.ts` reference in CLAUDE.md and the platform's core focus on Australian water damage restoration compliance. If the actual feature is something else (e.g., ASCORA sync per ASCORA_ANALYSIS.md, AI interview enhancements, invoice/GST generation, or mobile/Capacitor work visible in top-level dirs), this plan should be discarded entirely. File paths for Prisma migrations are approximate — exact name determined at `prisma migrate dev` time. Confidence is 0.28 due to the unspecified feature scope.

## Unit 1: Prisma schema: NIR compliance record model

**Files:** `prisma/schema.prisma`, `prisma/migrations/`

## Unit 2: NIR jurisdictional compliance service layer

**Files:** `lib/nir-jurisdictional-matrix.ts`, `lib/compliance/nir-service.ts`, `lib/compliance/types.ts`
**Test scenarios:**

- happy path: returns correct IICRC S500:2025 section requirements for each of 8 Australian states/territories
- edge case: unknown jurisdiction code falls back to federal baseline requirements
- edge case: IICRC citation format is strictly `S500:2025 §X.Y` — rejects abbreviated forms

## Unit 3: API routes: NIR compliance document CRUD

**Files:** `app/api/compliance/nir/route.ts`, `app/api/compliance/nir/[id]/route.ts`
**Test scenarios:**

- happy path: authenticated TRIAL/ACTIVE/LIFETIME user creates NIR document, receives 201 with { data }
- edge case: unauthenticated request returns 401
- edge case: CANCELED/PAST_DUE subscription blocked at 402 before any AI call
- edge case: invalid jurisdiction or missing required fields return 400 with field-level errors
- edge case: atomic credit deduction via updateMany — concurrent requests cannot double-spend

## Unit 4: Dashboard UI: NIR compliance page and form components

**Files:** `app/dashboard/compliance/nir/page.tsx`, `components/compliance/NIRForm.tsx`, `components/compliance/NIRStatusBadge.tsx`
**Test scenarios:**

- happy path: form renders jurisdiction selector with all 8 states/territories, submits and shows success state
- edge case: server validation errors surface per-field without full-page reload
- edge case: loading skeleton (not spinner) shown while data fetches per brand convention

## Unit 5: Vitest unit tests for compliance service and utilities

**Files:** `lib/compliance/__tests__/nir-service.test.ts`, `lib/compliance/__tests__/nir-jurisdictional-matrix.test.ts`
**Test scenarios:**

- happy path: all jurisdiction outputs include mandatory S500:2025 citation and 11-digit ABN field
- edge case: GST helper returns exactly 10% of base, rounded to 2 decimal places
- edge case: HTML escaping applied to all user-supplied string fields before email interpolation
