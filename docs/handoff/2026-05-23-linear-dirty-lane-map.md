# RestoreAssist Linear + dirty repo lane map — 2026-05-22 22:48 UTC

## Scope

Kanban task `t_cae06971`: reconcile open Linear/RestoreAssist work with the current dirty repo and split the 50+ changed files into coherent review lanes. No code was edited in this pass; this file is the handoff artifact.

## Inputs read

- `CLAUDE.md`
- `.claude/PROGRESS.md`
- `docs/handoff/2026-05-23-autonomous-stabilisation-handoff.md`
- `D:\Hermes\wiki\index.md`
- `D:\Hermes\wiki\entities\unite-group-nexus.md`
- `MISSION_REPORTS/linear-issues-manual.md`
- `git status --short`, `git diff --stat`, `git diff --ignore-space-at-eol --stat`, `git diff -w --numstat`

## Linear status

Attempted to query Linear GraphQL using the live `LINEAR_API_KEY` environment variable. The key is present (`lin_...`, 48 chars) but Linear returned HTTP 401 Unauthorized for both:

1. team-key filtered RA open issues; and
2. broader RestoreAssist/title/description filtered open issues.

Conclusion: the local key appears invalid/revoked or not authorised for the `unite-group` workspace. Treat live Linear reconciliation as blocked until `LINEAR_API_KEY` is refreshed. Fallback local source is `MISSION_REPORTS/linear-issues-manual.md`, which lists six manually-fileable audit issues.

Fallback open-work signals from local docs:

1. P1 pricing copy drift — partial fix in repo, deploy required.
2. P2 status page SSR health fetch — fix in repo, deploy required.
3. P1 dashboard WCAG field labels — not addressed by current dirty tree except possibly client modal components need review.
4. P3 sample data CTA — not addressed by current dirty tree.
5. P1 iOS sign-in gated — likely already handled by recent merged commits; not part of dirty tree.
6. P3 activation telemetry — not addressed by current dirty tree.

## Repo state snapshot

Branch: `chore/cleanup-do-refs-and-prisma-pin`

Tracked dirty files: 59 modified.
Untracked files: 29.
Raw diff: 18,122 insertions / 18,125 deletions.
Whitespace-normalised diff (`--ignore-space-at-eol`): 287 insertions / 290 deletions.

Interpretation: most apparent churn is CRLF / whitespace noise. The actual semantic work is smaller and should be split surgically.

## Recommended commit / PR lanes

### Lane 1 — Safety + changed-file lint/test stabilisation

Purpose: land the low-risk hygiene already verified in the prior autonomous pass.

Files:

- `.gitignore`
- `app/api/create-checkout-session/route.ts`
- `app/api/observability/client-error/route.ts`
- `components/NIRTechnicianInputForm.tsx`
- `lib/invoices/pdf-generator.ts`
- `lib/generate-forensic-report-pdf.ts`
- `lib/integrations/xero/__tests__/sync-status.test.ts` only if Lane 2 is not split first; otherwise keep with Xero.

Why separate:

- `.gitignore` prevents `.hermes/` and `secret.txt` leakage.
- Lint fixes are small and already have targeted verification from the previous pass.
- This lane should not carry Xero schema/API or Nexus Hub product surface.

Verification:

- `pnpm exec eslint --quiet <lane files>`
- `pnpm type-check`
- if test file included: `npx vitest run lib/integrations/xero/__tests__/sync-status.test.ts`

Risk:

- `lib/generate-forensic-report-pdf.ts` has high raw churn from line endings. Stage hunks carefully or re-apply semantic edits on top of clean HEAD if review diff is noisy.

### Lane 2 — Xero sync-status lifecycle (RA-1112)

Purpose: make fire-and-forget Xero outbound sync visible and retryable without blocking user paths.

Files:

- `prisma/schema.prisma`
- `prisma/migrations/20260522225545_add_xero_sync_status/migration.sql`
- `app/api/integrations/xero/sync-status/route.ts`
- `lib/integrations/xero/sync-status.ts`
- `lib/integrations/xero/sync-status-runner.ts`
- `lib/integrations/xero/__tests__/sync-status.test.ts`
- possibly `.env.example` only if Xero lane needs env docs; current `.env.example` changes look Nexus/Hermes-specific and should usually stay in Lane 4.

Verification:

- `npx vitest run lib/integrations/xero/__tests__/sync-status.test.ts`
- `DIRECT_URL=<redacted-db-url> DATABASE_URL=<redacted-db-url> npx prisma validate`
- `pnpm type-check`
- targeted API review for auth/subscription/select/take rules.

Risks / review points:

- Confirm `@@unique([entityType, entityId])` is tenant-safe enough. If different users can sync the same provider entity id, uniqueness may need `userId` in the compound key.
- Confirm `lastError` is always sanitised before client exposure.
- Confirm route returns limited rows (`take`) and explicit `select` per CLAUDE.md rules.

### Lane 3 — Revenue / public trust fixes from overnight audit

Purpose: land customer-visible fixes aligned with the fallback Linear manual issues.

Files:

- `lib/pricing.ts`
- `app/pricing/page.tsx`
- `lib/__tests__/pricing-integrity.test.ts`
- `app/status/page.tsx`

Maps to Linear/manual issues:

- P1 pricing copy drift.
- P2 status page SSR health fetch.

Verification:

- `npx vitest run lib/__tests__/pricing-integrity.test.ts`
- `pnpm type-check`
- manually check `/pricing` and `/status` in dev or preview.

Risk:

- Ensure trial messaging (`30 trial credits`) remains distinct from free-tier report limit (`3`) to avoid reverting signup economics.

### Lane 4 — Nexus Hub / Mission Control / Margot context bridge

Purpose: keep group-operator surfaces separate from RestoreAssist product fixes and route through governance before external-facing exposure.

Files:

- `.env.example` (Hermes/Nexus env vars)
- `app/api/margot/chat/route.ts`
- `app/api/margot/hermes-proxy/route.ts`
- `app/api/mission-control/context/route.ts`
- `app/dashboard/mission-control/page.tsx`
- `lib/nexus-hub-context.ts`
- `content/nexus-hub/*`
- possibly `docs/handoff/*` and `MISSION_REPORTS/*` if they document this lane.

Verification:

- `pnpm type-check`
- route smoke tests for `/api/mission-control/context` and `/dashboard/mission-control`.
- Pi governance gate before any external-facing content or board-facing claims.

Risks:

- RestoreAssist is a sibling product, not the Nexus Hub. Keep language clear: Mission Control in RestoreAssist is a deep link/operator surface, not the group root.
- `.env.example` introduces local Hermes URLs; ensure no secrets and no production coupling.

### Lane 5 — Client management modal components

Purpose: isolate untracked dashboard client CRUD/modal UI work.

Files:

- `app/dashboard/clients/components/AddClientModal.tsx`
- `app/dashboard/clients/components/EditClientModal.tsx`
- `app/dashboard/clients/components/DeleteClientConfirm.tsx`
- `app/dashboard/clients/components/BulkDeleteConfirm.tsx`
- `app/dashboard/clients/components/ClientUpgradeModal.tsx`
- `app/dashboard/clients/components/types.ts`

Verification:

- `pnpm type-check`
- targeted lint on files.
- manual dashboard client flow smoke if route exists.

Risks:

- These are untracked and not obviously mapped to a current Linear issue from local fallback docs.
- Must audit for shadcn/ui usage and accessible labels before commit, because dashboard WCAG is a known P1 issue.

### Lane 6 — Dependency / security override maintenance

Purpose: split dependency lockfile changes from app feature changes.

Files:

- `package.json`
- `pnpm-lock.yaml`

Observed change:

- Adds `minimatch@3.1.5>brace-expansion: 1.1.12` override.
- Lockfile also removes many `libc` metadata entries, likely tooling/pnpm-version churn.

Verification:

- `pnpm install --lockfile-only` using the repo-approved pnpm version.
- `pnpm type-check`.
- security/advisory reason attached in commit body.

Risks:

- Lockfile metadata churn should not be bundled with feature work. If caused by a different pnpm version, regenerate under the project’s expected pnpm and keep only intentional changes.

### Lane 7 — Mechanical line-ending / CRLF quarantine

Purpose: prevent invisible whitespace churn from contaminating feature PRs.

Files with large raw churn but tiny semantic diff include:

- `components/NIRTechnicianInputForm.tsx`
- `lib/generate-forensic-report-pdf.ts`
- `lib/invoices/pdf-generator.ts`
- `app/api/reports/[id]/download/route.ts`
- `app/dashboard/inspections/[id]/capture/page.tsx`
- `app/dashboard/reports/new/page.tsx`
- several report/API/PDF files.

Action:

- Do not commit this as part of feature lanes.
- Either revert whitespace-only changes while preserving semantic hunks, or create one explicit mechanical line-ending PR after feature lanes land.

Verification:

- `git diff -w --check`
- `git diff --ignore-space-at-eol --stat`
- reviewer confirms no behaviour changes.

Risks:

- Highest review-risk lane. It can hide real changes and create merge pain.

### Lane 8 — Pilot tester / migration utility / audit scripts

Purpose: keep tooling and migration helpers separate from production app changes.

Files:

- `pilot-tester/src/images/source.ts`
- `pilot-tester/src/index.ts`
- `pilot-tester/src/runner/dry-run.ts`
- `pilot-tester/src/runner/orchestrator.ts`
- `migrate-older-restoreassist.bat`
- `scripts/overnight-audit-linear-push.mjs`
- `MISSION_REPORTS/2026-05-19-overnight-consumer-audit.md`
- `MISSION_REPORTS/linear-issues-manual.md`

Verification:

- targeted pilot tester command if defined.
- Node script dry-run with no Linear mutation unless valid key is available.

Risks:

- `migrate-older-restoreassist.bat` is Windows-specific and should be reviewed for destructive operations before inclusion.
- Linear script cannot be validated while `LINEAR_API_KEY` returns 401.

## Concrete next-lane order

1. Refresh/fix `LINEAR_API_KEY`, then rerun Linear GraphQL open issue query. This is the only hard blocker for live Linear reconciliation.
2. Lane 3: ship pricing/status revenue trust fixes first if they are still unmerged; they map directly to P1/P2 fallback issues and are small.
3. Lane 1: land safety + changed-file lint stabilisation, but avoid dragging Xero schema/API unless Lane 2 is ready.
4. Lane 2: review and land Xero sync-status as its own feature PR with migration and tests.
5. Lane 4: review Nexus Hub/Mission Control through group governance; do not mix with RestoreAssist product fixes.
6. Lane 5: audit client modal components for accessibility and route integration before staging.
7. Lane 6: regenerate/verify pnpm lock under approved pnpm and commit dependency override alone.
8. Lane 8: land scripts/reports/tooling only after deciding which artifacts are repo-worthy.
9. Lane 7: handle CRLF/whitespace as a quarantine/mechanical PR or revert noise while preserving semantic changes.

## Blockers

- Live Linear query blocked by HTTP 401 from Linear despite `LINEAR_API_KEY` being present.
- Current dirty tree contains enough line-ending churn to make naive staging unsafe.
- Some untracked components have no clear Linear mapping in local fallback docs.

## Recommendation

Do not commit the working tree wholesale. Use `git add -p` or reconstruct each lane from clean HEAD to prevent CRLF churn and unrelated work from entering the same PR. First executable move after key refresh is to reconcile live Linear; if the key remains unavailable, proceed with Lane 3 and Lane 1 because they map to documented customer-facing issues and prior verification.
