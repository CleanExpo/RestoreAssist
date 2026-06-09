---
name: deploy-drift-doctor
description: Diagnose and recover from blocked or failing production deploys — especially Prisma schema-drift / no-op'd-migration build failures on Vercel. Use when a deploy fails, a PR merge is "blocked", a build errors, or someone says "check logs", "failed", "deploy stuck", or "waiting for vercel".
automation: manual
intents: deploy, ci, prisma, incident, vercel
---

# Deploy Drift Doctor

A focused playbook for the failure class that took an entire session to untangle once:
**a production deploy that fails at a Prisma schema drift-check because the schema
declares columns/tables the production DB does not actually have.** It also covers the
adjacent "why is this PR merge blocked" questions (out-of-date branch, pending checks).

> Golden rule, learned the hard way: **adding a Prisma model or field to
> `schema.prisma` for a table/column that "an existing migration already created"
> can break every production deploy** — because that migration may have silently
> no-op'd and the table/column doesn't actually exist in prod. The drift-check only
> inspects models *present in the schema*, so declaring the model is what exposes
> (and trips) the failure.

---

## 1. When to reach for this

Trigger phrases / situations: "check logs", "failed", "deploy stuck", "waiting for
vercel", "merge blocked", a red PR check, a build erroring, profile/feature "fix didn't
take effect in prod". Especially after a PR that touched `prisma/schema.prisma`.

## 2. Diagnose — in order, cheapest first

```bash
# a) PR + merge state (BLOCKED vs failing check vs out-of-date branch)
gh pr view <N> --json state,mergeStateStatus,mergeable,reviewDecision
gh pr checks <N>

# b) Branch protection — strict:true means the branch must be up to date with main
gh api repos/<owner>/<repo>/branches/main/protection/required_status_checks
#   -> contexts/checks list the *required* checks; strict:true = "require up-to-date branch"

# c) Recent CI on main (are PRODUCTION deploys themselves failing?)
gh run list --branch main --limit 8

# d) Vercel deploy states (Building / Error / Ready / Queued)
vercel ls <project> --yes
# e) The actual build error for a failed deploy
vercel inspect <deployment-url> --logs 2>&1 | grep -iE 'error|fail|drift|prisma|migrate|exit code'
```

Interpretation:
- **`mergeable: MERGEABLE` + `BLOCKED`** with all checks green → the branch is **behind
  main** under `strict:true`. Fix: `gh pr update-branch <N>` (merges main into the PR
  branch; no conflicts = done).
- **`BLOCKED`** with a check still **pending** → a required check (often the Vercel
  deploy) hasn't finished. Wait/poll — but ALSO check (c)/(d): a *PR preview* deploy
  being slow is different from *production* deploys erroring.
- **Production deploys show `Error`** in `vercel ls` → this is the real incident; the PR
  is a red herring. Go to §3.

## 3. The drift-check signature (the big one)

In the failed **production** build log you'll see:

```
NNN migrations found in prisma/migrations
[drift-check] ✗ schema drift detected on 1 model(s):
<Model>: N missing — <col>, <col>, …
This means `prisma migrate deploy` reported success but the DDL never [applied]
Error: Command "pnpm run build" exited with 1
```

What it means (this repo): `scripts/build.sh` runs, on **production env only**
(`VERCEL_ENV` not preview/development), `prisma migrate deploy` **then**
`node scripts/check-schema-drift.mjs`. The drift-check parses every **scalar column**
of every **model in `schema.prisma`** and asserts it exists in
`information_schema.columns`. If the schema declares a column the DB lacks → exit 1 →
**build fails → no production deploy.** (It checks scalar columns only — not enums,
relations, or indexes — and tolerates extra-in-DB columns.)

**Root cause:** a migration row in `_prisma_migrations` is marked finished while its DDL
silently no-op'd (pooler/transaction quirk, manual drop, restore from an older snapshot,
etc.). The table/column is "migrated" on paper but absent in reality. As long as
`schema.prisma` didn't *declare* it, the drift-check never looked — so a PR that adds the
model/field is what surfaces the latent gap.

**Consequence to call out loudly:** if production deploys have been failing for a while,
then **every merge since the breaking PR is NOT live.** Re-measure/verify on prod with
that in mind (a "fix" that "didn't work in prod" may simply never have deployed).

## 4. Fix — two paths

### A. Revert to unblock (DEFAULT incident response)
Remove the offending model/field from `schema.prisma`. The drift-check stops inspecting
it → production deploys resume → the whole backlog of stuck merges goes live.

- **Zero downside when the breaking change never deployed** (prod already lacks it).
- The dependent route usually still compiles if it used `(prisma as any).<model>` — it
  just returns its prior runtime error. No regression vs. what's actually live.
- Verify locally: `npx prisma generate` (valid schema) + `tsc --noEmit` (routes compile).
- Ship as a small schema-only PR. Then production is healthy again.

### B. Fix forward (COMPLETE — needs authorization)
Actually create the missing table/column in production, then re-add the model to schema:
- Write an **idempotent** migration (`CREATE TABLE/TYPE/INDEX IF NOT EXISTS`,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) matching the schema exactly.
- Apply it to prod (it runs via `migrate deploy` on next deploy, or apply directly with
  authorization), confirm the table/columns exist, then re-add the model to `schema.prisma`.
- Re-run the drift-check logic to confirm 0 drift.

Default to **A now, B later**: restore deployability first, fix the data layer with care.

## 5. Hard safety rules

1. **NEVER read or mutate the production database without explicit user authorization.**
   "Check logs" / "fix the deploy" does **not** grant prod DB access. Build logs +
   `gh`/`vercel` CLIs are enough to diagnose drift. If you genuinely need prod state,
   STOP and ask.
2. **Reverting your own breaking change is the correct, safe incident response** — it's a
   code PR, reversible, and (if the change never deployed) has no live-site impact.
3. **Before adding a Prisma model/field for an "already-migrated" table/column, VERIFY it
   exists in prod first.** If you can't (no authorization), expect — and pre-empt — a
   drift-check failure: prefer an idempotent forward migration in the same PR, or hold the
   schema declaration until the table is confirmed.
4. **Edit `schema.prisma` surgically — never run `prisma format`** (it reformats the whole
   7k-line file and buries your change in noise).
5. **Stage only your files** (`git add <paths>`; verify with `git diff --cached --stat`).
   This repo's working tree carries ~580 unrelated formatter-modified files.
6. Branch protection is `strict:true` → **update the branch before merge**
   (`gh pr update-branch`).
7. Watch for the **same class on the next PR**: any other PR adding a model/field
   (e.g. `User.experienceMode`) can drift the same way if its column also no-op'd. Check
   before merging.

## 6. Prevention checklist (when authoring a schema PR)

- [ ] Does the column/table this model declares **actually exist in prod** (not just "a
      migration exists")? If unsure and unauthorized to check, ship an idempotent forward
      migration alongside the schema change.
- [ ] Is the change **additive and idempotent** (`IF NOT EXISTS`, no destructive `ALTER`)?
- [ ] Did `npx prisma generate` + `tsc --noEmit` pass locally?
- [ ] Staged **only** the intended files?
- [ ] Branch up to date with `main`?

## 7. Repo-specific reference (RestoreAssist)

- `scripts/build.sh` — runs `prisma migrate deploy` + `scripts/check-schema-drift.mjs`
  **only when `VERCEL_ENV` is production** (preview/dev skip it; that's why a PR's preview
  deploy can be green while the production deploy fails on merge).
- `scripts/check-schema-drift.mjs` — scalar-column drift only; reads `DIRECT_URL` then
  `DATABASE_URL`; exit 1 on any schema-declared column missing in the DB.
- `postinstall` and `build.sh` both run `prisma generate`, so a schema change deploys its
  client automatically — but a **table/column that doesn't exist** still trips the drift-check.
- Prod DB is a Supabase project; do not touch it without authorization.

> This skill exists because PR #1243 (adding the `InsurerProfile` model) silently broke
> every production deploy via this exact mechanism, masking the #1246 perf fix. The
> recovery was PR #1250 (revert the schema model). Recognize it in minutes next time.
