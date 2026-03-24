# RestoreAssist — Claude Code Implementation Plan

> **Branch:** `feat/nir-v2-implementation`  
> **Status:** Ready for implementation  
> **Session context:** All specification work is complete. This file tells Claude Code exactly what to build, in what order, and where.

---

## What has already been done (do NOT re-do)

The following files are already on `main` or this branch — they are spec/infrastructure only and do not need to be created:

- `lib/nir-standards-mapping.ts` — IICRC S500/S520/S700 clause constants
- `lib/nir-evidence-architecture.ts` — evidence register + content gate functions
- `lib/nir-jurisdictional-matrix.ts` — 8-state regulatory trigger matrix
- `lib/nir-field-reality-spec.ts` — offline-first / BT / UX requirements
- `lib/nir-insurer-engagement.ts` — insurer engagement pathway
- `lib/integrations/xero/nir-sync.ts` — Xero NIR invoice sync
- `lib/integrations/quickbooks/nir-sync.ts` — QBO NIR invoice sync
- `lib/integrations/myob/nir-sync.ts` — MYOB NIR sale sync
- `lib/integrations/servicem8/nir-sync.ts` — ServiceM8 NIR job sync
- `lib/integrations/ascora/nir-sync.ts` — Ascora NIR job sync
- `lib/integrations/nir-sync-orchestrator.ts` — unified sync dispatcher
- `app/api/integrations/nir-sync/route.ts` — POST /api/integrations/nir-sync
- All `docs/` spec files

---

## Task 1 — Wire standards mapping into the classification engine

**File to modify:** `lib/nir-classification-engine.ts`

**What to do:**

1. Import `S500_FIELD_MAP`, `STANDARDS_VERSIONS` from `./nir-standards-mapping`
2. In `classifyIICRC()`, replace the string literals used for `standardReference` with typed constants from `S500_FIELD_MAP`:
   - `category` justification → use `S500_FIELD_MAP.waterCategory.clauseRef` (currently hardcoded as `"IICRC S500 Section 4.1"` etc.)
   - `class` reference → use `S500_FIELD_MAP.waterClass.clauseRef`
   - moisture threshold logic → reference `S500_FIELD_MAP.moistureContent.thresholds` for material-specific thresholds instead of the single hardcoded `> 15` check
3. The returned `ClassificationResult.standardReference` should now be a proper structured citation, e.g. `"IICRC S500 §7.1–7.3; IICRC S500 §8.1–8.4"`
4. Add a `iicrcEdition` field to `ClassificationResult` pulled from `STANDARDS_VERSIONS.S500.edition` so the report output can cite the edition

**Key constraint:** The function signature of `classifyIICRC()` must NOT change — it's called from multiple routes. Only the internal logic and return value fields change.

---

## Task 2 — Wire jurisdictional matrix into building codes

**File to modify:** `lib/nir-building-codes.ts`

**What to do:**

1. Import `getJurisdictionConfig`, `getActiveTriggers` from `./nir-jurisdictional-matrix`
2. In `getStateBuildingCodeRequirements()`, after existing logic runs, call `getJurisdictionConfig(stateUpper)` and merge the jurisdiction's `triggers` into the returned object as a new `jurisdictionTriggers` field
3. In `checkBuildingCodeTriggers()`, after the existing moisture/mould/asbestos checks, call `getActiveTriggers(state, inspectionContext)` and append any returned triggers to the `triggers[]` array and their `requiredAction` strings to `requiredActions[]`
4. The `inspectionContext` parameter of `checkBuildingCodeTriggers()` needs two new optional fields added: `isFloodZone?: boolean` and `isBushfireProne?: boolean` — these are passed through to `getActiveTriggers()`

**Key constraint:** All existing return shapes must be maintained. New fields are additive only.

---

## Task 3 — Add NIR sync trigger to the report submit flow

**File to modify:** `app/api/inspections/[id]/submit/route.ts`

**What to do:**

After the existing submit logic succeeds (report status updated, any existing post-submit actions), add a non-blocking NIR sync trigger:

```typescript
// After successful submit — trigger integration sync (non-blocking)
try {
  const syncPayload = { reportId: inspection.reportId }
  // Fire-and-forget: don't await, don't fail the submit if sync fails
  fetch(`${process.env.NEXTAUTH_URL}/api/integrations/nir-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
    body: JSON.stringify(syncPayload),
  }).catch(err => console.error('[NIR Sync] Auto-trigger failed:', err))
} catch (syncErr) {
  console.error('[NIR Sync] Could not trigger integration sync:', syncErr)
}
```

This means every time a NIR is submitted, the integration sync fires automatically to all connected platforms. The submit response is not delayed — sync happens in the background.

**Key constraint:** The submit route's response must not change. Sync failure must never cause submit failure.

---

## Task 4 — Add `iicrcRef` to ScopeItem report output

**File to modify:** `lib/nir-report-generation.ts`

**What to do:**

When generating the NIR report, each scope item's line in the report should include the IICRC reference from `ScopeItem.justification` if it exists.

1. Find where scope items are serialised into the report output (likely a `.map()` over `inspection.scopeItems`)
2. In the line item object, add: `iicrcReference: item.justification ?? undefined`
3. In the PDF/text rendering of each scope item, append `[${item.justification}]` after the description if `justification` is non-null — this puts the standards citation visibly on every line item in the report output

This is the final link in the chain: the IICRC reference flows from the standards mapping → scope determination → report generation → integration sync → external platforms.

---

## Environment variables needed (for integration testing)

Add to `.env.local`:

```bash
# At minimum one of these to test the sync:
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=

# Or for Ascora (most natural fit for restoration):
ASCORA_CLIENT_ID=
ASCORA_CLIENT_SECRET=
```

See `docs/INTEGRATIONS.md` for the full list and redirect URIs to register.

---

## Test commands after implementation

```bash
# TypeScript check — must pass with zero errors
npx tsc --noEmit

# Verify classification engine still works
curl -X POST /api/inspections/{id}/classification

# Verify building codes still works  
curl -X GET /api/inspections/{id}/classification

# Trigger a manual NIR sync (once an integration is connected)
curl -X POST /api/integrations/nir-sync \
  -H 'Content-Type: application/json' \
  -d '{"reportId": "<a real report id>"}'
```

---

## Summary

| Task | File | Type | Risk |
|------|------|------|------|
| 1 — Standards in engine | `lib/nir-classification-engine.ts` | Modify | Low — additive fields |
| 2 — Jurisdictional in building codes | `lib/nir-building-codes.ts` | Modify | Low — additive fields |
| 3 — Auto-sync on submit | `app/api/inspections/[id]/submit/route.ts` | Modify | Very low — fire-and-forget |
| 4 — IICRC refs in report output | `lib/nir-report-generation.ts` | Modify | Low — display only |

All 4 tasks are additive modifications. No existing functionality is removed or replaced. TypeScript should compile cleanly after all 4 are done.
