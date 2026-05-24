# RestoreAssist Gap Analysis

Date: 2026-05-24  
Scope: RestoreAssist web, mobile scaffold, API routes, Prisma schema, AI layer, sketch/floorplan, voice, reporting, integrations, security, observability, CI/CD, and ship readiness.

## Executive Summary

RestoreAssist already has a strong compliance-domain core: 442 API route files, 179 Prisma models, IICRC-focused schemas, a mature Anthropic service-layer migration, pgvector support, upload magic-byte validation, AI budget logging, and a tablet-oriented Sketch V2 design. The gap is not imagination. The gap is production discipline and field-product compression.

The highest-priority blockers are:

1. Production security is not ship-ready while Supabase RLS is reported disabled on 119 of about 180 production tables and `NODE_TLS_REJECT_UNAUTHORIZED` is reported in production env vars.
2. Offline-first is a declared invariant but the mobile sync engine is still a stub at `mobile/lib/sync/engine.ts`.
3. Voice copilot sessions are stored in memory, so they are not reliable across Vercel instances, deploys, or mobile reconnects.
4. Build gates are soft because `next.config.mjs` ignores TypeScript and ESLint build failures.
5. API consistency still has route/auth/query debt: coarse audit found 17 non-exempt routes without obvious session/auth helper use, 4 admin routes without `verifyAdminFromDb`, 62 files with `findMany` and no obvious `take`, 14 raw-SQL files without obvious `Prisma.sql`, and 38 API files that may expose `error.message` in responses.
6. Sketch/floorplan has useful parts but no production-grade floorplan ingestion pipeline: image import uses an in-memory limiter, does not validate magic bytes in the route, and depends on a single Claude vision path.
7. Field UX is still feature-rich rather than technician-fast. The product needs a "next best capture" loop: start job, capture room, speak/read/tag evidence, validate gaps, hand off.

## Validated Current-State Assumptions

- Repo architecture is Next/App Router with Prisma/Supabase, NextAuth, Capacitor WebView, and a future Expo mobile scaffold. See `.claude/ARCHITECTURE.md`.
- Production is live but unverified according to `.claude/aggregation/MASTER_PLAN.md`: production has real users and data, and the master plan flags RLS, TLS env, and deploy workflow risks.
- Prisma has `pgvector` enabled and stores IICRC chunks, voice notes/transcripts, workspace RBAC, AI usage logs, sketches/floor plans, and progress framework models.
- Upload route `app/api/upload/route.ts` uses session auth, per-user rate limiting, size caps, MIME checks, and magic-byte validation.
- AI routing exists in `lib/ai/model-router.ts`, with low-cost "basic" routing and premium BYOK routing, but the platform still depends heavily on Anthropic-specific services.
- `pnpm type-check` could not be run in this shell because `pnpm` and `corepack` are not on PATH. That is an environment verification gap, not proof the code fails.

## Critical Gaps

### 1. Production Data Isolation

Error: Production Supabase RLS is reported disabled on 119 of about 180 tables.  
Cause: The app relies primarily on server-side ownership checks, but the browser ships a Supabase anon key and the database is not consistently enforcing tenant boundaries.  
Fix: Open a P0 security epic. Inventory every exposed table, classify by tenant owner, write RLS policies, add policy tests, run staged rollout in sandbox, and block ship until prod RLS coverage is green.

### 2. Environment and TLS Safety

Error: `NODE_TLS_REJECT_UNAUTHORIZED` is reported in production env vars.  
Cause: Likely debugging carry-over from previous TLS pinning or certificate work.  
Fix: Remove from production unless there is a signed exception with a dated owner, service scope, and expiry. Add CI/env audit that fails deploy if it appears in production or preview envs.

### 3. Offline-First Not Implemented

Error: `mobile/lib/sync/engine.ts` returns `idle` and logs a TODO.  
Cause: Offline-first is specified in the Progress Framework, but mobile local persistence, queueing, idempotency, conflict handling, and sync telemetry are not implemented.  
Fix: Build a local SQLite/OPFS queue with idempotency keys for capture events, progress transitions, photos, voice notes, and sketch changes. Server APIs must accept deterministic client mutation IDs and return replay-safe outcomes.

### 4. Voice Reliability

Error: `lib/voice/session.ts` stores voice sessions in a process-local `Map`.  
Cause: Phase-2 prototype design did not persist sessions across server instances or reconnects.  
Fix: Move sessions and observations to append-only Prisma tables. Use Redis/Vercel KV only for low-latency ephemeral state, not the audit record. Support reconnect from mobile with `inspectionId + activeSessionId`.

### 5. Build Gates Are Not Hard

Error: `next.config.mjs` sets `typescript.ignoreBuildErrors = true` and `eslint.ignoreDuringBuilds = true`.  
Cause: Historical strictness debt required separate CI checks.  
Fix: Keep separate `pnpm type-check` as authoritative short-term, but make PR and production deploy gates hard. Long-term, remove both ignores after drift is cleared.

### 6. API Contract Drift

Error: Coarse static audit found auth/query/error risks in API routes.  
Cause: 442 route files have grown faster than shared route factories and lint rules.  
Fix: Add custom lint or codemod checks for `getServerSession`/cron/webhook exemptions, `verifyAdminFromDb` on admin routes, `findMany` `select/include + take`, generic 500 bodies, and `Prisma.sql` raw SQL composition.

### 7. Floorplan Speed Gap

Error: RestoreAssist has upload/floor-plan/sketch routes and Sketch V2 design, but not a fast, multi-provider, claim-ready floorplan pipeline.  
Cause: Current implementation treats floorplans as an inspection attachment plus optional AI polygon import. It does not yet combine property-data prefetch, scan/capture, calibration, image-to-room detection, moisture pins, and export formats.  
Fix: Build a floorplan pipeline with four inputs: property-data underlay, photo of existing plan, manual sketch, and LiDAR/room scan. Normalize into one room graph, then export PDF/SVG/JSON and future ESX/FML adapters.

### 8. Field UX Is Too Wide

Error: RestoreAssist exposes many modules, but a field technician needs a single flow with minimal taps.  
Cause: The app is compliance-complete in places but not yet interaction-compressed around a job-site loop.  
Fix: Make the first screen after opening a job a mobile "capture cockpit": room, evidence status, voice button, photo button, moisture button, sketch button, and one next required item.

### 9. AI Cost and Provider Risk

Error: AI routing exists, but provider strategy is not yet formalized across text, vision, OCR, voice, realtime, batch, and local inference.  
Cause: Services evolved around Anthropic plus BYOK, with OpenAI and Gemini present in dependencies and a Gemma/self-hosted concept in the router.  
Fix: Adopt a model gateway with task policy, eval gates, budget ceilings, fallback chains, cache strategy, batch jobs, data residency rules, and explicit per-task default providers.

## Field Workflow Gaps

| Workflow | Current Signal | Gap | Fix |
|---|---|---|---|
| Onboarding | Setup wizard, team invites, help library specs | Too many decisions before first value | First-run agent: ABN lookup, workspace defaults, invite first tech, connect storage later |
| Job start | Inspection CRUD and progress framework | No one-tap "start capture" cockpit | Mobile start card with claim type, property, contact, required evidence |
| Photo evidence | Upload and evidence routes exist | Photo intent, room, stage, and claim relevance are not automatic enough | Auto-room, auto-stage, GPS/time, damage tag, duplicate/blur warnings |
| Moisture readings | Moisture routes, Bluetooth hook, sketch moisture layer | Readings often remain free text and disconnected from sketch/photo | Room graph IDs, meter pairing state, voice capture, required retake alerts |
| Sketch/floorplan | Sketch components, import-from-image, floorplan setting | Too slow compared with scan/import competitors | Property underlay prefetch, image-to-room graph, calibration, snap, guided "trace 4 walls" |
| Voice | Web speech/Whisper route and parser | Voice is not durable, realtime, or offline-first | Local STT fallback plus persisted copilot sessions and Realtime mode for active capture |
| Report | Many report routes | Report generation can be late instead of continuously assembled | Continuous report preview with missing-evidence blockers |
| Handoff | Handover route now present in code listing | Not yet a crisp insurer/admin package workflow | Claim-ready package: PDF, photo index, sketch, logs, scope, invoice, JSON export |

## Security and Compliance Gaps

- RLS and tenant isolation must become database-enforced, not only route-enforced.
- Admin routes must re-validate DB role with `verifyAdminFromDb`.
- Public token routes need explicit threat models, expiration, revocation, and audit events.
- Upload routes need a shared magic-byte and malware-scan abstraction. Sketch import currently checks MIME type but not magic bytes in the route.
- CSP is a static stopgap and still allows unsafe inline/eval. Ship path needs nonce migration or a documented exception register.
- Secrets must be audited against `.env.example`, Vercel envs, GitHub Actions, scripts, and committed history.
- AI prompts and outputs need audit records and redaction policy for insurer/customer PII.

## Scalability Gaps

- Process-local state exists in voice session and route-level sketch import rate limiters. Replace with durable or distributed state.
- Some routes still appear to use unbounded `findMany` patterns. Enforce pagination and stable sort keys.
- Cloudinary storage cost needs lifecycle policies, derived asset limits, and retention rules.
- Report generation, OCR, vectorization, and AI classification should move to queued jobs with idempotency and retry visibility.
- Multi-tenant workspace ownership exists in schema, but older user-scoped paths need migration to workspace-scoped access checks.

## Ship-Readiness Definition

RestoreAssist is ship-ready when:

- RLS, auth audit, secret audit, TLS env audit, and API route static checks are green.
- Mobile capture works offline for photos, readings, voice notes, sketch edits, and progress transitions.
- Voice sessions and AI actions are persisted and auditable.
- Sketch/floorplan creates a room graph in under 5 minutes for a normal residential water loss.
- New technicians can complete a first valid inspection without training via guided capture.
- AI spend is capped per workspace and per task, with fallback and batch policies.
- Production deploys are reproducible, monitored, and rollback-ready.

