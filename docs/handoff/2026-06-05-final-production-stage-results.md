# RestoreAssist Final Production Stage Results

Date: 2026-06-05
Repo: CleanExpo/RestoreAssist
Current main commit: `50d1e2bae1e9509cd3df819ce9504004dd986290`

## Final status

Status: PRODUCTION STAGES PASSED FOR CONTROLLED INTERNAL PILOT.

The video system PR #1224 and follow-up build hygiene PR #1225 are both merged. Current `main` deployed successfully to Vercel, post-merge production smoke passed, live production HTTP probes passed, and linked Supabase schema lint passed.

## Merged PRs

- #1224 `feat(video): ship advanced RestoreAssist video system`
  - Merge commit: `37f307b14d3ee76da449193fa98c7d24d1bd9339`
- #1225 `fix(build): exclude remotion config from app type-check`
  - Merge commit/current main: `50d1e2bae1e9509cd3df819ce9504004dd986290`

## GitHub/Vercel production status

Current main commit: `50d1e2bae1e9509cd3df819ce9504004dd986290`

GitHub workflows on current main:

- DESIGN.md lint: success
- Deployment Parity Check: success
- Lighthouse Agentic Browsing: success

Vercel commit statuses:

- `Vercel – restoreassist`: success, deployment completed
- `Vercel – restoreassist-sandbox`: success, deployment completed

## Production smoke

Manual post-#1225 production smoke was dispatched against current `main`.

- Run: https://github.com/CleanExpo/RestoreAssist/actions/runs/26987739014
- Head SHA: `50d1e2bae1e9509cd3df819ce9504004dd986290`
- Status: completed
- Conclusion: success
- Job: `Smoke against prod`: success
- Step `Run @smoke against prod`: success

## Live production HTTP probes

Production domain: https://restoreassist.app

Observed:

- `https://restoreassist.app/` -> 200, HTML
- `https://restoreassist.app/login` -> 200, HTML
- `https://restoreassist.app/dashboard/learn` -> 200 after redirect to `/login?callbackUrl=%2Fdashboard%2Flearn`, expected without auth
- `https://restoreassist.app/dashboard/admin/video-analytics` -> 200 after redirect to `/login?callbackUrl=%2Fdashboard%2Fadmin%2Fvideo-analytics`, expected without auth
- `https://restoreassist.app/api/video/analytics` -> 401 JSON, expected without auth
- `https://restoreassist.app/videos/captions/tutorial-login.vtt` -> 200, `text/vtt`

## Supabase / RLS / schema gate

Target project:

- Supabase project ref: `udooysjajglluvuxkijp`
- Project name from CLI list: `restoreassist-prod-2026`
- Region: Oceania/Sydney

Executed:

- `supabase link --project-ref udooysjajglluvuxkijp --yes`: success
- `supabase db lint --linked --level warning --fail-on none`: success
- Result: `No schema errors found`

Repo migration evidence:

- Supabase migration files: 9
- Files enabling RLS: 4
- Files creating policies: 6
- Files disabling RLS: 0
- `video_engagement` migration has RLS enabled: yes
- `video_engagement` policies:
  - `video_engagement_select_own`
  - `video_engagement_insert_own`
  - `video_engagement_admin_all`

Direct per-table `pg_class.relrowsecurity` snapshot:

- Attempted via Supabase linked pooler URL.
- Blocked because the pooler URL requires the DB password and the local environment does not expose `DATABASE_URL`, `DIRECT_URL`, or `SUPABASE_SERVICE_ROLE_KEY` values.
- `NEXT_PUBLIC_SUPABASE_URL` and anon key are present, but those are insufficient for a privileged table-state audit.
- Supabase schema dump route was also attempted and blocked because Supabase CLI requires Docker for `db dump`, and Docker is not installed/running on this machine.

Interpretation:

- The available production-linked evidence is clean enough for controlled internal pilot.
- Before broad external/customer rollout, run the direct RLS table-state SQL in Supabase SQL Editor or an approved secure DB shell and archive the result.

Required direct SQL for final broad rollout:

```sql
with user_tables as (
  select n.nspname, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind='r'
    and n.nspname='public'
    and c.relname not like '_prisma_%'
)
select
  count(*) as total_public_tables,
  count(*) filter (where relrowsecurity) as rls_enabled,
  count(*) filter (where not relrowsecurity) as rls_disabled,
  coalesce(json_agg(relname order by relname) filter (where not relrowsecurity), '[]'::json) as disabled_tables
from user_tables;
```

Acceptance for broad rollout:

- `rls_disabled = 0`, or every disabled table is documented as intentionally safe and non-client-exposed.

## Go / no-go

Controlled internal pilot: GO.

Broader external pilot/customer rollout: CONDITIONAL GO after one remaining secure DB-table RLS snapshot is captured.

## Recommended next execution stage

1. Run authenticated user/admin smoke with real test accounts:
   - `/dashboard/learn`
   - `/dashboard/admin/video-analytics`
   - How-To dropdown video playback
2. Capture the direct RLS table-state SQL result from Supabase SQL Editor.
3. If both pass, move from controlled internal pilot to external pilot readiness.
