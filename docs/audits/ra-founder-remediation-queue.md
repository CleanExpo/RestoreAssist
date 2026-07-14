# RestoreAssist — founder-gated remediation queue

From the 2026-07-12 audit, re-verified 2026-07-14 against current `main` (post #1919).
Everything here needs **live DB access + the manual prod-migrate gate** (per RA rules,
the agent does not apply prod migrations). Agent-doable items were already shipped on
branch `chore/ra-audit-remediation` (repo hygiene; enum drift gate) — this file is the
handoff for what only the founder can run.

## 1. Four RLS-enabled tables with ZERO policies (silent-write risk)

RLS is ON but no policy exists, so any browser/authenticated-key write fails **silently**
(secure against exposure, but a latent bug). #1919 covered `ClientCommsLog` +
`FeatureEntitlement`; these four remain. Recommended default = **service-role-only** (they
are all backend-written), which makes the safe deny-all explicit. Confirm the client-write
question per table before applying.

| Table | Tenant column | Written by | Recommended policy |
|---|---|---|---|
| `DrNrpgWebhookEvent` | none (integrationId) | webhook handler | service-role-only |
| `RestorationIncident` | none | backend aggregation | service-role-only |
| `StorageRestoreJob` | `orgId` | backend restore worker | service-role-only, OR org-scoped IF clients create restore jobs |
| `SupportTicketReply` | via `ticketId` | staff/agent | service-role-only, OR ticket-owner-scoped IF users reply |

**Service-role-only pattern** (explicit, no client access — service role bypasses RLS):
```sql
-- Example for DrNrpgWebhookEvent; repeat per table.
REVOKE ALL ON public."DrNrpgWebhookEvent" FROM anon, authenticated;
-- (RLS already enabled; with no permissive policy, authenticated writes are denied.
--  Adding an explicit comment/policy documents intent for the next auditor.)
COMMENT ON TABLE public."DrNrpgWebhookEvent" IS 'service-role-only: written by the DR-NRPG webhook handler; no client access by design (RA-6949 follow-up).';
```
**Org-scoped write pattern** (only if `StorageRestoreJob` client-create is intended):
```sql
CREATE POLICY "org members write their restore jobs" ON public."StorageRestoreJob"
  FOR ALL TO authenticated
  USING ("orgId" = (select auth.jwt() ->> 'org_id'))
  WITH CHECK ("orgId" = (select auth.jwt() ->> 'org_id'));
```
> Decision needed: do clients ever create `StorageRestoreJob` / `SupportTicketReply` rows?
> If no (likely) → service-role-only. If yes → the scoped policy above.

## 2. 380 `auth_rls_initplan` warnings across 182 tables (scale/perf)

RLS predicates call `auth.*()` **per-row** instead of once per query — the single most
material scale finding. Fix pattern (wrap the call in a scalar subselect so Postgres
evaluates it once):
```sql
-- Before:  USING (user_id = auth.uid())
-- After:   USING (user_id = (select auth.uid()))
```
Generate the migration by introspecting `pg_policies` for predicates matching
`\bauth\.(uid|jwt|role)\(` that are **not** already wrapped in `(select ...)`, and emit a
`CREATE OR REPLACE POLICY` (or DROP+CREATE) per policy. This must be generated from the
**live** policy set (not the schema) and applied via the direct `:5432` connection, then
verified with `supabase db lint` / the advisors panel showing 0 `auth_rls_initplan`.

## 3. Other advisor items (dashboard / migration)

- 4 unindexed foreign keys; add covering indexes.
- `VerificationToken` has no primary key; add one.
- Duplicate index on `MediaAsset`; drop the redundant one.
- pgvector installed in `public` schema; move to an `extensions` schema.
- **Leaked-password protection disabled** — enable in Supabase Auth settings (dashboard toggle, no migration).
- `organizations` (sibling-CRM co-tenant) still carries an always-true `authenticated` SELECT
  policy the June commerce remediation missed — drop it (default-deny) or scope it.

## 4. Pre-existing P0s (unchanged, still founder-gated)

1. **RA-6678** — set `ABR_API_GUID` (+ `ABR_BASE_URL`) in prod, redeploy, verify one known ABN.
2. **RA-1807** — set `DIRECT_URL` → `udooy` `:5432` on the prod host, run the drift-repair
   runbook Steps 1–5 (the `20260712000000_ra_1807_drift_repair` migration + `DRIFT_STRICT=1` verify).
3. **RA-6688** — attach D1/D3/E1/E2/F1 evidence, create the 3 Vercel alert rules, run the gate scorer.

## 5. Broader owner question
Should another product's customer data (`customers`, `orders`, `products`, `quotes`, …, 10
foreign-module tables) live in RestoreAssist's prod Supabase project at all? Co-tenancy is
currently benign (no RA code touches them) but it's a governance/blast-radius decision.
