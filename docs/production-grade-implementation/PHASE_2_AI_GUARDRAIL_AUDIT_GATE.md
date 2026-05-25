# Phase 2 AI Guardrail Audit Gate

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Command

```bash
pnpm audit:ai
```

The command runs:

```bash
tsx scripts/audit-ai-call-sites.ts --gate
```

JSON output remains available with:

```bash
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

## What It Checks

- scans `app`, `lib`, and `scripts` for static AI/provider/RAG call-site surfaces.
- classifies every detected AI surface into a known `AiTaskClass`.
- fails the gate when any detected AI surface is classified as `unknown`.
- reports provider-family counts.
- reports task-class counts.
- reports policy-wrapped surface count.
- reports sensitive external-provider surface count.
- keeps false-positive exclusions explicit in `guardrailSummary.ignoredFilePatterns`.
- emits human-readable output by default and machine-readable JSON with `--json`.

## What It Does Not Check Yet

- it does not require all AI surfaces to be policy-wrapped.
- it does not fail when only 5 of 88 surfaces are policy-wrapped.
- it does not perform runtime provider calls.
- it does not validate live model responses.
- it does not write usage logs or database records.
- it does not enforce tenant/account context decisions.
- it does not enforce cost budgets.
- it does not change model routing.
- it does not approve report, OCR/image, RAG/IICRC, voice/realtime, or public-route changes.

## Current Baseline

From `pnpm audit:ai` on 2026-05-25:

- AI surfaces: 88.
- unknown task classes: 0.
- policy-wrapped surfaces: 5.
- sensitive external-provider surfaces: 66.
- files scanned: 1,194.

Task-class baseline:

- `fast_classification`: 16.
- `support_response_draft`: 1.
- `support_ticket_analysis`: 1.
- `ocr_image_understanding`: 41.
- `report_drafting`: 6.
- `standards_rag_lookup`: 6.
- `voice_realtime`: 2.
- `workflow_automation`: 5.
- `embeddings`: 10.
- `unknown`: 0.

## Pass/Fail Criteria

Pass:

- the audit command exits `0`.
- `guardrailSummary.unknownTaskClassCount` is `0`.
- `guardrailSummary.pass` is `true`.
- JSON output can be parsed.
- sensitive external-provider surfaces remain visible in the report.
- policy-wrapped surfaces are counted but not required to equal total surfaces.

Fail:

- any detected AI surface is classified as `unknown`.
- JSON output becomes unparseable.
- false-positive exclusions are hidden or implicit.
- the audit suppresses a real AI/provider/RAG surface to make the gate pass.

## CI Recommendation

`pnpm audit:ai` is now wired into `.github/workflows/pr-checks.yml` after lint and before unit tests. Suggested PR gate order:

1. `pnpm type-check`
2. `pnpm lint`
3. `pnpm audit:ai`
4. `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`
5. `pnpm exec tsx scripts/audit-api-routes.ts --json`

Do not make CI fail on policy-wrapped count yet. The current adoption target is classification coverage and visibility, not full policy migration.

## Rollback Plan

Revert only:

- `package.json` script entry `audit:ai`.
- `.github/workflows/pr-checks.yml` AI guardrail audit step.
- guardrail summary and gate-mode additions in `scripts/audit-ai-call-sites.ts`.
- added audit test cases in `scripts/__tests__/audit-ai-call-sites.test.ts`.
- this report and Phase 2 documentation updates.

Rollback does not require data migration because the gate is static, non-runtime, and has no DB writes.

## Next Adoption Step

Use the gate as a PR review signal. The next safe Phase 2 slice should either:

- perform a fresh owner-reviewed candidate selection before wrapping another low-risk AI helper, or
- document that no further low-risk helper exists without product/security/architecture review.

Do not proceed to DB-backed usage logging, model routing, OCR/image, RAG/IICRC, voice/realtime, final report generation, or customer-facing report generation until the relevant architecture and evidence gates are approved.
