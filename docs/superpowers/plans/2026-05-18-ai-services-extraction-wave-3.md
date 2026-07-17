# AI Services Extraction Wave-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Pattern reference: `.claude/skills/service-layer-architecture/SKILL.md`. Wave-1: `2026-05-18-ai-services-extraction-wave.md`. Wave-2: `2026-05-18-ai-services-extraction-wave-2.md`.

**Goal:** Complete the AI Services Extraction by migrating the 11 remaining direct-SDK routes (reports/interviews/analytics) discovered in the wave-2 post-audit. Closes the "all direct `@anthropic-ai/sdk` imports gone from `app/api/**` except webhooks" arc.

**Architecture:** Reuse the gateway built in waves 1+2 — `callAnthropic` for batch + `callAnthropicStream` for streaming. No new gateway primitives. Each route gets a domain-task service composing the gateway, exactly per the wave-1 classify-inspection recipe (commits `88c20df0 / c3b71402 / 1eb8f006`).

**Tech Stack:** Next.js 15 App Router, TypeScript 5 (strict), `@anthropic-ai/sdk@0.95.2`, Vitest. pnpm only.

---

## Route inventory (size order — smallest first for fast pattern proof)

| # | Route | LOC | AI shape | Service file |
|---|---|---|---|---|
| 1 | `app/api/reports/[id]/synopsis/route.ts` | 180 | ~~streaming~~ **batch** (corrected 2026-05-18 — survey miscount; route uses `messages.create` at line 141) | `lib/services/ai/report-synopsis.ts` [PASS] DONE `c051d727 / 214c310e / 2c3312b8` |
| 2 | `app/api/reports/[id]/client-summary/route.ts` | 196 | batch | `lib/services/ai/report-client-summary.ts` |
| 3 | `app/api/reports/generate-question/route.ts` | 219 | batch | `lib/services/ai/generate-interview-question.ts` |
| 4 | `app/api/interviews/[id]/suggest-next/route.ts` | 266 | batch | `lib/services/ai/suggest-next-interview-question.ts` |
| 5 | `app/api/interviews/[id]/validate/route.ts` | 271 | batch | `lib/services/ai/validate-interview-response.ts` |
| 6 | `app/api/reports/analyze-technician-report/route.ts` | 289 | batch | `lib/services/ai/analyse-technician-report.ts` |
| 7 | `app/api/analytics/narrative/route.ts` | 328 | streaming (`messages.stream`) | `lib/services/ai/analytics-narrative.ts` |
| 8 | `app/api/reports/generate-enhanced/route.ts` | 498 | batch | `lib/services/ai/generate-enhanced-report.ts` |
| 9 | `app/api/reports/generate-cost-estimation/route.ts` | 935 | batch | `lib/services/ai/generate-cost-estimation.ts` |
| 10 | `app/api/reports/upload/route.ts` | 950 | streaming (`messages.stream`) | `lib/services/ai/extract-report-from-upload.ts` |
| 11 | `app/api/reports/generate-scope-of-works/route.ts` | 1,022 | batch | `lib/services/ai/generate-scope-of-works.ts` |

**Total: 5,154 LOC of route code. Initially surveyed as 8 batch + 3 streaming — Task 1 confirmed synopsis is batch (survey miscount), so the working set is 9 batch + 2 streaming. Each implementer must re-grep `messages\\.create` vs `messages\\.stream` on their target route before bucketing.**

### Granularity (atomic per-route units, 2026-05-18 directive)

**One route = one sub-PR**, not one batched dispatch. Each task lands its 3 commits, gets spec-compliance + code-quality review, merges to main on its own. This replaces the original "one massive wave-3 PR" framing.

- Why: smaller diffs review faster, isolate any single-route regression, allow rollback of one route without reverting the others, and reduce the chance of an OOM-style CI failure flagging the whole wave instead of one route's PR.
- How: branch from `main` per route (`feat/wave3-<route-name>`), open PR, merge when green, branch the next route off the freshly-merged `main`. The wave-3 plan tracks all 11; each PR closes one checkbox.
- Trade-off: 11 PRs instead of 1 means 11 review windows. Acceptable — same total review time, just paid incrementally.

**Verify per-route before service-name lock:** the surveyor grep may have under-counted `messages.stream` calls (some routes use `client.messages.stream` via a renamed binding). Implementer MUST `grep -n "messages\\." <route>` before bucketing the route as batch vs streaming.

---

## Per-task recipe (apply to each of the 11)

Follow the wave-1 classify-inspection precedent (commits `88c20df0 / c3b71402 / 1eb8f006`) for **batch** routes, or the wave-2 generate-scope precedent (commits `22bff0bb / dd9cddca / 48b7895e`) for **streaming** routes:

### Steps per route (3 commits)

1. **Read the route** to identify: `import Anthropic` line, `getAnthropicApiKey(userId)` (or `process.env.ANTHROPIC_API_KEY`) flow, the SYSTEM_PROMPT, the `messages.create` / `messages.stream` call (model, max_tokens, system, messages), the response parsing block, the failure-return shape today. Note any pre-flight validation (workspace-budget, ticket existence, etc.) — those stay in the route.
2. **Failing test first.** `lib/services/ai/__tests__/<service-name>.test.ts`. Mock `@/lib/services/ai/anthropic-gateway`. Batch: 4 cases (happy / gateway-failure-propagation / fence-tolerance / PARSE_FAILED). Streaming: 3 cases (ok-with-stream / passes correct request shape / gateway-failure-propagation).
3. **Service implementation.** `lib/services/ai/<service-name>.ts`. Move SYSTEM_PROMPT verbatim. Compose `callAnthropic` or `callAnthropicStream`. Return `ServiceResult<TaskResult, AnthropicReason | "PARSE_FAILED" | <task-specific>>`.
4. **Route migration.** Remove `import Anthropic` + remove `getAnthropicApiKey` import + remove local SYSTEM_PROMPT. Add service import. Replace SDK-call block. Map reasons to HTTP per the precedent: `KEY_MISSING → 402`, `RATE_LIMITED → 429` (+ `Retry-After` from `retryAfterMs/1000`), `MODEL_OVERLOADED → 503`, `PARSE_FAILED → 502`, default → 500. Log: `console.error("[<RoutePrefix>]", { ..., reason, detail })`.

Three commits per route: failing test → service → route migration.

### Apply the wave-1+2 lessons

- **vitest mock reset.** Tests with multiple mocked rejection paths need `vi.mocked(<mock>).mockReset()` in `beforeEach` (wave-1 lesson from anthropic-gateway test).
- **Payload type relaxation.** If the route's Prisma row shape doesn't unify with strict service interface, use `Record<string, unknown>` relaxation (wave-1 classify-inspection precedent).
- **Workspace-budget logging.** If a route writes `UsageEvent` rows post-call, the service should return `usage` so the route can still log (wave-2 sketches/import-from-image precedent).
- **Public-submit graceful degradation.** If a route's existing behaviour is "AI failure is non-fatal, fall back to user-provided values", PRESERVE that — the service returns the reason; the route's helper still returns `null` on `!result.ok` and the route falls back (wave-2 support/tickets precedent).
- **Platform-key vs user-key.** If the route uses `process.env.ANTHROPIC_API_KEY` directly (admin-only or cron-only operations), pass `apiKey: process.env.ANTHROPIC_API_KEY` to the gateway via the override (wave-1 draft-support-ticket precedent).

### STOP and report BLOCKED if

- A route's AI logic involves multiple sequential AI calls — that's two services, not one. STOP, report, planner splits the task.
- A route's existing tests assert on prompt-internal content (which would block the SYSTEM_PROMPT move). STOP.
- A route uses a custom AI client wrapper (e.g. `lib/ai/byok-client.ts`, `lib/ai/restoreassist-ai-client.ts`) instead of the bare SDK — that's BYOK / multi-provider routing, out of scope for this wave. STOP, surface.

---

## Tasks (one per route, do in size order)

- [x] **Task 1** — `reports/[id]/synopsis` (batch, 180 LOC). DONE `c051d727 → 214c310e → 2c3312b8`. 4/4 service tests, 49/49 full AI suite green. Hybrid key flow (user-key → env fallback) preserved; 400 onboarding affordance preserved.
- [ ] **Task 2** — `reports/[id]/client-summary` (batch, 196 LOC). 3 commits.
- [ ] **Task 3** — `reports/generate-question` (batch, 219 LOC). 3 commits.
- [ ] **Task 4** — `interviews/[id]/suggest-next` (batch, 266 LOC). 3 commits.
- [ ] **Task 5** — `interviews/[id]/validate` (batch, 271 LOC). 3 commits.
- [ ] **Task 6** — `reports/analyze-technician-report` (batch, 289 LOC). 3 commits.
- [ ] **Task 7** — `analytics/narrative` (streaming, 328 LOC). 3 commits.
- [ ] **Task 8** — `reports/generate-enhanced` (batch, 498 LOC). 3 commits.
- [ ] **Task 9** — `reports/generate-cost-estimation` (batch, 935 LOC). 3 commits.
- [ ] **Task 10** — `reports/upload` (streaming, 950 LOC). 3 commits.
- [ ] **Task 11** — `reports/generate-scope-of-works` (batch, 1,022 LOC). 3 commits.

**Total: 33 commits across 11 atomic PRs, 11 service files + 11 test files added, 11 routes migrated.**

Each task = one PR. Each PR uses the dispatch template at `.claude/plugins/cache/.../superpowers/.../subagent-driven-development/implementer-prompt.md`. Spec compliance + code quality reviewer per PR; merge to main before starting the next route to avoid stacked diffs.

---

## Task 12: Docs + final audit close-out (1 commit)

- [ ] Update `.claude/STANDARDS.md` AI Service Pattern section: bump canonical-examples list with wave-3 additions (no semantic change to the pattern).
- [ ] Update `session_manifest.md`: AI Services Extraction COMPLETE — three waves, 19 routes migrated, gateway has batch + streaming + apiKey-override. Only webhook routes (`webhooks/github`, `webhooks/stripe`) retain direct-SDK imports (legitimate signature-verification boundary).
- [ ] Run final audit: `grep -rln "^import .* from ['\"]@anthropic-ai/sdk['\"]" app/api --include='*.ts' | grep -v __tests__` — expected result: only the two webhook routes.
- [ ] Re-run Phase 3 audit per `architectural-integrity-protocol`: confirm no `lib/services/ai/**` imports `next/server` / `getServerSession` / `next/headers`.

Single commit: `docs(standards+manifest): AI Services Extraction COMPLETE — three-wave close-out`.

---

## Verification at end of plan

- [ ] All 11 service files exist in `lib/services/ai/` with tests.
- [ ] `pnpm type-check` green.
- [ ] `npx vitest run lib/services/ai/` shows 80+ tests passing (45 from waves 1+2 + ~35 new).
- [ ] `pnpm test:smoke:sandbox` green (if reachable).
- [ ] Final Phase 3 audit shows only 2 webhook routes importing `@anthropic-ai/sdk` directly.
- [ ] STANDARDS.md + manifest carry the close-out.
- [ ] PR opened referencing all three plans.

---

## Out of scope (deferred to Phase 4+)

- **UsageEvent telemetry gateway-side.** Wave-1 retrospective flagged this as a known gap (per-route UsageEvent logging dropped during migration). Phase 4 should move telemetry into `callAnthropic` / `callAnthropicStream` so it's not per-caller boilerplate. Cross-cutting, not a route migration.
- **BYOK unification.** `lib/ai/byok-client.ts` is a separate substrate (user-supplied keys, multi-provider routing). Cross-pollination with the platform-key gateway is a Phase 4 decision.
- **Webhook signature-verification routes.** `webhooks/github`, `webhooks/stripe` legitimately need the SDK for `Webhooks.constructEvent` (Stripe) / signature verification helpers. Do not migrate.

---

## Risk + edge cases

- **`reports/upload`** is 950 LOC and uses `messages.stream` — likely the most complex extraction. Read the file end-to-end before touching; the streaming SSE loop + file-processing pipeline must be preserved in the route (orchestration), only the SDK-call block moves to the service.
- **`reports/generate-scope-of-works`** is the largest at 1,022 LOC. It may have multiple AI calls or shared helpers with `inspections/[id]/generate-scope` (wave-2). Check for shared SYSTEM_PROMPT or shared user-message construction — if shared, extract once and import.
- **`reports/generate-question` + `interviews/[id]/suggest-next` + `interviews/[id]/validate`** are likely conversational (each step depends on prior context). The service should accept the conversation history as an input parameter; do NOT bake it into the service.
- **Vision routes** in this wave: none confirmed by survey grep, but `reports/upload` may accept image uploads. If so, the service signature follows the wave-2 `auto-classify-photo` pattern (Cloudinary URL → vision message).
- **`/api/analytics/narrative`** is streaming — applies the wave-2 generate-scope pattern. SSE loop + persistence in the route; service returns the `MessageStream`.

The plan is intentionally less prescriptive than wave-1/wave-2 because the recipe is now proven. Implementer reads the route, applies the recipe, commits. Reviewer confirms.
