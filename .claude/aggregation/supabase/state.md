# Supabase — RestoreAssist project state

**Pulled:** 2026-05-18

## Two RA Supabase projects exist — important to keep straight

| Project ID | Name | Region | Created | Role |
|---|---|---|---|---|
| `oxeiaavuspvpvanzcrjc` | **RestoreAssist** | ap-southeast-2 | 2025-10-18 | Looks like the original/empty dev project. 168 tables, mostly 0 rows. 1 User, 1 Organization, 1 Workspace, 8 SecurityEvents, **14,829 CronJobRuns**. |
| `udooysjajglluvuxkijp` | **restoreassist-prod-2026** | ap-southeast-2 | 2026-01-10 | **The actual production DB.** 72 Users, 56 Organizations, 5 Inspections, 4 Reports, 51 UserInvites, 36 SecurityEvents, **12,703 CronJobRuns**, 12 FormTemplates. |

Both are `ACTIVE_HEALTHY`, Postgres 17. Neither has any deployed edge functions.

**Action:** confirm the canonical production project ID is `udooysjajglluvuxkijp`. The Vercel `DATABASE_URL` should be pointed at this one. Pilot users (72 of them already) live here.

---

## 🚨 CRITICAL SECURITY FINDING: RLS disabled across the board

### `restoreassist-prod-2026` (the real prod DB)
**119 tables have Row Level Security DISABLED.** Including:
- `User`, `Account`, `Session`, `PasswordResetToken` — auth surface
- `Organization`, `UserInvite`, `WebhookEvent`, `StripeWebhookEvent` — tenant + billing
- `Inspection` ✅ RLS on, but its children `EnvironmentalData`, `MoistureReading`, `AffectedArea`, `Classification`, `ScopeItem`, `InspectionPhoto` ❌ RLS OFF
- `Notification`, `ChatMessage`, `IntegrationSyncLog`, `SecurityEvent`, `CronJobRun` — sensitive ops surface
- `XeroAccountCodeMapping`, `AscoraIntegration`, `DrNrpgIntegration` — integration auth state
- All clinical/assessment tables (`FireSmokeDamageAssessment`, `BiohazardAssessment`, `MouldRemediationAssessment`, `WaterDamageClassification`, etc.)

**Effect:** anyone with the anon key (which Next.js ships to the client) can read or modify every row in 119 of 180+ tables. **This is the single biggest production-readiness gap.** Maps to a sub-criterion of RA-4956 but is not currently called out as its own Linear issue — recommend opening one as P0.

Remediation SQL was returned by the Supabase advisor (full text saved at `/Users/phill-mac/.claude/projects/-Users-phill-mac-RestoreAssist/3d1d630a-6bc3-4a5a-b7f4-bd242dd9ddd5/tool-results/mcp-claude_ai_Supabase-get_advisors-1779061136114.txt`). Do **not** run it blindly — enabling RLS without policies will black-hole all app traffic.

### `RestoreAssist` (`oxeiaavuspvpvanzcrjc`)
151 tables have RLS disabled. Same root cause. Less urgent because the project appears unused (1 user) — but if it's still attached to anything, it's a leak vector. **Action:** either decommission this project or align it with prod.

---

## Tables of interest (prod DB)

### Has real data, RLS OK (✅ green)
- `Workspace` (1), `WorkspaceMember` (0), `WorkspaceRole` (3), `Permission` (14), `RolePermission` (29) — workspace ACL surface looks correctly modelled with RLS on.
- `ClaimProgress` (4) ✅ — the progress framework (RA-1376 Epic) has live data with RLS.
- `Inspection` (5) ✅, `Client` (1) ✅, `Report` (4) ✅ — core domain RLS on.
- `FormTemplate` (12) ✅ — form library populated with RLS.
- `BusinessProfile` (2) ❌ RLS OFF but referenced from RLS-on tables — bridge gap.

### Has data, RLS OFF (🟠 ship-blocker)
- `User` (72), `Organization` (56), `UserInvite` (51), `AppRelease` (3), `UserReleaseSeen` (20), `Account` (5), `CompanyPricingConfig` (1), `ChatMessage` (4), `Notification` (1), `SecurityEvent` (36), `CronJobRun` (12,703), `BrandAmbassadorPost` (4), `IntegrationSyncLog` (1), `_prisma_migrations` (161), `CostDatabase` (7), `Integration` (2)

### Migrations applied (last 15)
```
20260512232703  resolve_dormant_inspection_moisture_drift     (newest, 2026-05-12)
20260413025900  add_gate_check
20260407233510  add_evidence_item_status_contents_manifest
20260407233500  add_affected_contents_enum
20260405232852  media_asset_rls_complete                       ← good — RLS work has happened
20260405232832  workspace_scoped_rls                           ← good — workspace tables got RLS
20260405063438  add_media_asset_seo_fields
20260405062736  add_media_asset_tag
20260405024948  add_media_asset
20260405022144  add_provider_connection_ai_usage_log
20260405021051  add_workspaceid_to_customer_tables
20260405015738  add_workspace_foundation
20260405014850  add_evidence_schema
20260404052458  evidence_bucket_rls_policies
20260404052001  add_storage_provider_to_organization
```
Only **161 migrations** shown by Supabase MCP, but Prisma `_prisma_migrations` table has 161 rows in prod — consistent. The two RLS-related migrations (`workspace_scoped_rls`, `media_asset_rls_complete`) are doing the right thing for newer tables; the gap is everything from before April 2026 plus all the clinical/assessment tables added later without RLS.

---

## Edge functions
**None deployed** on either project. RA is pure Next.js API routes (442 of them per repo-state) — Supabase is database-only.

---

## What this maps to in the master plan

1. **P0 production-blocker** — open a new Linear issue (or sub-task of RA-4956): "Enable RLS + write policies for the 119 tables in `restoreassist-prod-2026`." Estimate 2–3 days, must precede any new tenant onboarding beyond the existing 56 orgs.
2. **Decommission or align** the empty `oxeiaavuspvpvanzcrjc` project.
3. **Confirm Vercel env** `DATABASE_URL` / `SUPABASE_URL` point at `udooysjajglluvuxkijp` (the prod DB) — cross-check against `.claude/aggregation/vercel/state.md`.
