# RestoreAssist Controlled Internal Pilot Execution Packet

Date: 2026-06-05
Repo: CleanExpo/RestoreAssist
Production domain: https://restoreassist.app
PR #1226 merge commit: `1824bfc5850e00a1d5080c5f627a70b364ae57b9`
Latest verified main commit after follow-up RLS/evidence PRs: `40bd479901732656b12980471e65082944012d5c`
Status: GO for controlled internal pilot.

## 1. Current production evidence

PR #1226 is merged:

- PR: https://github.com/CleanExpo/RestoreAssist/pull/1226
- Title: `docs(readiness): record final production stage results`
- Merge commit: `1824bfc5850e00a1d5080c5f627a70b364ae57b9`
- Base: `main`

Post-merge checks on the PR #1226 merge commit:

- DESIGN.md lint: success
  - https://github.com/CleanExpo/RestoreAssist/actions/runs/26988101094
- Deployment Parity Check: success
  - https://github.com/CleanExpo/RestoreAssist/actions/runs/26988101077
- Lighthouse Agentic Browsing: success
  - https://github.com/CleanExpo/RestoreAssist/actions/runs/26988101102
- Vercel production status: success
- Vercel sandbox status: success

Fresh post-#1226 production smoke:

- Workflow: Smoke — Production
- Run: https://github.com/CleanExpo/RestoreAssist/actions/runs/26989726449
- Head SHA: `1824bfc5850e00a1d5080c5f627a70b364ae57b9`
- Result: success
- Job: `Smoke against prod`: success
- Step: `Run @smoke against prod`: success

Live unauthenticated HTTP probes after PR #1226:

- `https://restoreassist.app/` -> 200 HTML
- `https://restoreassist.app/login` -> 200 HTML
- `https://restoreassist.app/dashboard/learn` -> 200 login page after expected auth redirect
- `https://restoreassist.app/dashboard/admin/video-analytics` -> 200 login page after expected auth redirect
- `https://restoreassist.app/api/video/analytics` -> 401 JSON as expected without auth
- `https://restoreassist.app/videos/captions/tutorial-login.vtt` -> 200 `text/vtt`

## 2. Pilot objective

Run a narrow internal pilot to prove the advanced video help system is usable, safe, and operational before any broader external/customer rollout.

The pilot is not a marketing launch. It is a controlled production validation loop.

Primary questions to answer:

1. Can an authenticated user find relevant help video content quickly?
2. Does video playback start reliably and feel fast on normal devices/connections?
3. Do captions and fallback behavior work well enough for accessibility?
4. Do analytics endpoints remain protected and avoid leaking data?
5. Does the admin analytics surface load without runtime errors?
6. Is there any customer-facing confusion or broken help path that should block broader rollout?

## 3. Pilot audience

Recommended first wave:

- 1 internal admin/operator account.
- 1 internal non-admin/test user account.
- Optional: 1 trusted internal stakeholder who can behave like a customer but is not an external rollout audience.

Do not invite broader customers until the direct production RLS table-state snapshot and authenticated smoke are complete.

## 4. Pilot scope

In scope:

- `/dashboard/learn`
- How-To dropdowns / contextual help entry points
- 3-5 representative video plays
- Captions for representative videos
- Video engagement tracking flow
- Admin video analytics page
- Auth boundary checks around analytics/API routes

Out of scope:

- Broad customer rollout
- Billing changes
- Production DB writes outside normal app interactions
- New vendors or third-party connector platforms
- Marketing announcements
- Client-facing communications without explicit approval

## 5. Test matrix

### A. Authenticated standard user smoke

Account type: normal authenticated user.

Steps:

1. Log in at `https://restoreassist.app/login`.
2. Open `/dashboard/learn`.
3. Confirm page renders without a blank state or runtime error.
4. Search for at least one tutorial by keyword.
5. Play three representative videos:
   - login / getting started tutorial
   - inspection or report workflow tutorial
   - one deeper feature video
6. Confirm each selected video:
   - opens successfully
   - starts playback
   - has working controls
   - does not show a YouTube iframe fallback
   - has captions where expected
7. Navigate to a workflow page with a How-To dropdown.
8. Open the dropdown and play one contextual help video.
9. Confirm no visible auth errors, 500 pages, or broken assets.

Pass criteria:

- User can find a relevant video in under 30 seconds.
- Video playback starts in under 2 seconds on normal broadband.
- No blank video cards on the Learn page.
- No YouTube fallback shown.
- No visible console/runtime error to the user.

### B. Authenticated admin smoke

Account type: admin/operator.

Steps:

1. Log in as admin.
2. Open `/dashboard/admin/video-analytics`.
3. Confirm the page loads.
4. Switch period filters if present: 7d / 30d / 90d.
5. Confirm empty-state or event data renders cleanly.
6. Confirm recent pilot video interactions appear if the analytics pipeline has propagated them.

Pass criteria:

- Admin page does not 500.
- Admin can view analytics state.
- Period/filter controls do not crash the page.
- Empty state is acceptable; runtime failure is not.

### C. Unauthorized boundary smoke

Account type: logged-out and normal non-admin user.

Steps:

1. Logged out: open `/dashboard/admin/video-analytics`.
2. Confirm redirect to login.
3. Logged in as non-admin: attempt `/dashboard/admin/video-analytics`.
4. Confirm access is denied or safely redirected.
5. Logged out: request `/api/video/analytics`.
6. Confirm 401 JSON.

Pass criteria:

- No analytics data exposed to logged-out users.
- No admin data exposed to non-admin users.
- API returns 401/403-style safe responses, not raw stack traces.

## 6. Evidence to capture

For the pilot archive, capture:

- Date/time of test.
- Account type used: admin or user. Do not store passwords.
- Browser/device used.
- Tested URL(s).
- Video slugs tested.
- Playback result.
- Caption result.
- Any visible error or friction.
- Screenshots only if they contain no secrets, customer PII, or private records.

Suggested result table:

| Area | URL / video | Account type | Result | Notes |
| --- | --- | --- | --- | --- |
| Learn page | `/dashboard/learn` | user | PASS/FAIL | |
| Video playback | `tutorial-login` | user | PASS/FAIL | |
| Captions | `tutorial-login.vtt` | user | PASS/FAIL | |
| How-To dropdown | workflow page | user | PASS/FAIL | |
| Admin analytics | `/dashboard/admin/video-analytics` | admin | PASS/FAIL | |
| Non-admin guard | `/dashboard/admin/video-analytics` | user | PASS/FAIL | |
| API guard | `/api/video/analytics` | logged out | PASS/FAIL | |

## 7. Remaining broad-rollout gate

Before broader external/customer rollout, the direct production table-state RLS snapshot has now passed. The final result is documented in `docs/handoff/2026-06-05-rls-and-pilot-gate-results.md`:

- `total_public_tables`: 203
- `rls_enabled`: 203
- `rls_disabled`: 0
- `disabled_tables`: `[]`

The remaining external-rollout gate is authenticated production smoke with approved standard-user and admin/operator credentials.

## 8. Rollback / containment plan

If the pilot finds a blocking issue:

### UX-only issue

Examples: confusing placement, slow video, broken dropdown.

Action:

- Hide or reduce the affected video entry point.
- Keep CDN assets and database migration intact.
- Ship a small UI-only fix PR.

### Video asset issue

Examples: wrong video, missing captions, broken Cloudinary URL.

Action:

- Replace or update the registry entry.
- Keep the rest of the video system live.
- Verify with direct asset HTTP probes.

### Analytics/auth issue

Examples: non-admin can access admin analytics, API leaks data.

Action:

- Treat as a release blocker.
- Disable/hide admin analytics UI if needed.
- Patch API auth/RLS before broad rollout.
- Re-run authenticated and unauthenticated smoke.

### Production availability issue

Examples: 500 on Learn page, production smoke fails.

Action:

- Stop pilot expansion.
- Open a small hotfix PR from current `origin/main`.
- Verify with `pnpm type-check`, `pnpm build`, targeted tests, production smoke, and HTTP probes before resuming.

## 9. Go/no-go after pilot

Controlled internal pilot can proceed now.

Move to broader external pilot only when all are true:

- Standard user smoke passed.
- Admin analytics smoke passed or analytics is explicitly disabled from external pilot scope.
- Unauthorized boundary smoke passed.
- Direct production RLS table-state snapshot passed; see `docs/handoff/2026-06-05-rls-and-pilot-gate-results.md`.
- No production smoke/check failures on current `main`.
- Any pilot friction is triaged as non-blocking or fixed.

## 10. Commands used for current evidence

```bash
cd /Users/phillmcgurk/RestoreAssist-overnight

gh pr view 1226 --json number,title,url,state,mergedAt,mergeCommit,baseRefName,headRefName,headRefOid

git fetch origin main --prune
git log --oneline -5 origin/main

gh run list --commit 1824bfc5850e00a1d5080c5f627a70b364ae57b9 --limit 20 --json databaseId,workflowName,status,conclusion,createdAt,url,headSha

gh api repos/CleanExpo/RestoreAssist/commits/1824bfc5850e00a1d5080c5f627a70b364ae57b9/status --jq '{state: .state, statuses: [.statuses[] | {context, state, description, target_url}]}'

gh workflow run 'Smoke — Production' --ref main
gh run view 26989726449 --json status,conclusion,url,headSha,jobs

for url in \
  https://restoreassist.app/ \
  https://restoreassist.app/login \
  https://restoreassist.app/dashboard/learn \
  https://restoreassist.app/dashboard/admin/video-analytics \
  https://restoreassist.app/api/video/analytics \
  https://restoreassist.app/videos/captions/tutorial-login.vtt; do
  echo "$url"
  curl -sL -o /tmp/ra_probe -w '  %{http_code} %{content_type} %{size_download} %{url_effective}\n' -m 25 "$url"
done
```
