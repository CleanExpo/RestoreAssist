# JEV deterministic harness (RestoreAssist)

Script-judged test families that call RestoreAssist's real route handlers and `lib/`
functions in-process, as six identities across two synthetic firms, on a throwaway local
Postgres. Pattern from Synthex `tests/eval/jev/`. How to run: `.claude/skills/jev-harness/SKILL.md`.

## Layout

| Path | What |
|---|---|
| `families.json` | Family table: name, `expected_cases` floor, `hard_gate` |
| `known-gaps/<FAMILY>.json` | Optional. `{"gaps":{"<gap_id>":{"description":"...","cases":["<id or prefix*>"]}}}` |
| `families/<jN>.jev.test.ts` | One vitest file per family; planted controls in `families/<jN>/` |
| `runner/setup.ts` | Session stand-in (`asIdentity`), outbound network refusal (`takeBlocked`), quiet logs |
| `runner/world.ts` | Two synthetic firms: owner, manager, technician in A; owner, technician in B; firm A data carries a marker string |
| `runner/route-harness.ts` | `listRoutes`, `invokeRoute` (never throws; a crash is `status: null`) |
| `runner/judge.ts` | Route-call verdict: leak, signed-out access, cross-tenant write, server error |
| `runner/record.ts` | `JevResult`, `classify`, `recordResults` |
| `runner/aggregate.mjs` | The verdict; `--control` runs its planted self-test |
| `runner/run-det.mjs` | `npm run jev:det`: fresh database via `scripts/ci/test-with-db.sh`, then the verdict |
| `runner/triage.mjs` | Advisory failure clusters; model triage DISABLED |
| `runner/db-up.sh`, `runner/dev-run.sh` | Long-lived dev database for iterating on one family |
| `out/` (gitignored) | `<FAMILY>.jsonl`, `summary.json`, `triage.md` |

## Result record

`{"id","family","kind":"case"|"control","state":"PASS"|"FAIL"|"KNOWN_GAP"|"INCONCLUSIVE","area","route","identity","detail","gap_id"}`

`area` is one of flow, photos, floorplans, crm, payments, security, domain. A control's
state is the detector's verdict on a planted defect, so FAIL means caught.

## Verdict

A family fails the run when its file is missing or empty, a row is malformed or
duplicated, it has fewer than 3 controls, any control is not FAIL (BROKEN_CHECK), or its
case count is below the floor. A hard-gate family also fails on any FAIL or INCONCLUSIVE
case. Non-hard-gate reds are RED_ADVISORY. A non-zero vitest exit is a run failure.

## What it does not reach

The UI, the mobile app, and every external provider (Cloudinary, Stripe's servers, Xero,
AI providers, property listing sites): their network calls are refused by design, and
results that depend on them read INCONCLUSIVE.
