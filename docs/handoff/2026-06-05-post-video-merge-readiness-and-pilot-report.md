# RestoreAssist Post-Video Merge Readiness and Pilot Report

Date: 2026-06-05
Repo: CleanExpo/RestoreAssist
Scope: post-merge verification after PR #1224 (`video-real-screenshots` -> `main`) and production-readiness/pilot next actions.

## Executive status

Status: READY FOR CONTROLLED INTERNAL PILOT, with one small build hygiene follow-up PR open.

PR #1224 successfully merged the advanced video system into `main` and production verification passed. The app is deployed on the live custom domain, video/caption assets are reachable, and the post-merge production smoke workflow passed.

A follow-up PR was opened for one local type-check hygiene issue discovered during post-merge readiness checks:

- PR #1225: https://github.com/CleanExpo/RestoreAssist/pull/1225
- Fix: exclude root `remotion.config.ts` from the app TypeScript project, matching the existing `remotion/**` exclusion.
- Reason: the app type-check should not fail on a Remotion CLI config module that is not part of the deployed Next app.

## Verified production evidence

### Merge/deployment

- PR #1224: https://github.com/CleanExpo/RestoreAssist/pull/1224
- Merge commit: `37f307b14d3ee76da449193fa98c7d24d1bd9339`
- Live production domain: https://restoreassist.app
- `restoreassist.com.au` currently resolves as NXDOMAIN from external DNS and should not be treated as the live production domain until DNS is configured.

### Post-merge workflows

Verified on the merge commit:

- DESIGN.md lint: success
- Deployment Parity Check: success
- Lighthouse Agentic Browsing: success
- Smoke — Production: success
  - Run: https://github.com/CleanExpo/RestoreAssist/actions/runs/26986941788

### HTTP smoke probes

Observed production behavior:

- `https://restoreassist.app/` -> 200
- `https://restoreassist.app/login` -> 200
- `https://restoreassist.app/dashboard/learn` -> redirects to login as expected without auth
- `https://restoreassist.app/dashboard/admin/video-analytics` -> redirects to login as expected without auth
- `https://restoreassist.app/api/video/analytics` -> 401 JSON as expected without auth
- `https://restoreassist.app/videos/captions/tutorial-login.vtt` -> 200

### Video registry and assets

Repo-level verification:

- 68 registered videos
- 62 Cloudinary CDN entries
- 0 YouTube embeds
- 60 caption files
- Video/caption CDN access was verified over HTTP for representative assets.

## Local quality gates run after merge

From `/Users/phillmcgurk/RestoreAssist-overnight` on post-merge `main` plus PR #1225 build-hygiene fix:

- `pnpm prisma:generate && pnpm type-check`: pass
- `pnpm build`: pass
- `npx vitest run`: pass
  - 244 test files passed
  - 1938 tests passed
  - 16 files / 81 tests skipped by suite config
- `bash .github/scripts/design-md-lint.sh`: pass
- `pnpm audit --audit-level=high --prod`: pass, no known vulnerabilities
- `supabase db lint --linked --level warning --fail-on none`: pass, no schema errors found

## Environment/security signals

### Vercel production env names

Verified production env names include expected platform/config keys:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_URL`
- `SYNTHEX_BASE_URL`
- `SYNTHEX_SERVICE_TOKEN`

Verified absent:

- `NODE_TLS_REJECT_UNAUTHORIZED`

Note: no secret values were printed or persisted during the audit.

### Supabase / RLS

Available CLI evidence:

- Supabase project list identifies RestoreAssist prod ref: `udooysjajglluvuxkijp` (`restoreassist-prod-2026`, Oceania/Sydney).
- `supabase link --project-ref udooysjajglluvuxkijp --yes` succeeded locally.
- `supabase db lint --linked --level warning --fail-on none` returned: `No schema errors found`.

Repo migration evidence:

- 9 Supabase migration files in `supabase/migrations`.
- 4 files contain `ENABLE ROW LEVEL SECURITY`.
- 6 files contain `CREATE POLICY`.
- No migrations contain `DISABLE ROW LEVEL SECURITY`.
- `supabase/migrations/20250604000000_video_engagement.sql` creates `public.video_engagement`, enables RLS, and defines:
  - own-user SELECT policy
  - own-user INSERT policy
  - admin/policy all-access policy
  - dashboard views for completion rates, drop-off funnel, and trending videos

Constraint: a raw per-table production RLS SQL query was not completed from this environment because Vercel env pull exposed the DB key names but did not provide usable DB URL values to the local process. Use Supabase dashboard SQL editor or a secure operator shell with the production DB URL to run the final per-table RLS snapshot before broader external pilot.

## Readiness decision

### Recommended status

Proceed with controlled internal pilot, not broad customer rollout yet.

Reason:

- The video system is merged, deployed, smoke-tested, and the app builds/tests cleanly with the small PR #1225 fix.
- Production env no longer shows the previously suspected unsafe TLS flag.
- Video analytics schema has RLS in migration form and Supabase linked lint is clean.
- Remaining gap is a direct production RLS table-state snapshot plus authenticated UI verification under real admin/user accounts.

## Immediate next actions

### A. Merge PR #1225 after checks pass

Purpose: keep `main` locally type-checkable after PR #1224.

PR: https://github.com/CleanExpo/RestoreAssist/pull/1225

Merge criteria:

- Quality Checks: success
- Vercel previews: success
- no unexpected CodeRabbit blocker

### B. Final secure production DB RLS snapshot

Run from a secure shell or Supabase SQL editor:

```sql
with user_tables as (
  select n.nspname, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname = 'public'
    and c.relname not like '_prisma_%'
)
select
  count(*) as total_public_tables,
  count(*) filter (where relrowsecurity) as rls_enabled,
  count(*) filter (where not relrowsecurity) as rls_disabled,
  coalesce(json_agg(relname order by relname) filter (where not relrowsecurity), '[]'::json) as disabled_tables
from user_tables;
```

Acceptance:

- `rls_disabled = 0`, or every disabled table is explicitly documented as safe/non-client exposed.

### C. Authenticated video UX smoke

Use a real admin/test account and verify:

1. `/dashboard/learn`
   - page loads after login
   - video cards render
   - playback works for at least 3 representative videos
   - captions are available where expected

2. `/dashboard/admin/video-analytics`
   - admin access works
   - unauthorised user cannot access
   - empty-state or event data renders without runtime errors

3. How-To dropdowns/help category pages
   - dropdown appears in target workflows
   - selected video opens/plays
   - no YouTube fallback is shown

### D. Pilot pack

Prepare a controlled pilot brief:

- What changed: advanced video learning/help system, Cloudinary CDN, captions, analytics events.
- Pilot audience: internal admin + 1-2 trusted users first.
- Success criteria:
  - users can find relevant help video in under 30 seconds
  - playback starts in under 2 seconds on normal broadband
  - no auth leakage in analytics endpoints
  - no console/runtime errors during normal video help flows
- Rollback plan:
  - hide/disable video entry points if UX issue appears
  - keep CDN assets intact
  - revert only UI wiring if needed, not the underlying migration unless data safety requires it

## Known non-blocking observations

- `restoreassist.com.au` is NXDOMAIN; use `restoreassist.app` until DNS is configured.
- Direct Vercel deployment URL is protected by Vercel auth and returns 401; custom domain is public and working.
- Build logs contain existing Next.js warnings:
  - `eslint` key in `next.config.mjs` is no longer supported by current Next version.
  - `middleware` convention is deprecated in favor of `proxy`.
- Help fixture frontmatter warning appears during build for `content/help/_fixtures/test-article.mdx`; build still succeeds.
- Some tests intentionally log provider-error fixture strings to stderr while asserting non-leaking responses; tests pass.
