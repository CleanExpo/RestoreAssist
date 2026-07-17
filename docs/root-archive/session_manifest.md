# Session Manifest — RestoreAssist · 2026-05-18

**Branch:** `release/sandbox-to-main-2026-05-16-final` @ `66b5289e` (PR #1117)
**Remote:** in sync with `origin/release/sandbox-to-main-2026-05-16-final`
**Working tree:** clean.
**PR:** #1117 OPEN · MERGEABLE.
**AI service suite:** 19 files / 81 tests passing.

**Wave-3 SHIPPED in PR #1117:** 9 routes migrated this session (synopsis, client-summary, generate-question, suggest-next, validate, analyze-technician-report, narrative, generate-enhanced, upload). 2 routes skipped — `reports/generate-cost-estimation` + `reports/generate-scope-of-works` import `@anthropic-ai/sdk` but never invoke it (dead-code imports; comment hints AI was planned but unwired). Post-wave-3 audit: only legitimate `webhooks/github` retains a direct SDK import.

## Architectural Tree (post-feature audit)

```
RestoreAssist/
├── CLAUDE.md                                   80 LOC · lean (Karpathy recall pattern)
├── AGENTS.md                                   80 LOC · byte-identical to CLAUDE.md (Codex agents)
├── session_manifest.md                         this file
├── .claude/
│   ├── ARCHITECTURE.md                         + opensrc pointer at top
│   ├── STANDARDS.md                            + "Service Layer (2026-05-18)" section
│   ├── RULES.md                                full 28-rule list, Progress Framework, Karpathy
│   ├── PACKAGE_LOOKUPS.md                      opensrc patterns for RA deps
│   ├── PROGRESS.md                             truncated 2,497→274; Stop-hook removed
│   ├── TESTING.md, WORKFLOWS.md, DESIGN.md
│   ├── aggregation/                            ← single big-picture snapshot
│   │   ├── MASTER_PLAN.md                     9-stage roadmap, critical path 2026-06-20
│   │   ├── linear/inventory.md                RA team, P0/P1 issues
│   │   ├── supabase/state.md                  119-table RLS finding
│   │   ├── supabase/rls-categorisation.md     bucketed for RA-4970
│   │   ├── research/service-layer-…-2026-05-18.md  Margot pointer
│   │   ├── vercel/state.md, github/state.md, hermes/inventory.md
│   │   └── pi-ceo/, wiki/, sources/ inventories
│   ├── skills/                                 (gitignored by default — force-added below)
│   │   ├── service-layer-architecture/SKILL.md
│   │   └── architectural-integrity-protocol/SKILL.md
│   └── archive/                                12 historical .md (env-audit, senior-pm, v1.x, etc.)
├── lib/services/                               [SERVICE LAYER] [PASS] all clean
│   ├── _shared/result.ts                       ServiceResult<T,E> + ok/fail
│   ├── _shared/__tests__/result.test.ts        3/3 [PASS]
│   ├── xero/credentials.ts                     getValidXeroAccessToken — structured
│   ├── xero/__tests__/credentials.test.ts      7/7 [PASS]
│   ├── inspection/validate-submission.ts       pure validation, no I/O
│   └── inspection/__tests__/…test.ts           6/6 [PASS]
├── lib/integrations/xero/
│   └── token-manager.ts                        [PENDING] deprecation shim; RA-1308 preserved
├── app/api/inspections/[id]/submit/route.ts    [PASS] thin orchestration + validation gate
├── app/api/cron/sync-xero-payments/route.ts    [PASS] uses credResult
├── docs/superpowers/plans/2026-05-18-runtime-reconciliation-deployment-lifecycle.md
├── vendor/opensrc/                             920K · vercel-labs/opensrc CLI vendored
└── scripts/rls-categorise.py                   prisma → 119-table RLS bucketing
```

Audit emoji legend: [PASS] clean · [PENDING] transitional shim · [BLOCKED] violation.
**No [BLOCKED] in current state.**

## Feature State

### Completed (this session, 17 commits, all pushed)
| Commit | Track | Summary |
|---|---|---|
| `dd2bde55` | docs | CLAUDE.md slim 225→80 lines + vendor/opensrc |
| `d63d02a7` | docs | Archive 12 stale .md + AGENTS.md sync + disable PROGRESS.md spam hook |
| `f5297afe` | RLS | scripts/rls-categorise.py + 119-table bucketing → RA-4970 filed |
| `93a84f1e` | skill | Service Layer Architecture skill + Runtime Reconciliation plan |
| `2062c190` | T1 | ServiceResult<T,E> foundation |
| `388edc9b → 092937fc → 1d736382 → 1e71794b` | T2–T4 | Xero credentials extraction + RA-1308 shim |
| `d5eafeee → 1110ff5a → 485366ea` | T5–T7 | 3 caller migrations |
| `c7fffc1d → b16e9aaa` | T8 | Inspection-submission validation extraction |
| `7b473aae` | T9 | STANDARDS.md docs note |
| `4d3f4fa4` | skill | SKILL.md enriched with Margot quotes + Saga pattern |
| `d5c23f13` | docs | aggregation/research pointer |
| `<new>` | protocol | Architectural Integrity Protocol skill |

### In Progress (none — clean handover)

### Pending / Backlog (next session pick-up)
- **RA-4970 in flight:** service-role audit GREEN (`4d9d9842`); 5 prod-only tables bucketed (`82325c67`); migration drafted (`82325c67`) + made env-tolerant (`24af1345`); **applied to `oxeiaavuspvpvanzcrjc` 2026-05-18 — 131 tables RLS-on, 12 anon-SELECT policies, advisor reports 0 critical findings.** Remaining: apply to prod `udooysjajglluvuxkijp` (Phill explicit authorisation required by classifier).
- ~~**Delete the deprecation shim** at `lib/integrations/xero/token-manager.ts`~~ [PASS] done in `e1924b13` (2026-05-18). `getXeroTenantId` relocated to `lib/services/xero/tenant.ts` as proper `ServiceResult<string, 'TENANT_MISSING'>`. Shim + 237-line test deleted. **Note:** that commit also swept in the pre-existing iOS `Package.resolved` drift via `git add -A` — scope-mixed but benign; not force-amending a release branch.
- **Follow-up plans referenced in plan:**
  - `2026-05-DD-runtime-reconciliation-phase-2-inspection-mechanics.md` — extract classification dispatch, NIR generation, integration fan-out from the 566-line submit handler.
  - `2026-05-DD-deployment-lifecycle-cron-helpers.md` — worker-restart, token-cleanup, sync-queue-provisioning helpers.
  - `2026-05-DD-credential-services-multi-provider.md` — Ascora / MYOB / QuickBooks / SM8 / Stripe — same pattern as Xero.
- **Wiki re-ingest:** Margot's 4,500-word report still lives only in the interaction record. Run `wiki-ingest` skill to persist into `~/2nd Brain/2nd Brain/Wiki/`.
- **AI Services Extraction Wave-1 SHIPPED.** Plan at `docs/superpowers/plans/2026-05-18-ai-services-extraction-wave.md`. All wave-1 tasks complete; 19/19 tests green across `lib/services/ai/`.
  - **Task 1** (gateway foundation) — `df6c5857 → 6b004603`. `lib/services/ai/anthropic-gateway.ts` live with `ServiceResult<Anthropic.Message, AnthropicReason>`; extended in `74fd8ea6` with optional `apiKey` override for platform flows (7/7 tests).
  - **Task 2** (classify) — `c3b71402 → 1eb8f006`. `lib/services/ai/classify-inspection.ts` + route migration (4/4 tests).
  - **Task 3** (group-readings, substituted from generate-scope) — `8f257cbd → c7a71699 → 74df47e0`. Streaming-free batch route; same shape as classify (4/4 tests).
  - **Task 4** (support-ticket draft) — `70212870 → 78aaf317 → 1d646846`. Platform-key flow via the new `apiKey` override (4/4 tests).
  - **Task 5** (docs + manifest) — STANDARDS.md "AI Service Pattern" section added; this manifest updated.
  - **Generate-scope DEFERRED to wave-2** — uses `messages.stream(...)`, requires a `callAnthropicStream` extension on the gateway. Out of scope for wave-1.
  - **Wave-2 SHIPPED** at `15955267 → 84bd5180 → 394f6c43 → 22bff0bb → dd9cddca → 48b7895e → f60674a5 → 31e64d28 → 212d5692 → 60a1485c → b68d5c2f → ebde212a → eb07e0f6 → c791de2f → e4898a62 → 3a8ab2a9 → ec9a853e → 032d2218`. 18 commits across 7 tasks. Final `lib/services/ai/` count: **45/45 tests across 10 files**.
    - Task 1 (streaming gateway) — `84bd5180 / 394f6c43`. `callAnthropicStream`.
    - Task 2 (generate-scope streaming) — `22bff0bb / dd9cddca / 48b7895e`. Thin service wraps stream request; route keeps SSE loop + usage logging + scope-item persistence + abort().
    - Task 3 (vision/extract-reading) — `f60674a5 / 31e64d28 / 212d5692`. Vision batch. Adds `NO_READING_DETECTED` reason for "model can't read meter" path.
    - Task 4 (sketches/import-from-image) — `60a1485c / b68d5c2f / ebde212a`. Vision batch. Service surfaces `usage` so route's `logAiUsage` workspace-budget log survives.
    - Task 5 (auto-classify-photo) — `eb07e0f6 / c791de2f / e4898a62`. Vision batch via Cloudinary URL.
    - Task 6 (support/tickets) — `3a8ab2a9 / ec9a853e / 032d2218`. `analyse-support-ticket` service (single AI call: category + priority + draft). **Public-submit graceful degradation preserved**: helper returns `null` on any reason; POST falls back to user-provided values + "normal" priority.
  - **Wave-3 scope (11 routes still on direct SDK imports — discovered post-wave-2):** `app/api/analytics/narrative`, `app/api/interviews/[id]/suggest-next`, `app/api/interviews/[id]/validate`, `app/api/reports/[id]/client-summary`, `app/api/reports/[id]/synopsis`, `app/api/reports/analyze-technician-report`, `app/api/reports/generate-cost-estimation`, `app/api/reports/generate-enhanced`, `app/api/reports/generate-question`, `app/api/reports/generate-scope-of-works`, `app/api/reports/upload`. (Plus `app/api/webhooks/github` — legitimate boundary, do not migrate.) Wave-3 plan: `2026-05-DD-ai-services-extraction-wave-3.md` (TBD). Also wave-3: UsageEvent telemetry gateway-side (deferred from wave-1 retrospective).
- **Stale aggregation snapshot:** `.claude/aggregation/sources/repo-state.md` still lists archived files at `.claude/` root. Regenerate next aggregation pull.
- **Untracked decision:** `.agents/` + `.codex/` were committed in `d63d02a7` but appear to have been regenerated since by some hook. Decide gitignore-or-recommit.

## Dependency Mapping (critical edges for next session)

```
lib/services/_shared/result.ts
    ↑ imported by
    ├── lib/services/xero/credentials.ts
    └── lib/services/inspection/validate-submission.ts
        ↑
    └── (any new service module — pin this import path)

lib/services/xero/credentials.ts
    ↑ imported by (post-migration callers)
    ├── app/api/cron/sync-xero-payments/route.ts
    ├── lib/integrations/xero/nir-sync.ts
    ├── lib/integrations/xero/webhook-processor.ts
    └── lib/integrations/xero/token-manager.ts (deprecation shim only)

lib/integrations/xero/token-manager.ts          (legacy throw API)
    ↑ still imported by
    ├── lib/setup/checks.ts:330                 ← MIGRATE NEXT
    └── lib/integrations/xero.ts:231            ← MIGRATE NEXT

.claude/skills/service-layer-architecture/SKILL.md
    ↔ referenced by
    ├── CLAUDE.md (line 49)
    ├── .claude/STANDARDS.md (Service Layer section)
    ├── .claude/skills/architectural-integrity-protocol/SKILL.md
    └── docs/superpowers/plans/2026-05-18-…-plan.md

.claude/aggregation/MASTER_PLAN.md              ← read this for "where are we"
    ↑ pointed to by .claude/PROGRESS.md header

scripts/rls-categorise.py
    ← reads prisma/schema.prisma
    → writes .claude/aggregation/supabase/rls-categorisation.md
```

## Active Code Snippets (for next session)

### `lib/services/_shared/result.ts` (the foundation — quote when extending)
```typescript
export type ServiceResult<T, E extends string = string> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: E;
      detail?: string;
      retryAfterMs?: number;
      cause?: unknown;
    };

export function ok<T>(data: T) { return { ok: true as const, data }; }
export function fail<E extends string>(
  reason: E,
  extras?: { detail?: string; retryAfterMs?: number; cause?: unknown },
) { return { ok: false as const, reason, ...extras }; }
```

### `lib/integrations/xero/token-manager.ts` (shim shape — copy when migrating Ascora/MYOB/QB)
```typescript
// Deprecation shim: throw-based legacy API, preserves provider-specific side effects.
export async function getValidXeroToken(integrationId: string): Promise<string> {
  const result = await getValidXeroAccessToken(integrationId);
  if (result.ok) return result.data;

  // Provider-specific terminal-vs-transient classification at the boundary.
  if (result.reason === "REFRESH_FAILED") {
    const detail = result.detail ?? "";
    if (isTerminalAuthFailure(detail)) {
      await disconnectIntegration(integrationId);
    } else {
      await markIntegrationError(integrationId, `Token refresh failed: ${detail}`);
    }
  }
  throw new XeroTokenError(
    integrationId,
    result.cause ?? result.detail ?? `Xero credentials unavailable (${result.reason})`,
  );
}
```

## Open Decisions (next session must resolve before proceeding)

1. **`.agents/` + `.codex/` working-tree state** — are these regenerated by a hook, or stale from this session? `git status` should be checked first thing.
2. **RA-4970 sequencing** — start with `lib/supabase/server.ts` service-role audit, OR start with the 5 unknown-table investigation? **Recommend audit first** (gates migration safety) — proceed unless Phill redirects.
3. **Push to main?** Release branch is 17 commits ahead of `main` at `0409c17`. Merge requires Phill approval per durable rules (no auto-merge to main).
4. **Wiki ingest?** `/wiki-ingest` will persist Margot's full Service Layer research synthesis into `~/2nd Brain/2nd Brain/Wiki/`. Recommend running before next code session.

## Verification Ledger (3-line per claim)

| Claim | Verified-with | Would change my mind |
|---|---|---|
| Service Layer pattern proven on 2 domains | `npx vitest run lib/services/` → 16/16; final reviewer APPROVED | If a third extraction reveals the pattern needs Layer-1.5 |
| Tests are a meaningful gate | 126/126 across 15 files in 4.05s; new layer adds 16 | If Playwright E2E reveals route still 422s on valid inspections |
| RA-1308 preserved | All 10 token-manager tests pass through the shim; 2 RA-1308 cases pass | Production smoke against a real terminal-auth scenario |
| 119 RLS tables bucketed correctly | 17 of 17 buckets sum to 119; chain ownership verified per Prisma model | A 'service-only' table that's actually called from a client component |
| Branch pushed clean | `git push` exit 0; `88278f58..d5c23f13` reported by remote | A subsequent local commit after push that nobody pulled |

## How to resume in a fresh session

1. `cd /Users/phill-mac/RestoreAssist`
2. `cat session_manifest.md` (this file)
3. `git log --oneline -5` (verify HEAD matches `d5c23f13` or later)
4. `git status` (resolve `.agents/` / `.codex/` first)
5. Read `.claude/aggregation/MASTER_PLAN.md` section 1 for current empire-state
6. Read `docs/superpowers/plans/2026-05-18-runtime-reconciliation-deployment-lifecycle.md` "Follow-up plans" section for the next sequencing step
7. Apply the Architectural Integrity Protocol Phase 1 (Translation Blueprint) to whatever the next request is

---

STATE COMPLETED AND COMPACTED. Ready for Session Reset. Please copy this manifest into a fresh session.
