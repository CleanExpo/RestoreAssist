# Technical Debt Report

Date: 2026-05-24

## Method

This report combines repo reads, coarse static audits, existing `.claude` plans, and targeted inspection of AI, voice, upload, sketch, auth, mobile sync, Prisma, and config files. Counts are coarse and should seed exact lint rules, not be treated as final security proof.

## Top Debt Register

### TD-01: Production RLS Disabled

Error: Master plan reports RLS disabled on 119 of about 180 production tables.  
Cause: Server-side route guards grew faster than database policy hardening.  
Fix: Treat as P0. Enable RLS and policies table-by-table, starting with User, Account, Organization, integration tokens, evidence, inspections, reports, invoices, and audit/security events.

### TD-02: Build Ignores TypeScript and ESLint

Error: `next.config.mjs` ignores TypeScript and ESLint build failures.  
Cause: Build was kept deployable while strictness drift existed.  
Fix: Make CI authoritative now, then remove build ignores once route validator and type drift are fixed.

### TD-03: Offline Sync Stub

Error: `mobile/lib/sync/engine.ts` is a stub with TODO and `console.log`.  
Cause: Mobile scaffold exists before offline implementation.  
Fix: Build event queue, local persistence, sync worker, idempotency keys, and conflict handling.

### TD-04: In-Memory Voice Sessions

Error: Voice sessions are process-local and expire in memory.  
Cause: Prototype phase did not persist to DB.  
Fix: Persist voice sessions and observations append-only. Add reconnect semantics.

### TD-05: Process-Local Rate Limiters

Error: Sketch import route uses an in-memory `Map` for rate limiting.  
Cause: Route-local limiter was quick and cheap.  
Fix: Use shared `applyRateLimit` keyed by `session.user.id` and workspace ID, backed by durable/distributed store.

### TD-06: Route Auth Drift

Error: Coarse audit found 17 non-exempt API routes without obvious auth helper use.  
Cause: Large route surface and legitimate public-token routes are not clearly annotated.  
Fix: Create explicit `route-policy.ts` metadata or lint rule with allowed exemptions. Public routes require token threat model.

### TD-07: Admin Revalidation Drift

Error: 4 admin routes do not obviously call `verifyAdminFromDb`.  
Cause: Older admin routes predate stale-JWT role revalidation rule.  
Fix: Patch and add lint rule: every `app/api/admin/**/route.ts` must import/use `verifyAdminFromDb`.

### TD-08: Prisma Query Drift

Error: Coarse audit found 62 files with `findMany` and no obvious `take`, 16 without obvious `select/include`.  
Cause: Local patterns exist but are not mechanically enforced.  
Fix: Add ESLint custom rule or AST script. Allow explicit exceptions only with `// ra-query-ok` and reason.

### TD-09: Raw SQL Drift

Error: Coarse audit found 14 raw-SQL files without obvious `Prisma.sql`.  
Cause: Some queries may be safe health checks, but the policy is not enforced.  
Fix: Review each. Convert all user-influenced raw SQL to `Prisma.sql` tagged templates. Add static guard.

### TD-10: Error Leakage Risk

Error: Coarse audit found 38 API files where `error.message` may be returned.  
Cause: Mixed route-era conventions.  
Fix: Use generic `{ error: "Internal server error" }` for 500s and log internals server-side.

### TD-11: AI Gateway Fragmentation

Error: Mature Anthropic gateway exists but OpenAI/Gemini/BYOK/local tasks are not unified under one gateway.  
Cause: AI features shipped in waves by provider/task.  
Fix: Introduce provider-neutral gateway. Move task policies out of routes.

### TD-12: Prompt and Model Version Drift

Error: Model names, prompts, and costs are spread across services and comments.  
Cause: Rapid AI feature iteration.  
Fix: Create prompt registry with version, task, model policy, eval IDs, and rollback path.

### TD-13: Sketch/Floorplan Incompleteness

Error: Sketch V2 spec lists known bugs and missing tools; import-from-image is useful but not enough.  
Cause: Sketch evolved as UI component work rather than a full floorplan pipeline.  
Fix: Normalize all sketch/floorplan inputs into `RoomGraph`.

### TD-14: Mobile Shell Split

Error: Capacitor WebView is production path while `mobile/` Expo scaffold exists for future field capture.  
Cause: Transitional architecture.  
Fix: Make a 90-day decision: either harden Capacitor offline PWA approach or invest in native capture shell. Do not leave two half-strategies.

### TD-15: Storage Cost and Retention

Error: Upload/photo/report/media flows can grow Cloudinary/storage cost without explicit lifecycle policy.  
Cause: Capture-first systems accumulate media quickly.  
Fix: Add retention classes, thumbnail generation rules, original purge policy, export archive policy, and customer deletion workflow.

### TD-16: Observability Gaps

Error: Sentry and telemetry exist, but there is no single ship dashboard for field workflow health.  
Cause: Observability was added per feature.  
Fix: Create operational dashboard with capture, sync, AI, reports, integrations, auth, billing, and deploy health.

## Debt Paydown Order

1. Security: RLS, TLS env, admin revalidation, secrets.
2. Build trust: pnpm availability, type-check/lint/test gates, route static checks.
3. Offline core: queue, idempotency, persisted voice, media sync.
4. Field UX compression: capture cockpit and room graph.
5. AI gateway: task policy, cost caps, evals.
6. Floorplan pipeline: fast sketch import/trace/calibrate/export.
7. Reporting/handoff: continuous report preview and package generation.

## Exact Verification To Add

- `scripts/audit-api-routes.ts`: auth/admin/error/query/raw SQL checks.
- `scripts/audit-env.ts`: forbidden envs and missing critical envs.
- `scripts/audit-rls.ts`: RLS enabled and policy coverage.
- `npx vitest run lib/services/ai lib/voice lib/progress`.
- `npx playwright test e2e/tech-evidence-capture-no-modal.spec.ts e2e/v2-sketch-workflow.spec.ts e2e/job-close-happy-path.spec.ts`.
- Mobile offline sync integration test with network toggled.

