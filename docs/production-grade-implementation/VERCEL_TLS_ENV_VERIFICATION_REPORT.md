# Vercel TLS Env Verification Report

Date: 2026-05-25

## Scope

Priority 2 Phase 1 production hardening: verify Vercel TLS bypass risk, especially `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Safe checkout used:

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`

No production env values, `.github/PULL_REQUEST_TEMPLATE.md`, or `.agents/skills/appshots/` were modified.

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

## Live Vercel Verification

Live Vercel env names/scopes were verified read-only with Vercel CLI from a temporary directory outside the repo:

- temp link path: `/private/tmp/ra-vercel-env-check`
- project: `unite-group/restoreassist`
- project ID observed in CLI debug output: `prj_Aw90JJ2x7mTMatTxa3ymgcU7WPV2`
- team ID observed in CLI debug output: `team_KMZACI5rIltoCRhAtGCXlxUf`

Result:

| Environment | `NODE_TLS_REJECT_UNAUTHORIZED` status |
|---|---|
| Production | Present, encrypted value, created 56d ago |
| Preview | Not present in Vercel env listing |
| Development | Not present in Vercel env listing |

Vercel env values are encrypted in `vercel env ls`. I did not run `vercel env pull` because it would write secrets to disk. Therefore the exact value was not read, but the variable's presence in Production is enough to keep this as an unsafe TLS bypass blocker. If it is set to `0`, Node disables TLS certificate verification process-wide for server runtime code.

## Blocker Status

Status: BLOCKED until production Vercel removes `NODE_TLS_REJECT_UNAUTHORIZED` or an owner provides audited proof that the value is not `0` and is harmless.

Error: `NODE_TLS_REJECT_UNAUTHORIZED` exists in the Vercel Production environment.

Cause: historical Ascora self-signed/non-standard certificate workaround was documented as a production env option and appears to have been applied.

Fix: remove the production env var unless a dedicated, reviewed TLS trust strategy is implemented. Do not use a process-wide TLS verification bypass for production.

Next action: remove `NODE_TLS_REJECT_UNAUTHORIZED` from Production in Vercel, redeploy, and confirm `vercel env ls production` no longer lists it.

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

If removal is approved:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group
vercel env ls production --scope unite-group
```

Do not run `vercel env pull` for this check unless secrets-handling has been explicitly approved.

## Recommended Fix If Value Is `0`

Remove the production variable:

```bash
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group
```

Then replace the Ascora workaround with one of these reviewed options:

- fix the upstream Ascora TLS chain if Ascora provides a valid public certificate path
- use a scoped, integration-specific certificate trust strategy rather than process-wide TLS bypass
- if Ascora only supports a private CA, document the CA source and use `NODE_EXTRA_CA_CERTS` where the runtime supports it

## Rollback Notes

Removing `NODE_TLS_REJECT_UNAUTHORIZED` restores normal Node TLS certificate verification. If Ascora calls fail after removal, roll forward with a scoped Ascora TLS fix or disable the Ascora sync feature path temporarily. Do not roll back by re-adding a global production TLS bypass without explicit owner sign-off and incident-risk acceptance.

## Decision

Priority 2 is verified as a live production environment blocker, not a repo-code blocker. The repo does not execute or document the bypass directly, but Vercel Production currently contains the dangerous env var by name.

## Next Safe Action

Owner or authenticated operator removes `NODE_TLS_REJECT_UNAUTHORIZED` from Vercel Production and confirms it is absent. Keep the local env audit green with `pnpm exec tsx scripts/audit-env.ts --json`.
