# Phase 3 Release Candidate Plan

Date: 2026-05-25

Branch prepared from: `codex/phase-2-ai-workflow-upgrades`

## Objective

Prepare RestoreAssist for a real release-candidate decision without merging, shipping, or approving `/shipit`.

Phase 3 must convert remaining manual/external blockers into evidence-backed decisions. It must not claim production readiness until every blocker is resolved or explicitly accepted by release ownership.

## Required Final Validation Gates

Run from `/private/tmp/RestoreAssist-phase1-main`:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm type-check
pnpm lint
pnpm exec vitest run
pnpm build
pnpm audit --audit-level=high --prod
pnpm audit:ai
pnpm exec tsx scripts/audit-api-routes.ts --json
pnpm exec tsx scripts/audit-env.ts --json
pnpm --dir mobile --ignore-workspace type-check
cd mobile && pnpm exec vitest run --config vitest.config.ts
git diff --check
```

All failures must be fixed or explicitly accepted by release ownership before a release candidate can proceed.

## Public Route Sign-Off Requirements

Current API audit baseline:

- routes: 442.
- errors: 0.
- warnings: 14.
- warning category: `public-token-route-review`.

Before release candidate approval:

- each of the 14 public-route warnings must have a named product/security owner.
- each route must have a decision: approve, fix, restrict, rate-limit, or document exception.
- accepted exceptions must include evidence for token scope, expiry where relevant, audit event expectations, and rate-limit posture.
- rerun `pnpm exec tsx scripts/audit-api-routes.ts --json`.

## Mobile Simulator/Device Validation Requirements

Local mobile validation is not enough for ship approval.

Required evidence on iOS simulator, Android emulator, Expo Go, or physical device:

- clean app launch.
- create offline job/record.
- add photo/document evidence offline.
- force interrupted sync.
- recover stale processing rows.
- replay queue when online.
- confirm server state.
- confirm local app refresh.
- confirm duplicate replay does not corrupt data.

Attach screenshots/logs and note device/OS/app build.

## Supabase Release-Day RLS Revalidation

Required before release candidate decision:

- rerun Supabase security advisor and require no ERROR-level findings.
- rerun live RLS aggregate and require `rls_off=0`.
- rerun anon-policy listing or approved equivalent and confirm exposure matches documented public-reference policies.
- document credential/tool used without printing secrets.

If credential/tooling is unavailable, release candidate status remains blocked unless release ownership explicitly accepts the blocker.

## Vercel TLS Release-Day Confirmation

Required before release candidate decision:

- confirm `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production, Preview, and Development.
- confirm production HTTPS responds successfully.
- document owner decision that process-wide TLS bypass must not be reintroduced.

Suggested commands:

```bash
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
curl -I https://restoreassist.app
```

Do not print secret values.

## Env Audit

Run:

```bash
pnpm exec tsx scripts/audit-env.ts --json
```

Required result:

- 0 errors.
- 0 warnings or documented accepted findings.
- no live TLS bypass.
- no public service-role env names.

## API Audit

Run:

```bash
pnpm exec tsx scripts/audit-api-routes.ts --json
```

Required result:

- 0 errors.
- all public-route warnings resolved, approved, or documented with owner sign-off.

## AI Audit

Run:

```bash
pnpm audit:ai
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

Required result:

- 0 unknown task classes.
- sensitive external-provider surfaces remain visible.
- policy-wrapped count is reported.
- no hidden or suppressed AI surfaces.

Current baseline:

- 88 AI surfaces.
- 0 unknown task classes.
- 5 policy-wrapped surfaces.
- 66 sensitive external-provider surfaces.

## Root Validation

Run the full root gate:

- install.
- Prisma generate.
- type-check.
- lint.
- unit tests.
- build.
- high-severity prod dependency audit.
- whitespace check.

Any failure blocks release candidate approval unless fixed or accepted in writing.

## Mobile Validation

Required local package gates:

- `pnpm --dir mobile --ignore-workspace type-check`
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`

Required manual/device gate:

- execute the mobile simulator/device validation script above.

## Rollback Plan

Before release candidate approval:

- name release owner.
- name rollback owner.
- name monitoring owner.
- confirm Vercel rollback target.
- confirm database rollback stance: prefer roll-forward fixes for schema/RLS, do not blanket-disable RLS.
- confirm feature-disable path for failed integrations.
- confirm mobile app rollback/update path if device evidence fails.

## Final Decision Options

### SHIP

Use only if every manual blocker is cleared with evidence and all validation gates pass.

### SHIP WITH KNOWN EXTERNAL BLOCKERS

Use only if release ownership explicitly accepts unresolved external/manual blockers, records the risk, names owners, and confirms rollback/monitoring.

### DO NOT SHIP

Use if any required evidence is missing, validation fails, public-route sign-off remains incomplete, mobile device validation is missing, or protected artifacts are staged.

Current recommended decision: **DO NOT SHIP**.
