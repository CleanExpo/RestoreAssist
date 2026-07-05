# SP-A: Job-Close Terminal State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the terminal state for an inspection's lifecycle — a tradie (or admin) can explicitly close a job that has cleared sign-off, invoicing, and handover, fixing the §3.3 `InspectionStatus` enum decay (`COMPLETED` defined but never written) and giving the journey an actual end. Closing writes `Inspection.status = CLOSED`, appends an immutable `ProgressTransition` row (rule 22), fires the AI `close-summary` lifecycle hook (§5) for the user to confirm, and hands the artifact ZIP to SP-E's `exportClosedJobToBYOKStorage` for BYOK Drive mirroring. Hybrid trigger surface: AI suggests when preconditions clear; user always confirms — never auto-commit (§5.3 editability invariant).

**Architecture:** One additive Prisma migration extends `InspectionStatus` (adds `IN_BILLING`, `CLOSED`, `ARCHIVED`) and adds three columns to `Inspection` (`closeSummary: String?`, `completedAt: DateTime?`, `closePackageStorageKey: String?`). New state-machine module `lib/lifecycle/inspection-state-machine.ts` is the single source of truth for `canTransition` + `nextSuggestions`, consumed by SP-A today and SP-B/SP-C later. New `lib/audit/lifecycle-event.ts` writes the append-only `ProgressTransition` + companion `AuditLog` rows under a `claimProgressId` derived from the inspection's existing `ClaimProgress` row. New AI hook `lib/ai/lifecycle/on-close.ts` (bootstraps the `lib/ai/lifecycle/` directory that doesn't yet exist) drafts a client-facing close summary through the existing `model-router` honouring subscription gate + atomic credit deduction + BYOK fallback (rules 8, 9). One new transactional API route `POST /api/inspections/[id]/close` orchestrates the precondition re-check, state transition, audit log, hook fan-out, and SP-E export call (fire-and-forget per rule 13). UI surface: new `<CloseJobPrompt>` Sidekick-styled card mounted on the inspection detail page, replacing the post-sign-off "terminal dead-end" called out in §2 stage 7.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + PostgreSQL, NextAuth, shadcn/ui dialog primitives (rule 16), Vitest, Playwright, existing `lib/ai/model-router.ts` + `lib/credit-deduction` substrate, existing `lib/storage/index.ts` factory (SP-E adds the GDrive arm), existing `withIdempotency` wrapper from `lib/idempotency.ts`.

**Spec:** `docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md` — primary §8 (SP-A); cross-cutting §3.1 (state machine), §3.3 (enum decay), §5 (AI lifecycle hooks); dependency §4.2 (SP-E close-package export hook); design principle §10 (no double-handling).

**Dependencies:** SP-E (Storage BYOK) must ship before merge — this plan calls `exportClosedJobToBYOKStorage(inspectionId)` which SP-E provides. SP-B (auto-progression) is downstream; SP-A defines the contract SP-B's webhook subscribers fulfil. SP-J (handover) precondition is honoured but SP-J is not blocking — `Inspection.handoverCompletedAt` already exists as a nullable column after SP-J's migration; SP-A treats absence as "handover not required for v1 close" with a soft gap warning rendered in the UI.

**Scope envelope:** ~1 week (3 build days + 2 test days + verification gate).

> **Cross-plan reconciliation note (enum naming):** Spec §8.1 introduces `IN_BILLING` and uses the existing `COMPLETED`. This plan additionally adds `CLOSED` + `ARCHIVED` per Wave 1 PR scope. The terminal state the close-button writes is `CLOSED`; `COMPLETED` is retained for the SP-C tab (deprecation handled there). The intermediate `IN_BILLING` is the pre-close state where invoice → paid is awaited. Implementations should treat `COMPLETED` as deprecated for new writes and prefer `CLOSED`.

---

## File Structure

### Files to CREATE

- `prisma/migrations/20260516000000_inspection_close_terminal_state/migration.sql` — additive: 3 new `InspectionStatus` values, 3 new `Inspection` columns, partial index `Inspection(status) WHERE status IN ('IN_BILLING','CLOSED','ARCHIVED')` for Completed-tab queries (consumed later by SP-C).
- `lib/lifecycle/inspection-state-machine.ts` — exports `canTransition(from: InspectionStatus, to: InspectionStatus, ctx: TransitionContext): TransitionResult` and `nextSuggestions(current: InspectionStatus, ctx: TransitionContext): SuggestedAction[]`. Pure functions; no Prisma imports — testable in isolation.
- `lib/lifecycle/__tests__/inspection-state-machine.test.ts` — Vitest matrix covering every (from, to) tuple, missing-precondition rejections, soft-gap surfacing.
- `lib/audit/lifecycle-event.ts` — exports `writeLifecycleTransition({ inspectionId, fromState, toState, transitionKey, actorUserId, actorRole, guardSnapshot, prismaTx? })` that writes both the `ProgressTransition` append-only row (with `integrityHash` per rule 22) and the companion `AuditLog` row. Idempotent on `(claimProgressId, transitionKey, transitionedAt)` collision via try/catch on unique-constraint error.
- `lib/audit/__tests__/lifecycle-event.test.ts` — unit tests for hash determinism, idempotency on duplicate, transaction-context handling.
- `lib/ai/lifecycle/on-close.ts` — exports `buildCloseSummary({ inspectionId, invoiceId, userId, orgId }): Promise<CloseSummaryDraft>`. Pulls Inspection + Invoice + Report + key signed-off photos, routes through `lib/ai/model-router.ts` with `feature: "close-summary"`, respects subscription gate (`["TRIAL","ACTIVE","LIFETIME"]`, 402 on CANCELED), atomic credit deduction via existing helper, BYOK fallback if `Organization.byokAiProvider` set, writes `AuditLog` action `AI_GENERATED_CLOSE_SUMMARY`, falls back to a deterministic template string when AI is unavailable so the manual form still renders (§13.5 subscription regression invariant).
- `lib/ai/lifecycle/_shared.ts` — bootstraps the cross-hook plumbing called out in §5.2 (subscription gate + credit deduction + model-router wrap). Re-exports a thin `runLifecycleHook<TInput, TDraft>(spec)` helper that future hooks (`draft-invoice`, `next-action`, etc.) consume. Minimum viable shape — full surface lands in SP-B/SP-G.
- `lib/ai/lifecycle/__tests__/on-close.test.ts` — Vitest: happy path AI draft, CANCELED subscription → 402, 0 credits → returns manual template (no error), BYOK fallback path, audit-log row asserted.
- `app/api/inspections/[id]/close/route.ts` — `POST` only. `getServerSession` + role guard (owner USER or org ADMIN/MANAGER), wrapped in `withIdempotency` (terminal events are retry-safe). Calls state machine, re-validates preconditions atomically, opens `prisma.$transaction`: (a) CAS update inspection to `CLOSED`, (b) `writeLifecycleTransition`, (c) update `ClaimProgress.currentState` + `closedAt`. Returns `{ inspection, transitionId }`. On success, awaits-not the SP-E call (`exportClosedJobToBYOKStorage(inspectionId).then(({storageKey}) => persistKey)` — rule 13). Returns `409` on precondition fail with `{ error, missing: string[] }` (rule 23 evidence-gated promotion mirror).
- `app/api/inspections/[id]/close/__tests__/route.test.ts` — integration: happy path (writes status + transition + audit), 409 with missing array when invoice unpaid, 403 for non-owner non-admin, 401 unauthed, idempotent retry returns 200 with same transitionId, fire-and-forget SP-E call non-blocking (mocked to throw → response still 200).
- `app/api/inspections/[id]/close-summary/route.ts` — `POST` that wraps `buildCloseSummary` so the UI can request a fresh AI draft (and the user can regenerate). Distinct route so credit deduction is observable in `AuditLog` separately from the close commit.
- `components/inspection/CloseJobPrompt.tsx` — Sidekick-styled card surfacing the AI draft (loading skeleton, editable `<Textarea>`, "Looks right, close job" primary CTA, "Not yet" dismiss, "Regenerate draft" link). Mounts on inspection detail page conditional on `inspection.status === "IN_BILLING"` AND derived `canClose === true`. Confirmation dialog (shadcn `<Dialog>`, rule 16) on primary CTA — final warning that closing is reversible only via admin re-open (SP-C).
- `components/inspection/__tests__/CloseJobPrompt.test.tsx` — RTL: renders draft, edit persists local state, dismiss hides card without API call, primary CTA opens dialog, dialog confirm fires `POST /close` with `closeSummary` body, error state renders inline.
- `e2e/job-close-happy-path.spec.ts` — Playwright: full lifecycle DRAFT → SUBMITTED → IN_BILLING → CLOSED, asserts Completed tab visibility (SP-C is downstream; this test asserts the status field and the post-close UI lock).
- `e2e/job-close-preconditions.spec.ts` — Playwright: attempt to close when invoice not paid → 409 surfaced as banner, status unchanged.

### Files to MODIFY

- `prisma/schema.prisma` — extend `InspectionStatus` enum (`IN_BILLING`, `CLOSED`, `ARCHIVED` appended; existing `COMPLETED` retained but deprecated in a comment for SP-C migration); add `Inspection.closeSummary: String? @db.Text`, `Inspection.completedAt: DateTime?`, `Inspection.closePackageStorageKey: String?`; add `Inspection.handoverCompletedAt: DateTime?` if SP-J hasn't already added it (idempotent migration check).
- `app/dashboard/inspections/[id]/page.tsx` — dynamic-import `<CloseJobPrompt>` (line ~46 sibling of `InspectionSignOff`); pass `inspection`, `invoiceStatus`, `reportStatus`; mount in the right column under the existing sign-off card when status crosses `SUBMITTED`. Extend the local `Inspection` interface (line 117) to include `status: InspectionStatus` (typed, not string), `completedAt: string | null`, `closeSummary: string | null`. No behavioural changes to existing tabs.
- `app/api/inspections/[id]/route.ts` (the GET serving the detail page) — include the three new columns in the `select`. Confirmed via existing pattern (rule 4: explicit select).
- `prisma/schema.prisma` `ClaimProgress` — confirm `closedAt: DateTime?` exists. No change.

### Files to VERIFY only (no edit unless audit finds drift)

- `lib/storage/index.ts` — the SP-E PR must export `exportClosedJobToBYOKStorage`. Task 0 below is the audit gate before any of this plan's tasks run.
- `lib/idempotency.ts` — already used by `/sign` route; confirm signature matches `(request, userId, async (rawBody) => Response)` pattern.
- `lib/ai/model-router.ts` — confirm `feature` param accepts a new `"close-summary"` literal or the routing key is a free string.

---

## Task Map

| # | Task | Phase | Depends on |
|---|---|---|---|
| 0 | SP-E export-hook audit gate | Pre-flight | SP-E PR merged |
| 1 | Prisma migration A (enum + columns + index) | Foundation | 0 |
| 2 | `inspection-state-machine.ts` + tests | Foundation | 1 |
| 3 | `lifecycle-event.ts` audit writer + tests | Foundation | 1 |
| 4 | `lib/ai/lifecycle/_shared.ts` plumbing | Foundation | — |
| 5 | `lib/ai/lifecycle/on-close.ts` + tests | API | 2, 4 |
| 6 | `POST /api/inspections/[id]/close-summary` route + tests | API | 5 |
| 7 | `POST /api/inspections/[id]/close` route + tests | API | 2, 3, 5 |
| 8 | `<CloseJobPrompt>` component + tests | UI | 6, 7 |
| 9 | Mount on inspection detail page | UI | 8 |
| 10 | E2E specs (2) | Verification | 9 |
| 11 | Verification-gate manual smoke | Verification | 10 |

---

## Task 0: SP-E Export Hook Audit Gate

**Files:** verify-only.

- [ ] **Step 1 (Red):** Write a smoke test `lib/storage/__tests__/exportClosedJobToBYOKStorage.smoke.test.ts` that imports the symbol and asserts it's a function — should pass post-SP-E, fail before. Run; if it fails, BLOCK and escalate. No SP-A code is written until SP-E ships this surface.
- [ ] **Step 2 (Green):** Once symbol resolves, run an integration call against a fixture inspection to verify the returned shape `{ storageKey: string, byteSize: number, mirrorJobId: string }`. The `storageKey` is what SP-A persists into `Inspection.closePackageStorageKey`.
- [ ] **Step 3 (Refactor):** Delete the smoke test (one-time gate, not a perpetual check).
- [ ] **Step 4 (Commit):** `checkpoint: SP-E hook verified — clear to start SP-A`.

## Task 1: Prisma Migration A

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260516000000_inspection_close_terminal_state/migration.sql`.

- [ ] **Step 1 (Red):** Add a schema-level Vitest `prisma/__tests__/migration-close-state.test.ts` that asserts `Prisma.InspectionStatus.CLOSED` exists at runtime (will fail before migration). Run: red.
- [ ] **Step 2 (Green):** Edit `schema.prisma`: append `IN_BILLING`, `CLOSED`, `ARCHIVED` to `InspectionStatus` enum (lines 1936–1945); add the three new columns to the `Inspection` model immediately after `processedAt` (lines ~1792); leave existing `COMPLETED` value in place (SP-C handles the deprecation path).
- [ ] **Step 3 (Green):** `pnpm prisma:generate` then `npx prisma migrate dev --name inspection_close_terminal_state`. Inspect the generated SQL — must be additive only (`ALTER TYPE … ADD VALUE` for enum, `ADD COLUMN` for fields, both `NOT NULL`-free). Hand-add the partial index for SP-C: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Inspection_terminal_status_idx" ON "Inspection"("status") WHERE "status" IN ('IN_BILLING','CLOSED','ARCHIVED');`.
- [ ] **Step 4 (Refactor):** Run `npx prisma validate` + `pnpm type-check`. Confirm zero drift.
- [ ] **Step 5 (Commit):** `feat(SP-A): extend InspectionStatus enum + close columns`.

## Task 2: `inspection-state-machine.ts`

**Files:** `lib/lifecycle/inspection-state-machine.ts`, `lib/lifecycle/__tests__/inspection-state-machine.test.ts`.

- [ ] **Step 1 (Red):** Author the test matrix first. For every (from, to) ∈ `InspectionStatus²`, assert `canTransition` returns the expected `TransitionResult`. Cover: legal `SUBMITTED → IN_BILLING`, `IN_BILLING → CLOSED`, `CLOSED → ARCHIVED`; illegal `DRAFT → CLOSED`, `CLOSED → DRAFT`; precondition-driven `IN_BILLING → CLOSED` requires `invoiceStatus === 'PAID'` AND `reportStatus === 'SENT'` AND optional soft-gap `handoverCompletedAt != null`. Run: red.
- [ ] **Step 2 (Green):** Implement as a pure function. Shape: `TransitionResult = { ok: true, softGaps: string[] } | { ok: false, missing: string[] }`. Same shape as the M-15 progress gates so SP-B/SP-C can reuse the contract (rule 23 mirror).
- [ ] **Step 3 (Green):** Implement `nextSuggestions(current, ctx)` returning `SuggestedAction[]` for each non-terminal state. From `IN_BILLING` with all preconditions: `[{ key: 'close_job', label: 'Close this job', confidence: 'high' }]`. From `IN_BILLING` with `invoiceStatus !== 'PAID'`: empty array (no suggestion to advance).
- [ ] **Step 4 (Refactor):** Extract the precondition matrix to a `const` `TRANSITION_REQUIREMENTS` at the top of the file so SP-B can import it for webhook subscribers.
- [ ] **Step 5 (Commit):** `feat(SP-A): inspection state machine`.

## Task 3: `lifecycle-event.ts` audit writer

**Files:** `lib/audit/lifecycle-event.ts`, `lib/audit/__tests__/lifecycle-event.test.ts`.

- [ ] **Step 1 (Red):** Test `writeLifecycleTransition` asserts both `ProgressTransition` and `AuditLog` rows are written within the supplied `Prisma.TransactionClient`; assert `integrityHash` is SHA-256 of canonical `claimProgressId|fromState|toState|actorUserId|transitionedAt`; assert duplicate call with same transitionKey + claimProgressId + same-second timestamp throws caught + returns the existing row (idempotent). Run: red.
- [ ] **Step 2 (Green):** Implement. Hash via Node `crypto.createHash('sha256')` — matches rule 22's chain-of-custody invariant. Look up `ClaimProgress` by `inspectionId` — if absent (legacy inspection with no progress row), create one inline within the same tx (defensive, since the inspection cannot have reached `IN_BILLING` without a ClaimProgress per SP-J, but old data exists).
- [ ] **Step 3 (Refactor):** Take `prismaTx` as an optional param defaulting to `prisma`. Inline JSDoc says callers SHOULD pass a tx so the inspection update + transition row are atomic.
- [ ] **Step 4 (Commit):** `feat(SP-A): append-only lifecycle audit writer`.

## Task 4: `lib/ai/lifecycle/_shared.ts`

**Files:** `lib/ai/lifecycle/_shared.ts`.

- [ ] **Step 1 (Green):** Bootstrap directory. Export `runLifecycleHook<TInput, TDraft>({ feature, userId, orgId, build, fallback })` — checks subscription allowlist → 402 path returns `{ ok: false, code: 'SUBSCRIPTION_REQUIRED' }`; calls `deductCreditAtomically(userId)` per rule 9 — on zero credits, calls `fallback(input)` and returns `{ ok: true, draft, source: 'fallback' }`; on success, routes via `lib/ai/model-router.ts` honouring BYOK; writes `AuditLog` action `AI_GENERATED_<feature.toUpperCase()>` regardless of source.
- [ ] **Step 2 (Refactor):** Match existing model-router signature exactly. No new public surface beyond the helper.
- [ ] **Step 3 (Commit):** `feat(SP-A): lifecycle hook _shared plumbing`.

## Task 5: `on-close.ts`

**Files:** `lib/ai/lifecycle/on-close.ts`, `lib/ai/lifecycle/__tests__/on-close.test.ts`.

- [ ] **Step 1 (Red):** Tests cover the 4 paths: happy AI draft, CANCELED subscription returns 402-coded result, zero credits returns fallback template, BYOK provider configured routes through user key. Assert AuditLog action `AI_GENERATED_CLOSE_SUMMARY` written in all three success paths. Run: red.
- [ ] **Step 2 (Green):** Implement `buildCloseSummary({ inspectionId, invoiceId, userId, orgId })`. Pulls inspection + invoice + report + organization (single Prisma query with `include`, bounded; rule 4). Builds prompt: "You are RestoreAssist's close-summary assistant. Draft a client-facing summary (max 200 words) of inspection {{number}} at {{address}}, completed {{signedAt}}. Cite IICRC S500:2021 §{{section}} where relevant. Include scope completed + total billed (GST 10%) + warranty period." Routes via `runLifecycleHook` with `feature: "close-summary"` and `fallback` returning a deterministic template.
- [ ] **Step 3 (Refactor):** Add IICRC citation guard: scan returned draft for `S500:` token; if missing AND classification claims water damage, append a stock citation line (rule 14). Editability invariant per §5.3 — never auto-commit; this hook only produces a draft.
- [ ] **Step 4 (Commit):** `feat(SP-A): on-close AI lifecycle hook`.

## Task 6: `POST /api/inspections/[id]/close-summary`

**Files:** `app/api/inspections/[id]/close-summary/route.ts`, `app/api/inspections/[id]/close-summary/__tests__/route.test.ts`.

- [ ] **Step 1 (Red):** Integration tests: 401 unauthed, 403 wrong-org, 200 happy (draft returned), 402 on CANCELED, regenerate idempotency-safe under retry (each regen is a separate credit-charged event — explicit `Idempotency-Key` from client controls). Run: red.
- [ ] **Step 2 (Green):** Implement. `getServerSession` + org-scope guard via `Inspection.userId`/workspace membership. Call `buildCloseSummary`. Return `{ draft, source }`. Honour rule 7 — never leak `error.message`.
- [ ] **Step 3 (Commit):** `feat(SP-A): close-summary regenerate route`.

## Task 7: `POST /api/inspections/[id]/close`

**Files:** `app/api/inspections/[id]/close/route.ts`, `app/api/inspections/[id]/close/__tests__/route.test.ts`.

- [ ] **Step 1 (Red):** Tests: happy path → status = CLOSED + ProgressTransition row + AuditLog `JOB_CLOSED` + closePackageStorageKey populated (via mocked SP-E); 409 when invoice unpaid (status untouched, response body `{ error, missing: ['invoice_paid'] }`); 403 non-owner non-admin; 401 unauthed; idempotency retry returns identical body; SP-E mock throws → response still 200 (rule 13 fire-and-forget). Run: red.
- [ ] **Step 2 (Green):** Implement transactional handler. Pseudocode:

```ts
const session = await getServerSession(authOptions);
if (!session?.user?.id) return unauthorized();
return withIdempotency(request, userId, async (rawBody) => {
  const { closeSummary } = parse(rawBody);
  if (!closeSummary?.trim()) return badRequest("closeSummary required");

  const result = await prisma.$transaction(async (tx) => {
    const insp = await tx.inspection.findUnique({ where: { id }, select: {...} });
    if (!insp) return { code: 404 };
    if (!isOwnerOrAdmin(session, insp)) return { code: 403 };

    const ctx = await loadTransitionContext(tx, insp);
    const gate = canTransition(insp.status, "CLOSED", ctx);
    if (!gate.ok) return { code: 409, missing: gate.missing };

    const cas = await tx.inspection.updateMany({
      where: { id, status: "IN_BILLING" },
      data: { status: "CLOSED", completedAt: new Date(), closeSummary },
    });
    if (cas.count === 0) return { code: 409, missing: ["status_drift"] };

    const transition = await writeLifecycleTransition({
      inspectionId: id, fromState: "IN_BILLING", toState: "CLOSED",
      transitionKey: "close_job", actorUserId: userId,
      actorRole: session.user.role, guardSnapshot: gate.snapshot,
      prismaTx: tx,
    });
    return { code: 200, transitionId: transition.id };
  });

  if (result.code !== 200) return NextResponse.json({ error, missing }, { status: result.code });

  // fire-and-forget — rule 13
  exportClosedJobToBYOKStorage(id)
    .then(({ storageKey }) => prisma.inspection.update({ where: { id }, data: { closePackageStorageKey: storageKey } }))
    .catch((e) => console.error("[close/SP-E mirror]", e));

  return NextResponse.json({ success: true, transitionId: result.transitionId });
});
```

- [ ] **Step 3 (Refactor):** Extract `loadTransitionContext` to `lib/lifecycle/load-context.ts` — SP-B's webhook subscribers will reuse it.
- [ ] **Step 4 (Commit):** `feat(SP-A): close route + transactional state transition`.

## Task 8: `<CloseJobPrompt>` component

**Files:** `components/inspection/CloseJobPrompt.tsx`, `components/inspection/__tests__/CloseJobPrompt.test.tsx`.

- [ ] **Step 1 (Red):** RTL: render gated by status, draft loads on mount via fetch, edit-in-place persists, dismiss hides without POST, primary CTA opens shadcn `<Dialog>`, confirm in dialog fires `POST /close`, 409 surfaces inline banner showing missing[] list, success renders the locked "Job Closed" CheckCircle card.
- [ ] **Step 2 (Green):** Build component. Visual language matches `InspectionSignOff.tsx` (cyan accent, rule 17 brand). Loading state = skeleton textarea while `close-summary` route resolves. Subscription-gated 402 → friendly renew CTA + manual form (§13.5 — platform never becomes unusable mid-journey). Editability invariant: AI draft is editable text from first render.
- [ ] **Step 3 (Refactor):** Hoist the missing-precondition rendering into a `<MissingPreconditionsBanner>` sub-component — SP-C re-open UI will reuse it.
- [ ] **Step 4 (Commit):** `feat(SP-A): CloseJobPrompt component`.

## Task 9: Mount on inspection detail page

**Files:** `app/dashboard/inspections/[id]/page.tsx`.

- [ ] **Step 1 (Red):** E2E smoke against staging build verifying the prompt only appears for IN_BILLING status (will land in Task 10's spec).
- [ ] **Step 2 (Green):** Dynamic-import `<CloseJobPrompt>` mirroring the existing `InspectionSignOff` dynamic import (line ~46). Mount in the right column directly below sign-off. Extend the local `Inspection` interface with the three new columns. Confirm `app/api/inspections/[id]/route.ts` GET selects them.
- [ ] **Step 3 (Refactor):** Verify zero regression to existing tabs via `pnpm type-check` + a quick local smoke. No new layout, no Tailwind churn (rule 3 surgical-changes).
- [ ] **Step 4 (Commit):** `feat(SP-A): mount CloseJobPrompt on inspection detail`.

## Task 10: E2E specs

**Files:** `e2e/job-close-happy-path.spec.ts`, `e2e/job-close-preconditions.spec.ts`.

- [ ] **Step 1 (Red):** Author specs. Happy path uses fixture inspection seeded into `IN_BILLING` with paid invoice + sent report; navigates to detail page; asserts CloseJobPrompt renders; clicks "Close job"; confirms dialog; asserts redirect-free post-close state with locked "Job Closed" card + status badge. Precondition spec seeds inspection with unpaid invoice; asserts prompt is absent (no suggestion) AND if user POSTs directly via fetch, server returns 409.
- [ ] **Step 2 (Green):** Run against local. Iterate until green.
- [ ] **Step 3 (Refactor):** Tag both specs `@sp-a` for CI matrix routing.
- [ ] **Step 4 (Commit):** `test(SP-A): E2E coverage`.

## Task 11: Verification-Gate manual smoke

- [ ] **Step 1:** Author the manual checklist per `.claude/rules/verification-gate.md`:
  1. **Where to check:** staging at `/dashboard/inspections/{seeded-id}` as the owning tradie.
  2. **How to get there:** login as fixture tradie → click seeded inspection (status IN_BILLING, paid invoice, sent report).
  3. **What to see:** CloseJobPrompt card with AI draft populated within 5s · "Looks right, close job" primary CTA · "Regenerate draft" link · "Not yet" dismiss.
  4. **What NOT to see:** the card on a fixture inspection still in SUBMITTED status · the card on an inspection with an unpaid invoice · any sign that closing happened without confirmation dialog.
  5. **Confirmation prompt:** "Have you confirmed the close prompt only renders for IN_BILLING + paid invoice + sent report, and that closing writes status=CLOSED, ProgressTransition row, AuditLog `JOB_CLOSED`, and the SP-E mirror queues a job within 30s? [yes/no]"
- [ ] **Step 2:** Capture 3 screenshots: prompt rendered · post-close locked card · Prisma Studio showing ProgressTransition row + Inspection.closePackageStorageKey populated.
- [ ] **Step 3:** Attach to PR description.

---

## Hybrid Trigger Surface

Per §8.2, the close prompt is "Sidekick-styled" — pulled, not pushed:

- **Manual trigger:** the user navigates to the inspection detail page; the CloseJobPrompt renders iff `nextSuggestions(current, ctx)` contains `'close_job'`. The state machine's job is to make this answer cheap and centralised.
- **Auto-progression trigger (SP-B handshake):** SP-B's `lib/lifecycle/subscribers/invoice-paid.ts` (out of scope for this plan) flips `Invoice.status = PAID` then calls `nextSuggestions` and writes a `LifecycleSuggestion` row that the UI polls. SP-A does not write or read that row — it only ensures the state machine is the single source of truth so SP-B's subscribers and SP-A's UI evaluate identically.
- **Editability invariant honoured at both surfaces:** the AI draft is always editable, and no transition is committed until the user clicks the dialog confirm. §5.3 is non-negotiable for IICRC compliance.

## AI Integration per §5

`buildCloseSummary` is the second concrete instance of the lifecycle-hook pattern (after `auto-tag-photo` if it ships earlier, otherwise the first). It honours every invariant in §5.2:

- **Subscription gate:** allowlist `["TRIAL","ACTIVE","LIFETIME"]`; 402 with friendly renew CTA on `CANCELED`/`PAST_DUE` (rule 8).
- **Atomic credit deduction:** via existing `updateMany({ where: { creditsRemaining: { gte: 1 } } })` helper; on zero, fallback template renders (NOT an error — §13.5).
- **IICRC citations:** S500:2021 §X.Y inline; citation guard ensures format compliance (rule 14).
- **BYOK fallback:** if `Organization.byokAiProvider` set, route via user's own key, skip platform credit deduction.
- **AuditLog row:** `AI_GENERATED_CLOSE_SUMMARY` written regardless of source (AI / BYOK / fallback template) so admins can later compare what the AI proposed vs what was sent (§5.4).
- **Storage of AI artefacts (§5.4):** when SP-E export runs, it includes the AI draft JSON alongside the final close-summary the user sent. SP-A's responsibility ends at writing the draft + final to the DB; SP-E's `exportClosedJobToBYOKStorage` reads both and bundles them into `/jobs/{id}/drafts/close-summary-ai.json` + `/jobs/{id}/final/close-summary.txt`.

## Testing Strategy

**Unit (Vitest):** state-machine canTransition matrix (Task 2); lifecycle-event hash determinism + idempotency (Task 3); _shared.ts subscription/credit branches (Task 4); on-close hook all four paths (Task 5).

**Integration (Vitest + Prisma):** close-summary route (Task 6); close route happy + 8 reject paths (Task 7); ProgressTransition row written within same transaction as inspection update — assert via `prisma.$transaction` mock that both fire or neither does.

**E2E (Playwright):** happy path + preconditions (Task 10). Both tagged `@sp-a` so CI can run them alongside SP-E and SP-J specs as a combined "close-the-loop" matrix.

**Subscription regression:** Task 5's test for zero-credits returning a manual template is the §13.5 invariant — confirmed in the test suite, not deferred to manual QA.

**Visual regression:** one new Playwright screenshot baseline of the CloseJobPrompt rendered state and the post-close locked state (consistent with §13.6 verification-gate evidence requirement).

## Verification Gate

Per `.claude/rules/verification-gate.md`, the manual gate at Task 11 is the merge blocker. The PR description must contain the 5-element checklist (where / how / what to see / what NOT to see / confirmation prompt) plus the 3 staging screenshots. CI gates (rule 13.4): `pnpm type-check`, `pnpm lint`, `npx vitest run`, `npx playwright test e2e/job-close-*.spec.ts`, `npx prisma migrate diff = no drift`.

### Critical Files for Implementation

- `prisma/schema.prisma`
- `lib/lifecycle/inspection-state-machine.ts`
- `lib/ai/lifecycle/on-close.ts`
- `app/api/inspections/[id]/close/route.ts`
- `components/inspection/CloseJobPrompt.tsx`
