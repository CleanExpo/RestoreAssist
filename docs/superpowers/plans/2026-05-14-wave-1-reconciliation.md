# Wave 1 Plans — Cross-Plan Reconciliation Notes

> Three Wave-1 implementation plans landed together via parallel-agent drafting:
>
> - `2026-05-14-onboarding-hotfix.md` — Google Drive OAuth + `storageProvider` foundation
> - `2026-05-14-sp-e-storage-byok.md` — full BYOK pipeline (provider, dual-write queue, export hook)
> - `2026-05-14-sp-a-job-close.md` — job-close terminal state + AI close-summary
>
> Two interfaces had drift between the drafts. Both reconciled below; the affected plan files have been edited to match.

## Reconciliation 1 — `exportClosedJobToBYOKStorage` signature

**Original disagreement:**
- SP-E proposed `Promise<void>` (fire-and-forget, no return data).
- SP-A needed a return value to populate `Inspection.closePackageStorageKey`.

**Resolution:** SP-E returns a structured object; SP-A wraps the call in `.then()`/`.catch()` so close-route stays non-blocking on failure.

**Locked contract:**

```ts
export async function exportClosedJobToBYOKStorage(
  inspectionId: string,
): Promise<{ storageKey: string; byteSize: number; mirrorJobId: string }>;
```

- Implementation always resolves; failures inside the function are caught + Sentry-logged + return `{ storageKey: "", byteSize: 0, mirrorJobId: "" }`. Callers treat empty `storageKey` as "not yet ready, retry from Settings → Storage."
- SP-A's close route fires `exportClosedJobToBYOKStorage(id).then(({storageKey}) => persistKey).catch(log)` — never blocks the 200 response (rule 13).

## Reconciliation 2 — `InspectionStatus` enum naming

**Original disagreement:**
- SP-5 spec §8.1 introduces `IN_BILLING` and uses the existing `COMPLETED`.
- The Wave-1 PR prompt requested adding `CLOSED` and `ARCHIVED`.

**Resolution:** Add all three (`IN_BILLING`, `CLOSED`, `ARCHIVED`); retain the existing `COMPLETED` value for SP-C tab semantics (deprecation path lives in SP-C).

**Locked enum after SP-A migration:**

```
InspectionStatus = DRAFT | IN_PROGRESS | SUBMITTED | COMPLETED | IN_BILLING | CLOSED | ARCHIVED
```

- `SUBMITTED → IN_BILLING` is the new transition gated by sign-off complete.
- `IN_BILLING → CLOSED` is the terminal close-button transition gated by invoice paid + report sent.
- `CLOSED → ARCHIVED` is admin-only, post-retention-period.
- `COMPLETED` is retained but the close-button writes `CLOSED`. SP-C migration plan covers either deprecating `COMPLETED` or mapping its tab semantics onto `CLOSED|ARCHIVED`.

## Wave 1 dependency order

```
Onboarding hotfix (~2 days)
  ↓ provides /api/oauth/google-drive/* + storageProvider columns
SP-E Storage BYOK (~1 week)
  ↓ provides exportClosedJobToBYOKStorage hook + GoogleDriveStorageProvider
SP-A Job-Close terminal state (~1 week)
```

SP-J (handover) is parallel-eligible with SP-A once SP-E ships — its design needs a separate brainstorm (per SP-5 §9 "own brainstorm" tag), so it is NOT included in this Wave 1 plan set.

## What's NOT in this Wave 1

Per the CEO-board ordering (SP-5 §15 roadmap):

- **SP-J — On-site handover package** ($2B-grade deliverable) — needs its own brainstorm before plan can be drafted.
- **SP-H — Knowledge substrate** (Obsidian → RAG) — Wave 2, needs own brainstorm.
- **SP-G — AI Sidekick** (Live Teacher) — Wave 2, needs own brainstorm.
- **SP-B — Auto-progression chain** — Wave 3, depends on SP-A + SP-J.
- **SP-C — Completed tab + admin re-open** — Wave 3, depends on SP-A.
- **SP-D, SP-F, SP-K** — flagged out of scope in §14.

## Execution recommendation

Implement Wave 1 sequentially (Onboarding → SP-E → SP-A), each via `superpowers:subagent-driven-development` so the per-task TDD cycle and two-stage review hold. Estimated wall-clock: ~2.5 weeks with one engineer. PRs land sandbox → release sandbox→main per the existing rhythm.
