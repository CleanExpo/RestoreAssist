# Vercel TLS Env Verification Report

Date: 2026-05-25

## Scope

Priority 2 Phase 1 production hardening: verify Vercel TLS bypass risk, especially `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Safe checkout used:

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`

Production Vercel env was modified only to remove the unsafe `NODE_TLS_REJECT_UNAUTHORIZED` variable after authenticated CLI verification. `.github/PULL_REQUEST_TEMPLATE.md` and `.agents/skills/appshots/` were not modified.

## Files And Configs Inspected

- `app/api/ascora/connect/route.ts`
- `app/api/ascora/sync/route.ts`
- `vercel.json`
- `scripts/build.sh`
- `.env.example`
- `.claude/aggregation/vercel/state.md`
- `.claude/aggregation/MASTER_PLAN.md`
- `.claude/aggregation/README.md`
- `.claude/aggregation/production-audit/backlog-audit.md`
- `docs/gap-catalog.md`
- `docs/production-grade-implementation/GAP_ANALYSIS.md`
- `docs/production-grade-implementation/PHASE_1_CRITICAL_PRODUCTION_GAPS.md`
- `docs/production-grade-implementation/IMPLEMENTATION_ROADMAP.md`
- `docs/production-grade-implementation/EXECUTION_BACKLOG.md`
- `.github/workflows/*`
- `scripts/*`

Searches performed:

- `NODE_TLS_REJECT_UNAUTHORIZED`
- `rejectUnauthorized`
- `NODE_EXTRA_CA_CERTS`
- `tls.connect`
- `httpsAgent`
- `agentOptions`
- `strictSSL`
- `strict-ssl`

## Repo Result

No executable or documented TLS bypass remains in the repo source/config scanned by the local forbidden-env audit.

Findings:

- `app/api/ascora/connect/route.ts` and `app/api/ascora/sync/route.ts` now advise fixing the Ascora certificate chain or using scoped trusted CA material instead of disabling process-wide Node TLS verification.
- Historical docs and aggregation snapshots repeatedly identify production `NODE_TLS_REJECT_UNAUTHORIZED` as a release blocker.
- `vercel.json`, `.env.example`, `scripts/build.sh`, and GitHub workflows do not set `NODE_TLS_REJECT_UNAUTHORIZED`.
- No repo runtime code sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`.
- `pnpm exec tsx scripts/audit-env.ts --json` currently reports 0 errors and 0 warnings.

## Live Vercel Verification And Correction

Live Vercel env names/scopes were verified with Vercel CLI from a temporary directory outside the repo:

- temp link path: `/private/tmp/ra-vercel-env-check`
- project: `unite-group/restoreassist`
- project ID: `prj_Aw90JJ2x7mTMatTxa3ymgcU7WPV2`
- team ID: `team_KMZACI5rIltoCRhAtGCXlxUf`

Initial result:

| Environment | `NODE_TLS_REJECT_UNAUTHORIZED` status |
|---|---|
| Production | Present, encrypted value, created 57d ago |
| Preview | Not present in Vercel env listing |
| Development | Not present in Vercel env listing |

Correction performed:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes
```

CLI result: `Removed Environment Variable`.

Post-removal verification:

| Environment | `NODE_TLS_REJECT_UNAUTHORIZED` status |
|---|---|
| Production | Not present in Vercel env listing |
| Preview | Not present in Vercel env listing |
| Development | Not present in Vercel env listing |

Vercel env values are encrypted in `vercel env ls`. I did not run `vercel env pull` because it would write secrets to disk. The exact removed value was not read, but the variable name's prior presence in Production was enough to treat it as unsafe.

## Blocker Status

Status: RESOLVED for Vercel project env configuration. `NODE_TLS_REJECT_UNAUTHORIZED` is no longer listed in Production, Preview, or Development.

Remaining runtime note: existing Vercel deployments may retain the old environment snapshot until a new production deployment is created. Do not claim runtime-level remediation for the currently served deployment until a production redeploy has completed and runtime environment evidence is checked.

Cause: historical Ascora self-signed/non-standard certificate workaround was documented as a production env option and appears to have been applied.

Fix applied: removed the Production env var. If Ascora needs custom trust handling, implement a dedicated, reviewed TLS trust strategy. Do not use a process-wide TLS verification bypass for production.

Next action: create or promote a production deployment without the deleted variable in its environment snapshot, then verify the live runtime no longer has `NODE_TLS_REJECT_UNAUTHORIZED`.

## Manual Verification Commands

Use a linked directory or a temp directory so repo metadata is not changed:

```bash
mkdir -p /private/tmp/ra-vercel-env-check
cd /private/tmp/ra-vercel-env-check
vercel link --yes --scope unite-group --project restoreassist
vercel env ls --scope unite-group
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
```

Expected safe result:

- Production: no `NODE_TLS_REJECT_UNAUTHORIZED`
- Preview: no `NODE_TLS_REJECT_UNAUTHORIZED`
- Development: no `NODE_TLS_REJECT_UNAUTHORIZED`, unless deliberately limited to local-only non-production testing and documented

Removal command already run successfully on 2026-05-25:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes
vercel env ls production --scope unite-group
```

Do not run `vercel env pull` for this check unless secrets-handling has been explicitly approved.

## Recommended Fix If Value Is `0`

The production variable has been removed. If this issue recurs, remove it again:

```bash
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes
```

Then replace the Ascora workaround with one of these reviewed options:

- fix the upstream Ascora TLS chain if Ascora provides a valid public certificate path
- use a scoped, integration-specific certificate trust strategy rather than process-wide TLS bypass
- if Ascora only supports a private CA, document the CA source and use `NODE_EXTRA_CA_CERTS` where the runtime supports it

## Rollback Notes

Removing `NODE_TLS_REJECT_UNAUTHORIZED` restores normal Node TLS certificate verification for new deployments that receive the updated env snapshot. If Ascora calls fail after removal, roll forward with a scoped Ascora TLS fix or disable the Ascora sync feature path temporarily. Do not roll back by re-adding a global production TLS bypass without explicit owner sign-off and incident-risk acceptance.

## Decision

Priority 2 is corrected at the Vercel project env configuration layer. The repo does not execute or document the bypass directly, and Vercel Production, Preview, and Development no longer list the dangerous env var by name.

## Next Safe Action

Run a production deployment so the live runtime gets a fresh environment snapshot, then confirm runtime behavior. Keep the local env audit green with `pnpm exec tsx scripts/audit-env.ts --json`.
