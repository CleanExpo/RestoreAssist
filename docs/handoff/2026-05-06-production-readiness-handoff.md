# Production-Readiness Handoff — 2026-05-06

> Session-end snapshot for the developer taking over the RestoreAssist
> production-readiness push. Production is healthy and shipping.
> All code-level recommendations from the autonomous run have landed.
> What remains is **5 config-only tasks** and one **multi-week initiative**.

---

## TL;DR

| | |
|---|---|
| **Production status** | [PASS] Healthy. `https://restoreassist.app/api/health` → HTTP 200, DB OK |
| **Open PRs** | 0 |
| **Sandbox state** | All in-flight work merged. Sandbox tracks main with the standard 2-commit squash-cosmetic offset. |
| **Test coverage** | 13 `@smoke` tests, 100% pass rate across 20 prod runs (260/260) |
| **Scheduled monitoring** | `@smoke` cron fires every 15 min vs prod (`.github/workflows/smoke-prod.yml`) |
| **Security** | 0 actionable CVEs (1 ignored, pre-existing in `pnpm.auditConfig.ignoreGhsas`) |
| **Type safety** | 0 errors in committed code |
| **CI gates enforcing** | Build, TypeScript Check, Prisma migration drift |
| **CI gates non-enforcing** | Lint (`continue-on-error: true` — backlog of 73,512 problems blocks the flip) |

---

## What shipped to prod across 4 cutover bundles

| Cutover | PR | Wave | What |
|---|---|---|---|
| 1st | #893 | Wave 1-5 bundle | CI build gate enforcing, Sentry wired, DigitalOcean cleanup, 15 type fixes, sandbox revival |
| 2nd | #895 | Wave 6.1 | Cron board-memo parser (RA-1979), iOS Capacitor SPM regen, 2 HIGH CVE overrides |
| 3rd | #897 | Wave 6.2 | 6 moderate + 1 low CVE overrides |
| 4th | #900 | Wave 6.3 | Scheduled prod smoke cron, `/api/health` DB cache (54% latency reduction) |

Plus #887 + #888 merged direct to main early in the session (CI build gate flip + Apple env var docs).

---

## Remaining tasks for you

Five items. Three are pure-config (5–30 min each). One is a deferred decision (your call). One is a multi-week initiative.

###  1. Set `SENTRY_DSN` in Vercel prod env

**Effort: 5 min · Impact: activates already-deployed Sentry**

Sentry is wired (`sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` in repo) but the SDK stays inert until `SENTRY_DSN` is set.

**Steps:**

1. Get a DSN from Sentry — https://sentry.io/settings/<org>/projects/restoreassist/keys/ (create a Next.js project there if one doesn't exist)
2. From Vercel CLI:
   ```bash
   cd /d/RestoreAssist
   vercel link --project restoreassist --yes
   vercel env add SENTRY_DSN production              # paste DSN
   vercel env add NEXT_PUBLIC_SENTRY_DSN production  # same value
   vercel --prod  # trigger redeploy so env vars load
   ```
3. (Optional, for source-map upload) Also add `SENTRY_AUTH_TOKEN` (project:releases scope), `SENTRY_ORG`, `SENTRY_PROJECT`. Without these, source maps don't upload but the SDK still captures errors with line numbers from minified bundles.
4. Verify by triggering a deliberate error in a non-customer route — it should appear in your Sentry dashboard within a minute.

###  2. Fix `restoreassist-sandbox` Vercel env

**Effort: 10 min · Impact: unblocks every sandbox preview deploy**

Current state of the sandbox Vercel project:

| Var | Currently | Should be |
|---|---|---|
| `DIRECT_URL` | Points at `udooysjajglluvuxkijp` (the prod-2026 Supabase) — **wrong project** | The sandbox Supabase's direct connection (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Points at `oxeiaavuspvpvanzcrjc` (the older 1-user Supabase) | Whichever Supabase the sandbox env should target |
| `DATABASE_URL` | Stale credentials → Prisma `P1000: Authentication failed` on every build | Same Supabase as DIRECT_URL, pooler URL (port 6543) |

Decide which Supabase project sandbox should use, then update all three env vars in the Vercel sandbox project to point at the same one. Without this, every PR will continue to show the documented-ignorable red X on `Vercel – restoreassist-sandbox`.

###  3. Skip rate-limit on `/api/health` (further latency win)

**Effort: 10 min · Impact: drops `/api/health` avg from 787ms to ~200ms**

PR #899 cached the DB probe (1.7s → 787ms). Remaining 787ms is mostly the Upstash ratelimit round-trip. `/api/health` is an infra endpoint — uptime monitors *should* be unconstrained. Drop the rate-limit:

In `app/api/health/route.ts`, remove (or skip on this route specifically):

```typescript
const rateLimited = await applyRateLimit(request, {
  maxRequests: 60,
  windowMs: 60_000,
  prefix: "health",
});
if (rateLimited) return rateLimited;
```

Open as a small PR. Re-run `pnpm test:smoke:prod` after merge to confirm.

###  4. Decide on the Xero `sync-status` WIP files

**Effort: variable · Impact: 4 type errors disappear from local `tsc`**

These four files exist locally (untracked) at the root checkout:

```
app/api/integrations/xero/sync-status/route.ts        (101 lines)
lib/integrations/xero/sync-status.ts                  (216 lines, pure-logic state machine)
lib/integrations/xero/sync-status-runner.ts           (185 lines, Prisma wrapper)
lib/integrations/xero/__tests__/sync-status.test.ts   (202 lines, vitest unit tests)
```

Tagged `RA-1112`. Reference CLAUDE.md rules #7, #13 and Progress Framework principle #27.

They reference `prisma.xeroSyncStatus` which doesn't exist in `schema.prisma`. To complete:

1. Add a `XeroSyncStatus` Prisma model with these fields (inferred from `lib/integrations/xero/sync-status-runner.ts`):
   - `id String @id @default(cuid())`
   - `entityType String`
   - `entityId String`
   - `userId String` (FK to User)
   - `state` (enum: `queued` / `syncing` / `synced` / `failed` / `dead_letter`, or use `String` if you prefer flexibility)
   - `attemptCount Int @default(0)`
   - `lastAttemptAt DateTime?`
   - `lastError String? @db.Text`
   - `nextRetryAt DateTime?`
   - `xeroEntityId String?`
   - `createdAt DateTime @default(now())`
   - `updatedAt DateTime @updatedAt`
   - `@@unique([entityType, entityId])`
   - `@@index([state, nextRetryAt])` (for the retry scheduler)

2. `npx prisma migrate dev --name add_xero_sync_status`
3. `git add` the 4 untracked files plus `schema.prisma` plus the new migration
4. Open PR — add an integration test that exercises `runWithSyncStatus` against the test DB

OR delete the four files if the work is stale.

###  5. Lint backlog cleanup — multi-week initiative

**Effort: 2–4 weeks · Impact: enables flipping the lint gate to enforcing**

`pnpm lint` reports **20,784 errors + 52,728 warnings** (73,512 problems total). I attempted `pnpm lint --fix` autonomously and it did *unsafe* fixes (removed `// eslint-disable-next-line` directives that were intentionally suppressing `@ts-ignore` comments). **Don't run `--fix` blindly.**

Recommended phased approach:

**Phase A — Triage** (~1 day)
- Categorize all 20,784 errors by rule. The top 5–10 rules will cover ~80% of errors.
- Commands:
  ```bash
  pnpm lint --format json > /tmp/lint.json
  jq '[.[].messages[].ruleId] | group_by(.) | map({rule: .[0], count: length}) | sort_by(.count) | reverse' /tmp/lint.json | head -20
  ```
- Decide for each top rule: **fix** (write a targeted codemod / batch fix), **disable** (relax the rule in `eslint.config.mjs`), or **defer** (add to a new `tsc-baseline.json`-style ratchet).

**Phase B — Targeted batches** (~2 weeks, parallelisable)
- One PR per rule: e.g. "lint: fix all 4,200 `no-useless-escape` errors". Each PR is mechanical and reviewable in chunks.
- Run codemods (`jscodeshift`, `eslint --fix --rule "X"`) with manual review of a sample before commit.

**Phase C — Flip the gate** (~1 day)
- Once errors drop below ~50, update `.github/workflows/pr-checks.yml`:
  ```yaml
  - name: Lint
    run: pnpm lint
    # remove: continue-on-error: true
  ```
- Open as the final PR in the initiative.

**Don't try to do this as a single PR.** Smaller atomic mass-fix PRs are reviewable; one mega-PR is not.

---

## Quick verification (run after every merge)

```bash
# Verify prod is healthy
curl -ksS -w "\nHTTP %{http_code} | %{time_total}s\n" https://restoreassist.app/api/health

# Run prod smoke locally
pnpm test:smoke:prod

# Audit deps
pnpm audit --audit-level=high --prod

# Type-check
pnpm type-check
```

---

## Reference: deployed observability + monitoring

- **Sentry:** wired but inert until DSN set (see Task 1 above)
- **Vercel preview comments:** posts to every PR
- **Scheduled smoke:** `.github/workflows/smoke-prod.yml` — `cron: "*/15 * * * *"` against prod
- **CI gates** (`.github/workflows/pr-checks.yml`):
  - `Quality Checks` (TypeScript Check, Lint, Build, Prisma migration drift, Audit)
  - Build, TypeScript Check, Prisma migration drift = **enforcing**
  - Lint = `continue-on-error: true` until backlog cleared

---

## Architecture decisions made during this session

- **Sandbox-as-staging discipline restored.** Sandbox had drifted 66 commits behind main (team had been merging direct-to-main). Now sandbox is the integration branch; PRs target sandbox; sandbox cuts to main as bundled releases.
- **Three CI gates flipped to enforcing**, build + TypeScript + Prisma migration drift. A future PR can flip Lint once the backlog is cleared.
- **Cutover pattern:** `release: bundle ... sandbox → main` PRs. Each is a single squash that bundles all in-flight work. The `Vercel – restoreassist-sandbox` red X is documented-ignorable per `.claude/skills/pr-merge-ci-gate` (Vercel preview failures don't block — Quality Checks is the authoritative gate).
- **`/api/health` cached.** 10-second TTL on the DB probe. Cuts request volume to Supabase's connection pooler ~6× without sacrificing outage detection (still 10s worst-case lag).

---

*Generated 2026-05-06 by an autonomous Claude Code Opus 4.7 (1M context) session. 16 PRs landed, 4 prod cutovers, 9 CVEs patched, 15 type errors fixed, 2 CI gates flipped, scheduled prod smoke established. Production has been continuously healthy throughout.*
