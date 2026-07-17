# Phase 5 — Production Migration Runbook

**Owner:** Phill McGurk
**Created:** 2026-04-26
**Linked Linear:** RA-1706 (parent — closed) → Phase 5 cutover ticket (created separately)
**Pilots:** Beyond Clean / Elite / CRSA

This is the step-by-step runbook for taking the V1 ship-week stack from
`main` to production. It is intentionally written so a single operator
(Phill) can follow it cold without referring back to the earlier audit
docs.

> **Hard rule — no production migration runs from this runbook.** This
> document is the _checklist_. The actual `prisma migrate deploy`
> against prod must be run by Phill in his terminal with prod
> `DATABASE_URL` exported. Claude is authorised to prepare commands and
> mark non-production steps complete; nothing else.

---

## 0. Pre-flight (read once, do once)

| #   | Item                                                                         | Command / where                                                                                                                                                                                 | Done? |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 0.1 | Confirm `main` HEAD matches expectation                                      | `git log origin/main --oneline -1` → expected at time of writing `0dd11c2`; actual on 2026-04-28 was `d3f3ca8a` after follow-on PRs (#822, #835, #836, #837, #821) — re-confirm before each run | [ ]     |
| 0.2 | Confirm 7 new migrations present in `prisma/migrations/`                     | `ls prisma/migrations \| grep 20260426 \| wc -l` → 7                                                                                                                                            | [ ]     |
| 0.3 | Confirm Vercel sandbox deploy is green for `main`                            | https://vercel.com/unite-group/restoreassist-sandbox                                                                                                                                            | [ ]     |
| 0.4 | Confirm pilot smoke test passes locally on the deployed sandbox              | `BASE_URL=https://restoreassist-sandbox.vercel.app npx playwright test e2e/pilot-workflow.spec.ts`                                                                                              | [ ]     |
| 0.5 | Confirm Vercel observability project is live (Logs + Speed Insights enabled) | https://vercel.com/unite-group/restoreassist (Observability tab)                                                                                                                                | [ ]     |

> [WARN] If 0.4 fails on sandbox, **stop**. Do not migrate prod against a
> broken deploy.

---

## 1. The 7 new migrations

These are the migrations introduced this ship-week. All ran clean
against the dev DB during PR CI. They will all run together in step 3.

```text
20260426010000_ra_1392_m17_progress_telemetry
20260426020000_ra_1389_m14_gate_policy
20260426030000_ra_1388_m13_labour_hire
20260426040000_ra_1390_m15_override_governance
20260426050000_ra_1707_workspace_ai_budget
20260426060000_ra_1708_consent_tokens
20260426070000_ra_1717_assessment_generations
```

The newest one (`20260426070000_ra_1717_assessment_generations`) creates
a single new `AssessmentGeneration` table with three indexes. No
backfills. No destructive ALTERs across this batch.

---

## 2. Shadow-DB verification (REQUIRED before prod)

Use a Supabase branch or a local Postgres.

```bash
# In a fresh shell with SHADOW_DB pointed at a Supabase preview branch
# OR a disposable local Postgres:
export DATABASE_URL="$SHADOW_DATABASE_URL"

cd /Users/phill-mac/pi-seo-workspace/RestoreAssist
npx prisma migrate deploy 2>&1 | tee /tmp/phase-5-shadow.log

# Verify:
grep -E "Applying migration|All migrations have been successfully applied" \
  /tmp/phase-5-shadow.log
```

| #   | Item                                                                                                           | Done? |
| --- | -------------------------------------------------------------------------------------------------------------- | ----- |
| 2.1 | Shadow `migrate deploy` exits 0                                                                                | [ ]     |
| 2.2 | Log shows all 7 new migrations applied                                                                         | [ ]     |
| 2.3 | `psql $SHADOW_DATABASE_URL -c '\d "AssessmentGeneration"'` shows the new table + 3 indexes                     | [ ]     |
| 2.4 | `psql $SHADOW_DATABASE_URL -c '\d "Workspace"' \| grep aiDailyBudgetUsd` (RA-1707 — column add, not new table) | [ ]     |
| 2.5 | `psql $SHADOW_DATABASE_URL -c '\d "AttestationConsentToken"'` (RA-1708)                                        | [ ]     |

If anything in §2 fails, fix on a branch, push a new PR, do not proceed.

---

## 3. Production migration

> [WARN] **Phill executes. Claude does not.**

```bash
# 1. Snapshot the prod DB before any change.
#    Supabase: Database → Backups → "Create new backup".
#    Verify the backup landed before continuing.

# 2. Export prod credentials in a fresh shell. Do NOT `source .env.local`
#    — that is sandbox.
export DATABASE_URL="$RESTOREASSIST_PROD_DB_URL"

# 3. Run the migration.
cd /Users/phill-mac/pi-seo-workspace/RestoreAssist
npx prisma migrate deploy 2>&1 | tee /tmp/phase-5-prod.log

# 4. Quick smoke on the schema:
psql "$DATABASE_URL" -c '\dt "AssessmentGeneration"'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "AssessmentGeneration";'  # expect 0
```

| #   | Item                                                                       | Done? |
| --- | -------------------------------------------------------------------------- | ----- |
| 3.1 | Prod backup verified (timestamp recorded)                                  | [ ]     |
| 3.2 | `npx prisma migrate deploy` exits 0                                        | [ ]     |
| 3.3 | All 7 new migrations marked applied in `_prisma_migrations`                | [ ]     |
| 3.4 | New tables exist + are empty                                               | [ ]     |
| 3.5 | Save `/tmp/phase-5-prod.log` to the Phase 5 Linear ticket as an attachment | [ ]     |

---

## 4. Vercel production promote

Per saved memory `feedback_vercel_env_redeploy.md`: **uncheck "Use existing Build Cache"**
when redeploying after env changes.

```text
1. Vercel dashboard → restoreassist (production project)
2. Deployments → find the latest commit on main (0dd11c2 …)
3. "..." menu → "Redeploy"
4. UNCHECK "Use existing Build Cache"  ← critical
5. Click "Redeploy"
6. Wait for build + deploy to complete
```

| #   | Item                                | Done? |
| --- | ----------------------------------- | ----- |
| 4.1 | Promoted deploy from `main` HEAD    | [ ]     |
| 4.2 | Build cache was unchecked           | [ ]     |
| 4.3 | Production URL serves the new build | [ ]     |
| 4.4 | `/api/health` returns 200           | [ ]     |

---

## 5. Post-deploy verification

```bash
# Smoke against PROD.
BASE_URL=https://app.restoreassist.com.au \
  npx playwright test e2e/pilot-workflow.spec.ts --reporter=line
```

| #   | Item                                                                                                     | Done? |
| --- | -------------------------------------------------------------------------------------------------------- | ----- |
| 5.1 | Pilot smoke test green against prod                                                                      | [ ]     |
| 5.2 | Vercel runtime logs show traffic, no `console.error` storm                                               | [ ]     |
| 5.3 | Spot-check `POST /api/inspections/[id]/assessments/WATER/generate` returns a real artefact               | [ ]     |
| 5.4 | Spot-check `GET /api/inspections/[id]/assessments/WATER/pdf` streams a valid PDF                         | [ ]     |
| 5.5 | Spot-check `/dashboard/claims/[reportId]` shows the "Open assessments" link when an Inspection is linked | [ ]     |
| 5.6 | RA-1707 budget guard active (test workspace with $5 cap rejects 6th call with 429)                       | [ ]     |
| 5.7 | RA-1708 consent token rejected when expired (run the existing unit-test path against prod env)           | [ ]     |

---

## 6. Rollback SOP (if any of §3–§5 fails)

```bash
# 1. Revert the Vercel deploy back to the previous commit.
#    Vercel → Deployments → previous green prod deploy → "Promote to Production".

# 2. If a migration partially landed and the schema is now in a broken
#    intermediate state, roll the migration table back rather than the
#    whole DB:
psql "$DATABASE_URL" -c \
  "DELETE FROM _prisma_migrations WHERE migration_name LIKE '20260426%';"
#    Then restore the affected tables from the §3.1 backup.

# 3. If multiple migrations applied successfully but downstream traffic
#    is failing, restore from the §3.1 backup wholesale. Supabase →
#    Database → Backups → Restore.

# 4. File a Linear ticket "RA-XXXX [V1 ROLLBACK] <root cause>" with the
#    /tmp/phase-5-prod.log attached.
```

---

## 7. Pilot cutover

See [PILOT_CUTOVER_CHECKLIST.md](./PILOT_CUTOVER_CHECKLIST.md). Don't
start that until §3–§5 are all [PASS].
