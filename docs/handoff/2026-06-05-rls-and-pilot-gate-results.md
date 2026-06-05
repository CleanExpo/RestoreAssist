# RestoreAssist RLS and Pilot Gate Results

Date: 2026-06-05
Repo: CleanExpo/RestoreAssist
Current main commit at time of RLS remediation: `4580ecba5c5cfda45423d40227d3bb035c42fd60`
Latest verified main after this evidence packet merged: `40bd479901732656b12980471e65082944012d5c`
Status: RLS broad-rollout gate passed; authenticated pilot smoke still needs approved credentials.

## Summary

The remaining direct production RLS table-state snapshot was completed through the Supabase linked Management API.

Initial result before fix:

- `total_public_tables`: 203
- `rls_enabled`: 197
- `rls_disabled`: 6
- `disabled_tables`:
  - `ClientMutation`
  - `FieldCaptureEvent`
  - `IdempotencyRecord`
  - `RateLimitHit`
  - `VoiceCopilotObservation`
  - `VoiceCopilotSession`

A small security migration PR enabled RLS on those six operational/server-owned tables.

- PR: https://github.com/CleanExpo/RestoreAssist/pull/1229
- Merge commit: `4580ecba5c5cfda45423d40227d3bb035c42fd60`

Final result after deploy:

- `total_public_tables`: 203
- `rls_enabled`: 203
- `rls_disabled`: 0
- `disabled_tables`: `[]`

This clears the direct production RLS table-state gate.

## Production verification after PR #1229

Main branch checks on commit `4580ecba5c5cfda45423d40227d3bb035c42fd60`:

- DESIGN.md lint: success
- Deployment Parity Check: success
- Lighthouse Agentic Browsing: success
- Vercel production deployment: success
- Vercel sandbox deployment: success

Fresh production smoke:

- Workflow: Smoke — Production
- Run: https://github.com/CleanExpo/RestoreAssist/actions/runs/26990805404
- Head SHA: `4580ecba5c5cfda45423d40227d3bb035c42fd60`
- Result: success
- Job `Smoke against prod`: success
- Step `Run @smoke against prod`: success

Live unauthenticated HTTP probes after PR #1229:

- `https://restoreassist.app/` -> 200 HTML
- `https://restoreassist.app/login` -> 200 HTML
- `https://restoreassist.app/dashboard/learn` -> 200 login page after expected auth redirect
- `https://restoreassist.app/dashboard/admin/video-analytics` -> 200 login page after expected auth redirect
- `https://restoreassist.app/api/video/analytics` -> 401 JSON as expected without auth
- `https://restoreassist.app/videos/captions/tutorial-login.vtt` -> 200 `text/vtt`

## Authenticated pilot smoke status

Attempted with existing repo default E2E credentials only:

- Email used: `test@restoreassist.app`
- Password source: repo default from `e2e/auth.setup.ts`; no secret was printed or stored.
- Result: login did not redirect to `/dashboard` within 15 seconds.

Observed login page diagnostics:

- `/login` rendered correctly.
- `/api/auth/session`, `/api/auth/providers`, and `/api/auth/csrf` returned 200.
- The default E2E user did not produce an authenticated session on production.

No approved production admin/test password was available in the local environment. The documented Play Store reviewer credential requires a password from 1Password / approved operator store, which this environment does not expose.

Therefore authenticated pilot smoke remains pending until an approved admin/test credential is supplied or an operator runs it manually.

## Current go/no-go

Controlled internal pilot: GO.

Broader external/customer rollout: CONDITIONAL GO. The RLS blocker is cleared; the remaining blocker is authenticated user/admin smoke with approved production test credentials.

Move to broader external pilot only after:

1. Standard user smoke passes on `/dashboard/learn` and representative video playback.
2. Admin/operator smoke passes on `/dashboard/admin/video-analytics`, or analytics is explicitly excluded/hidden from the external pilot.
3. Non-admin/admin-boundary smoke confirms analytics remains protected.
4. No production smoke/check failures appear on current `main`.

## Commands/evidence used

```bash
supabase db query --linked --output json "with user_tables as (...) select ..."

gh pr view 1229 --json state,mergedAt,mergeCommit,url

gh run list --commit 4580ecba5c5cfda45423d40227d3bb035c42fd60 --limit 10 --json databaseId,workflowName,status,conclusion,createdAt,url,headSha

gh api repos/CleanExpo/RestoreAssist/commits/4580ecba5c5cfda45423d40227d3bb035c42fd60/status --jq '{state: .state, statuses: [.statuses[] | {context, state, description, target_url}]}'

gh workflow run 'Smoke — Production' --ref main

gh run view 26990805404 --json status,conclusion,url,headSha,jobs

for url in \
  https://restoreassist.app/ \
  https://restoreassist.app/login \
  https://restoreassist.app/dashboard/learn \
  https://restoreassist.app/dashboard/admin/video-analytics \
  https://restoreassist.app/api/video/analytics \
  https://restoreassist.app/videos/captions/tutorial-login.vtt; do
  curl -sL -o /tmp/ra_probe3 -w '  %{http_code} %{content_type} %{size_download} %{url_effective}\n' -m 25 "$url"
done
```
