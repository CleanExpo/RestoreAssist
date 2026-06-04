# Checkout State Report

Date: 2026-05-25

## Current Safe Checkout

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`
- latest commit: `7581df9e fix(api): retire runtime DDL paths`
- safe worktree expected: `/private/tmp/RestoreAssist-phase1-main`
- safe branch expected: `codex/phase-1-production-readiness-clean`
- is safe worktree: yes
- is safe branch: yes

## Initial Rejected Checkout

- pwd: `/Users/phillmcgurk/RestoreAssist`
- branch: `salvage/phase1-selected-useful-work-2026-05-25`
- status: unsafe for continuation; broad dirty tree reported there

No revert, reset, clean, stash, rebase, or merge was run.

## Dirty Summary

- total dirty tracked files before writing this report: 1
- total untracked files before writing this report: 0

## Dirty Files By Category

### Protected PR Template Case-Collision Artifact

- `.github/PULL_REQUEST_TEMPLATE.md`

Evidence:

- `git status --porcelain=v1` reports `M .github/PULL_REQUEST_TEMPLATE.md`.
- `ls -la .github` shows lowercase `.github/pull_request_template.md`.
- `git ls-files .github` tracks both `.github/PULL_REQUEST_TEMPLATE.md` and `.github/pull_request_template.md`.
- This matches a case-collision artifact on the local filesystem.

### Expected Committed Phase 1 Work

- None dirty.

Expected Phase 1 work appears committed in this checkout at latest commit `7581df9e`.

### Untracked Reports

- None.

### Unsafe Unexpected Churn

- None detected in the safe worktree before writing this report.

## Continuation Decision

Phase 1 can safely continue only from `/private/tmp/RestoreAssist-phase1-main` on `codex/phase-1-production-readiness-clean`.

Do not use `/Users/phillmcgurk/RestoreAssist` for this work. That checkout is unsafe due to broad dirty churn.

## Exact Next Safe Action

Resolve or explicitly quarantine the protected PR template case-collision artifact before any further Phase 1 commits, without touching application code. After that, continue Phase 1 only from `/private/tmp/RestoreAssist-phase1-main`.
