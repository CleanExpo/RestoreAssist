# SQL Audit — RA-81

> Generated: 2026-03-05

---

## Prisma Migrations

All migrations live in `apps/web/prisma/migrations/`. Prisma manages ordering via the `_prisma_migrations` table.

| # | Migration | Date | What it does | Status |
|---|-----------|------|-------------|--------|
| 1 | `20251216113124_initial_updated_schame` | 2025-12-16 | Initial schema: User, Account, Session, Client, Report, Integration, CostLibrary, CostItem, Scope, Estimate, EstimateLineItem, EstimateVersion, EstimateVariation, CompanyPricingConfig + enums (Role, ClientStatus, ReportStatus, IntegrationStatus, SubscriptionStatus, EstimateStatus) | Active |
| 2 | `20251222035635_add_addon_tracking` | 2025-12-22 | Add addon report tracking columns to User (addonReports, monthlyReportsUsed, monthlyResetDate) | Active |
| 3 | `20251222080417_add_addon_purchase_model` | 2025-12-22 | Create AddonPurchase table + AddonPurchaseStatus enum for Stripe addon purchases | Active |
| 4 | `20251222105604_add_signup_bonus_tracking` | 2025-12-22 | Add signupBonusApplied boolean to User | Active |
| 5 | `20251224032330_add_claim_analysis` | 2025-12-24 | Create ClaimAnalysisBatch, ClaimAnalysis, MissingElement, StandardTemplate tables + related enums | Active |
| 6 | `20251224032905_add_claim_analysis_models` | 2025-12-24 | Empty migration (no-op) | Superseded |
| 7 | `20251228034209_add_nir_models` | 2025-12-28 | Create NIR (New Inspection Report) tables: Inspection, EnvironmentalData, MoistureReading, AffectedArea, Classification, ScopeItem, CostEstimate, AuditLog, BuildingCode, CostDatabase, InspectionPhoto + many enums | Active |
| 8 | `20251230135747_add_new_report_fields` | 2025-12-30 | Major restructure of NIR models — drops/recreates many columns across Inspection, AuditLog, BuildingCode, Classification, CostDatabase, CostEstimate, EnvironmentalData, InspectionPhoto, MoistureReading, ScopeItem; adds builder/developer fields to Report | Active |
| 9 | `20251230145804_add_new_report_fields` | 2025-12-30 | Empty migration (no-op, duplicate name of #8) | Superseded |
| 10 | `20260106090258_add_chat_messages` | 2026-01-06 | Create ChatMessage table | Active |
| 11 | `20260108_add_fulltext_search` | 2026-01-08 | Add tsvector search_vector columns + GIN indexes + trigger functions for Report, Client, Inspection full-text search; includes backfill | Active |
| 12 | `20260110055137_added_generated_url_for_excel_and_pdf` | 2026-01-10 | Add indexes on Estimate and Report; rename search GIN indexes from `_gin` to `_idx` | Active |
| 13 | `20260110101258_add_excel_file_url` | 2026-01-10 | Add excelReportUrl and inspectionPdfUrl columns to Report | Active |
| 14 | `20260114044217_update_the_interview_system_implmentations` | 2026-01-14 | Create interview system: SubscriptionTier, InterviewQuestion, InterviewSession, InterviewResponse, InterviewStandardsMapping tables + enums (InterviewStatus, QuestionType, SubscriptionTierLevel) | Active |
| 15 | `20260114105934_add_include_regulatory_citations` | 2026-01-14 | Add includeRegulatoryCitations boolean to Report | Active |
| 16 | `20260114153713_update_schema` | 2026-01-14 | Major schema expansion: IntegrationProvider enum, integrations OAuth fields, regulatory documents, citations, insurance requirements, forms system (FormTemplate, FormSubmission, FormSignature, FormAttachment, FormAuditLog), LiDAR scans, floor plans, voice notes/transcripts, property lookups, email system, usage events, password reset tokens | Active |
| 17 | `20260115120000_add_org_and_invites` | 2026-01-15 | Create Organization and UserInvite tables; add organizationId/managedById to User | Active |
| 18 | `20260116052106_add_must_change_password` | 2026-01-16 | Add mustChangePassword boolean to User | Active |
| 19 | `20260116120343_add_report_assignees` | 2026-01-16 | Add assignedAdminId and assignedManagerId to Report | Active |
| 20 | `20260116145115_add_authority_forms` | 2026-01-16 | Create AuthorityFormTemplate, AuthorityFormInstance, AuthorityFormSignature tables + enums | Active |
| 21 | `20260127000000_add_password_reset_attempts` | 2026-01-27 | Add attempts column to PasswordResetToken | Active |
| 22 | `20260127100000_add_security_event` | 2026-01-27 | Create SecurityEvent table for audit logging | Active |
| 23 | `20260127120000_add_agent_orchestration` | 2026-01-27 | Create AgentDefinition, AgentWorkflow, AgentTask, AgentTaskLog tables + WorkflowStatus/TaskStatus enums | Active |
| 24 | `20260127200000_add_cron_infrastructure` | 2026-01-27 | Add scheduling fields to AgentWorkflow; add email content columns to ScheduledEmail; create CronJobRun table | Active |
| 25 | `20260127210000_add_client_portal` | 2026-01-27 | Create ClientUser, PortalInvitation, ReportApproval tables + enums (InvitationStatus, ApprovalType, ApprovalStatus) | Active |
| 26 | `20260127000000_add_moisture_mapping_fields` | 2026-01-27 | Add floorPlanImageUrl to Inspection; add mapX/mapY to MoistureReading | Superseded (mapX/mapY dropped in #27) |
| 27 | `20260130072417_update_schema` | 2026-01-30 | Major expansion: contractor profiles, certifications, service areas, reviews; webhooks; Stripe webhooks; notifications; full invoicing system (Invoice, InvoiceLineItem, InvoicePayment, CreditNote, RecurringInvoice, etc.); drops mapX/mapY from MoistureReading; adds quickFill/deepseek fields to User | Active |
| 28 | `20260202105359_add_interview_session_report_id` | 2026-02-02 | Add reportId FK to InterviewSession | Active |
| 29 | `20260206000000_add_feedback` | 2026-02-06 | Create Feedback table | Active |
| 30 | `20260207000000_add_lifetime_access` | 2026-02-07 | Add lifetimeAccess boolean to User | Active |
| 31 | `20260221060300_add_life_time_access_variable` | 2026-02-21 | Empty migration (no-op) | Superseded |
| 32 | `20260227120000_add_restoration_document` | 2026-02-27 | Create RestorationDocument table (documentType, documentNumber, JSONB data) | Active |

---

## Loose SQL Files at Root

| Filename | Purpose | Action | Notes |
|----------|---------|--------|-------|
| `fix-integration-provider.sql` | One-time hotfix: adds IntegrationProvider enum + provider column to Integration table, backfills from name field | **Move** to `apps/web/scripts/sql/` | Superseded by Prisma migration #16 (`20260114153713_update_schema`) which does the same thing properly. Keep for reference only. |
| `supabase-crm-fulltext-search.sql` | Adds full-text search (tsvector + GIN + triggers) for Company and Contact tables in CRM module | **Move** to `apps/web/scripts/sql/` | Manual Supabase SQL Editor script. Not part of Prisma or Supabase migration flow. |
| `supabase-verify-fulltext-search.sql` | Verifies and fixes full-text search for Report, Client, Inspection; re-runs backfills for NULL search_vectors | **Move** to `apps/web/scripts/sql/` | Diagnostic/repair script. Prisma migration #11 handles the initial setup. |
| `SETUP_SUPABASE.sql` | Standalone Supabase setup for contractor availability system — creates contractors + availability_slots tables, RLS, sample data | **Move** to `apps/web/scripts/sql/` | Superseded by `supabase/migrations/20260106000001_create_contractors_schema.sql` and related migrations. Keep for reference. |

---

## Scripts Directory SQL Files

| Filename | Purpose | Notes |
|----------|---------|-------|
| `scripts/init-db.sql` | Self-contained NodeJS-Starter-V1 DB init: users, contractors, availability_slots, documents (pgvector), utility views, seed admin | Legacy starter template. Not used by the current Prisma-managed app. |
| `scripts/workflow-schema.sql` | Workflow Builder schema: workflows, workflow_nodes, workflow_edges, workflow_executions, workflow_execution_logs, workflow_collaborators | Legacy. The Prisma migration #23 (`add_agent_orchestration`) now handles workflow tables. |

---

## Supabase Migrations

Located in `supabase/migrations/`. These are for the Supabase-hosted agentic/AI layer (separate from the Prisma-managed app DB).

| # | Migration | What it does |
|---|-----------|-------------|
| 1 | `00000000000000_init.sql` | Enable uuid-ossp extension; create update_updated_at_column() trigger function |
| 2 | `00000000000001_auth_schema.sql` | Create profiles table extending auth.users; RLS policies |
| 3 | `00000000000002_enable_pgvector.sql` | Enable pgvector; create documents table with vector(1536) embeddings; RLS |
| 4 | `00000000000003_state_tables.sql` | Conversations and tasks tables for agent state management; RLS |
| 5 | `00000000000004_audit_evidence.sql` | Audit evidence storage for autonomous platform audit system |
| 6 | `00000000000005_copywriting_consistency.sql` | Business profile and copywriting consistency tables (NAP, marketing) |
| 7 | `00000000000006_agent_runs_realtime.sql` | Agent runs table with Supabase Realtime for event bridge between Next.js and FastAPI |
| 8 | `00000000000007_domain_memory.sql` | Persistent agent memory tables (Anthropic domain memory pattern) |
| 9 | `00000000000008_workflows.sql` | Visual workflow definitions and execution state |
| 10 | `00000000000009_rag_pipeline.sql` | RAG pipeline: document sources, chunks, hybrid search |
| 11 | `00000000000010_analytics.sql` | Analytics and observability: hourly metrics, cost tracking, alerting |
| 12 | `20251230050841_agent_task_queue.sql` | Agent task queue for agentic layer execution |
| 13 | `20260106000001_create_contractors_schema.sql` | Contractor availability schema (Australian-first, QLD focus) |
| 14 | `20260106000002_add_rls_policies.sql` | RLS policies for contractors and availability_slots |
| 15 | `20260106000003_seed_sample_data.sql` | Seed sample contractors and availability slots (Brisbane suburbs) |

Also present: `supabase/seed.sql` — top-level seed file for local development.

---

## Recommendations

### Files moved to `apps/web/scripts/sql/`

The following root-level SQL files have been relocated for a cleaner repo root:

1. **`fix-integration-provider.sql`** — One-time hotfix, superseded by Prisma migration #16
2. **`supabase-crm-fulltext-search.sql`** — Manual CRM full-text search setup script
3. **`supabase-verify-fulltext-search.sql`** — Diagnostic/repair script for full-text search
4. **`SETUP_SUPABASE.sql`** — Standalone contractor setup, superseded by Supabase migrations

### Superseded/empty Prisma migrations

Three migrations are empty no-ops and can be left in place (Prisma tracks them by name):
- `20251224032905_add_claim_analysis_models` (empty)
- `20251230145804_add_new_report_fields` (empty, duplicate name)
- `20260221060300_add_life_time_access_variable` (empty)

One migration was partially superseded:
- `20260127000000_add_moisture_mapping_fields` added mapX/mapY which were dropped in `20260130072417_update_schema`

### Dual database note

This project runs **two databases**:
1. **Prisma-managed** (primary app DB) — all `apps/web/prisma/migrations/`
2. **Supabase-managed** (agentic/AI layer) — all `supabase/migrations/`

The `scripts/init-db.sql` and `scripts/workflow-schema.sql` are legacy starter files that predate the Prisma migration setup and are no longer needed for operations.
