# Branch Recovery Report

Date: 2026-05-25

## Summary

RestoreAssist should not continue Phase 1 feature work from the current checkout. PR #1176 is still open and green, while the current branch is not descended from the Phase 0 PR head. Preserve the useful work, but move it onto a clean branch after Phase 0 is merged or explicitly selected as the base.

## Current Branch State

- Current branch: `pidev/pnpm-version-cleanup`
- Upstream: `origin/pidev/pnpm-version-cleanup`
- Current HEAD: `11b6d995 fix(ci): remove duplicate pnpm version from remaining 5 workflows`
- Base branch for current checkout: `main` / `origin/main`
- Local `main`: `7a1beccb chore(quick-wins): unite-group consolidation 2026-05-24 — RestoreAssist (#1171)`
- Phase 0 branch: `codex/phase-0-validation`
- Phase 0 HEAD: `f175d90f docs: finalize phase 0 ci result`
- Merge base of current HEAD and Phase 0: `922ef6ebd4aaf409ce39fb3a9b9ee6571bf00f97`
- Current branch descends from PR #1176: no

Command evidence:

```bash
git status --short --branch
git branch -vv
git merge-base --is-ancestor codex/phase-0-validation HEAD
git merge-base HEAD codex/phase-0-validation
```

## PR #1176 Status

Read-only GitHub check:

```bash
gh pr view 1176 --json number,state,mergedAt,mergeCommit,headRefName,baseRefName,url,statusCheckRollup
```

Result:

- PR: #1176
- URL: `https://github.com/CleanExpo/RestoreAssist/pull/1176`
- State: `OPEN`
- Merged at: `null`
- Merge commit: `null`
- Head: `codex/phase-0-validation`
- Base: `main`
- Checks: green
  - `Validate .claude/DESIGN.md`: success
  - `Quality Checks`: success
  - `CodeRabbit`: success
  - `Vercel – restoreassist`: success
  - `Vercel – restoreassist-sandbox`: success
  - `Vercel Preview Comments`: success

## Changed Files By Category

### Protected Unrelated Changes

Do not touch, reset, stage, or merge as part of Phase 1 recovery:

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.agents/skills/appshots/SKILL.md`

### Phase 0 / Production Docs

Useful context docs, but do not blend with production feature changes without review:

- `docs/production-grade-implementation/OVERNIGHT_GOAL.md`
- `docs/production-grade-implementation/BRANCH_RECOVERY_REPORT.md`

### Phase 1 Mobile Sync Changes

Useful work to keep, but should move onto a clean Phase 1 branch after Phase 0 baseline is resolved:

- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app/(tabs)/inspections/[id].tsx`
- `mobile/components/NetworkBanner.tsx`
- `mobile/components/SyncStatusBar.tsx`
- `mobile/lib/api/client.ts`
- `mobile/lib/store.ts`
- `mobile/lib/sync/engine.ts`
- `mobile/shared/types.ts`

Notes:

- Adds SQLite-backed offline mutation queue.
- Adds idempotency headers for queued JSON mutations.
- Adds sync status/queue counters.
- Adds replay recovery for stale `processing` rows.
- Root validation passed, but mobile package validation remains blocked because `mobile` is not installed as part of the root workspace.

### Billing Redirect Change

Useful low-risk change to keep, but should be cherry-picked separately for review:

- `app/dashboard/billing/page.tsx`

Purpose:

- Redirects `/dashboard/billing` to the existing `/dashboard/subscription` Stripe Customer Portal surface.

### Generated Reports

Useful session artifacts. Keep as documentation, but do not treat them as proof of ship readiness:

- `PHASE_1_PROGRESS_LOG.md`
- `PHASE_1_COMPLETION_REPORT.md`
- `PHASE_2_PROGRESS_LOG.md`
- `PHASE_2_COMPLETION_REPORT.md`
- `PHASE_3_PROGRESS_LOG.md`
- `FINAL_SHIPIT_READINESS_REPORT.md`

Key status from reports:

- RestoreAssist remains not ship-ready.
- Phase 1 is not complete.
- Phase 2 is deferred.
- Phase 3 is documentation/validation only.

### Unsafe / Unexpected Changes

Current status shows a large unexpected tracked-diff surface that must not be merged as part of Phase 1 recovery.

Count:

- `git diff --numstat | wc -l` reports 386 tracked changed files.

Pattern:

- Many changes are formatting-only table/quote/lockfile churn, for example:
  - `.claude/ARCHITECTURE.md`
  - `pnpm-lock.yaml`
- Many application, test, docs, vendor, and script files are also shown as modified.

Unsafe groups:

- `.agents/skills/*.md` except protected untracked `.agents/skills/appshots/`
- `.claude/**`
- `.github/workflows/deepsec-weekly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `MISSION_REPORTS/**`
- `app/api/**` except no Phase 1 recovery file should be taken from this group
- `app/auth/**`
- `app/billing/**`
- `app/dashboard/**` except `app/dashboard/billing/page.tsx`
- `app/help/**`
- `app/invite/**`
- `app/layout.tsx`
- `app/pricing/**`
- `app/privacy/**`
- `app/setup/**`
- `app/signup/**`
- `app/status/**`
- `components/**`
- `content/**`
- `distribution/**`
- `docs/**` except `docs/production-grade-implementation/**` and the existing required reports in the repo root
- `e2e/**`
- `lib/**`
- `middleware.ts`
- `pnpm-lock.yaml`
- `scripts/**`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `session_manifest.md`
- `types/**`
- `vendor/**`

Still unsafe to merge as-is:

- Current branch is not based on PR #1176.
- Protected unrelated changes are mixed into the working tree.
- 386 tracked files currently show unexpected modifications outside the useful Phase 1 recovery set.
- Mobile sync changes have not had mobile-package validation.
- Report files are untracked and should be intentionally placed or moved before PR.

## Work Safe To Keep

Safe to preserve for later review:

- Mobile offline/sync implementation files listed above.
- `/dashboard/billing` redirect.
- Phase reports and final readiness report.
- `OVERNIGHT_GOAL.md`.
- This recovery report.

## Work That Must Not Be Merged Yet

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.agents/skills/appshots/`
- Any Phase 1 mobile sync work until it is moved onto a clean branch descended from Phase 0 and validated with the mobile package.
- Any report that claims readiness. Current reports correctly say not ship-ready and can be kept as evidence.

## Recommended Recovery Path

Recommended path: merge PR #1176 first, then re-apply useful work onto a clean Phase 1 branch.

Rationale:

- PR #1176 is the green Phase 0 baseline.
- Current branch does not descend from it.
- A clean Phase 1 branch keeps production-readiness work reviewable and avoids mixing protected local changes with feature work.

Exact commands to run after PR #1176 is merged:

```bash
# 1. Preserve current mixed work before any cleanup.
git switch -c salvage/phase1-mobile-sync-and-reports-2026-05-25
git add \
  'mobile/app/(tabs)/_layout.tsx' \
  'mobile/app/(tabs)/inspections/[id].tsx' \
  mobile/components/NetworkBanner.tsx \
  mobile/components/SyncStatusBar.tsx \
  mobile/lib/api/client.ts \
  mobile/lib/store.ts \
  mobile/lib/sync/engine.ts \
  mobile/shared/types.ts \
  app/dashboard/billing/page.tsx \
  docs/production-grade-implementation/OVERNIGHT_GOAL.md \
  docs/production-grade-implementation/BRANCH_RECOVERY_REPORT.md \
  PHASE_1_PROGRESS_LOG.md PHASE_1_COMPLETION_REPORT.md \
  PHASE_2_PROGRESS_LOG.md PHASE_2_COMPLETION_REPORT.md \
  PHASE_3_PROGRESS_LOG.md FINAL_SHIPIT_READINESS_REPORT.md
git commit -m "chore(recovery): preserve phase 1 mobile sync and readiness reports"

# Confirm no unsafe broad paths were staged.
git diff --cached --name-only

# 2. Update local main after PR #1176 is merged.
git fetch origin
git switch main
git pull --ff-only origin main

# 3. Start a clean Phase 1 branch from the merged green baseline.
git switch -c codex/phase-1-production-readiness

# 4. Bring useful work back in small, reviewable chunks.
git cherry-pick -n salvage/phase1-mobile-sync-and-reports-2026-05-25

# 5. Before committing, unstage/remove anything unrelated or protected.
git restore --staged .github/PULL_REQUEST_TEMPLATE.md .agents/skills/appshots || true
git status --short

# 6. Split into separate commits if the patch is clean.
git add app/dashboard/billing
git commit -m "fix(billing): route dashboard billing to subscription portal"

git add mobile
git commit -m "feat(mobile): queue offline inspection field mutations"

git add docs/production-grade-implementation \
  PHASE_1_PROGRESS_LOG.md PHASE_1_COMPLETION_REPORT.md \
  PHASE_2_PROGRESS_LOG.md PHASE_2_COMPLETION_REPORT.md \
  PHASE_3_PROGRESS_LOG.md FINAL_SHIPIT_READINESS_REPORT.md
git commit -m "docs(readiness): record phase recovery and ship readiness status"
```

Alternative if PR #1176 cannot be merged immediately:

```bash
# Preserve current work only; do not continue feature work.
git switch -c salvage/phase1-mobile-sync-and-reports-2026-05-25
git add \
  'mobile/app/(tabs)/_layout.tsx' \
  'mobile/app/(tabs)/inspections/[id].tsx' \
  mobile/components/NetworkBanner.tsx \
  mobile/components/SyncStatusBar.tsx \
  mobile/lib/api/client.ts \
  mobile/lib/store.ts \
  mobile/lib/sync/engine.ts \
  mobile/shared/types.ts \
  app/dashboard/billing/page.tsx \
  docs/production-grade-implementation/OVERNIGHT_GOAL.md \
  docs/production-grade-implementation/BRANCH_RECOVERY_REPORT.md \
  PHASE_1_PROGRESS_LOG.md PHASE_1_COMPLETION_REPORT.md \
  PHASE_2_PROGRESS_LOG.md PHASE_2_COMPLETION_REPORT.md \
  PHASE_3_PROGRESS_LOG.md FINAL_SHIPIT_READINESS_REPORT.md
git commit -m "chore(recovery): preserve phase 1 mobile sync and readiness reports"

# Confirm no unsafe broad paths were staged.
git diff --cached --name-only

# Then wait for PR #1176 to merge before creating the real Phase 1 branch.
```

## Rollback Plan

No destructive rollback should be run from the current mixed checkout.

If recovery work has been committed to a salvage branch and needs to be undone before opening a PR:

```bash
git switch codex/phase-1-production-readiness
git log --oneline -5
git revert <bad_commit_sha>
```

If uncommitted recovery work is accidentally applied to a clean Phase 1 branch:

```bash
git status --short
git restore --staged <path>
git restore -- <path>
```

Only use `git restore` on paths that are confirmed unrelated to protected local changes.

## Next Safe Action

Stop feature work. Preserve the useful work on a salvage branch, merge PR #1176, then create `codex/phase-1-production-readiness` from updated `main` and re-apply the billing redirect, mobile sync changes, and reports as separate reviewable commits.
