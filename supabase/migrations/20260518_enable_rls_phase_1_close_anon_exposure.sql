-- RA-4970: Enable Row Level Security on 119 unprotected production tables.
--
-- Closes the PostgREST anon-endpoint exposure surfaced by the Supabase
-- security advisor on 2026-05-18. RA's runtime never reads these tables
-- via the anon key (audit at
-- .claude/aggregation/supabase/service-role-audit-2026-05-18.md), so
-- enabling RLS with default-deny policies for anon + authenticated is
-- safe — server code uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) and
-- Prisma connects via DATABASE_URL as the postgres superuser
-- (BYPASSRLS by definition).
--
-- Bucketing rationale: .claude/aggregation/supabase/rls-categorisation.md
--
-- Shape:
--   - All 119 tables: ENABLE ROW LEVEL SECURITY (no anon/authenticated
--     policy → default deny).
--   - 12 public-ref tables: also CREATE POLICY anon_select FOR SELECT
--     USING (true) so reference data stays readable from client code
--     if a future feature needs it.
--   - service-role + postgres roles bypass and need no policies.
--
-- Idempotent. Re-running this migration is a no-op (DROP POLICY IF
-- EXISTS guards the public-ref policies; ENABLE ROW LEVEL SECURITY is
-- already idempotent in PostgreSQL).

BEGIN;

-- ─── Enable RLS on all 119 tables ──────────────────────────────────────────

-- workspace (2)
ALTER TABLE "AssessmentGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScrapingProviderConnection" ENABLE ROW LEVEL SECURITY;

-- organization (3)
ALTER TABLE "OrganizationPricingConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserInvite" ENABLE ROW LEVEL SECURITY;

-- user (24 — incl. BusinessProfile, MoistureMeter resolved from investigate-first)
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AddonPurchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClaimAnalysisBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyPricingConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractorProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Estimate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoicePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MoistureMeter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestorationDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandardTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserReleaseSeen" ENABLE ROW LEVEL SECURITY;

-- via-inspection (20 — incl. Room resolved from investigate-first)
ALTER TABLE "AffectedArea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AustralianComplianceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiohazardAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarpetRestorationAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CircuitAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Classification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentsPackOutItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostEstimate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DryingGoalRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnvironmentalData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FireSmokeDamageAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HVACAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InspectionPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MoistureReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MouldRemediationAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsychrometricReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScopeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StormDamageAssessment" ENABLE ROW LEVEL SECURITY;

-- via-report (4 — incl. EquipmentDeployment resolved from investigate-first)
ALTER TABLE "AuthorityFormInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractorReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentDeployment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportApproval" ENABLE ROW LEVEL SECURITY;

-- via-client (2)
ALTER TABLE "ClientPortalAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientUser" ENABLE ROW LEVEL SECURITY;

-- via-invoice (4)
ALTER TABLE "InvoiceEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoicePaymentAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReminder" ENABLE ROW LEVEL SECURITY;

-- via-estimate (3)
ALTER TABLE "EstimateLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstimateVariation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstimateVersion" ENABLE ROW LEVEL SECURITY;

-- via-integration (4)
ALTER TABLE "ExternalClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationSyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "XeroAccountCodeMapping" ENABLE ROW LEVEL SECURITY;

-- via-credit-note (1)
ALTER TABLE "CreditNoteLineItem" ENABLE ROW LEVEL SECURITY;

-- via-claim-analysis-batch (2)
ALTER TABLE "ClaimAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MissingElement" ENABLE ROW LEVEL SECURITY;

-- via-contractor-profile (2)
ALTER TABLE "ContractorCertification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractorServiceArea" ENABLE ROW LEVEL SECURITY;

-- via-cost-library (1)
ALTER TABLE "CostItem" ENABLE ROW LEVEL SECURITY;

-- via-authority-form-instance (1)
ALTER TABLE "AuthorityFormSignature" ENABLE ROW LEVEL SECURITY;

-- via-room (1 — RoomAnnotation chained Room → Inspection)
ALTER TABLE "RoomAnnotation" ENABLE ROW LEVEL SECURITY;

-- public-ref (12) — RLS-enabled AND given an anon-SELECT policy
ALTER TABLE "AbnLookupCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthorityFormTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Citation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostDatabase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IicrcChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsurancePolicyRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegulatoryDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegulatorySection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScopePricingDatabase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WaterDamageClassification" ENABLE ROW LEVEL SECURITY;

-- service-only (34)
ALTER TABLE "AgentDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentTaskLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentWorkflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AscoraIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AscoraJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AscoraLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AscoraNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttestationConsentToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentAnalytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronJobRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrNrpgIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrNrpgJobSync" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrNrpgWebhookLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GateCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HydrationJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthHandoffToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OverrideGovernanceReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressTelemetryEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PropertyLookup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecurityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorageMirrorJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
-- PasswordResetToken + VerificationToken (service-only auth tables)
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;

-- special: Organization (1)
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;

-- ─── Public-ref anon-SELECT policies (12) ──────────────────────────────────
-- These tables are read-only public reference data. The anon role gets
-- SELECT-only access; INSERT/UPDATE/DELETE require service-role.

DROP POLICY IF EXISTS "anon_select" ON "AbnLookupCache";
CREATE POLICY "anon_select" ON "AbnLookupCache"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "AppRelease";
CREATE POLICY "anon_select" ON "AppRelease"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "AuthorityFormTemplate";
CREATE POLICY "anon_select" ON "AuthorityFormTemplate"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "BuildingCode";
CREATE POLICY "anon_select" ON "BuildingCode"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "Citation";
CREATE POLICY "anon_select" ON "Citation"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "CostDatabase";
CREATE POLICY "anon_select" ON "CostDatabase"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "IicrcChunk";
CREATE POLICY "anon_select" ON "IicrcChunk"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "InsurancePolicyRequirement";
CREATE POLICY "anon_select" ON "InsurancePolicyRequirement"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "RegulatoryDocument";
CREATE POLICY "anon_select" ON "RegulatoryDocument"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "RegulatorySection";
CREATE POLICY "anon_select" ON "RegulatorySection"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "ScopePricingDatabase";
CREATE POLICY "anon_select" ON "ScopePricingDatabase"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select" ON "WaterDamageClassification";
CREATE POLICY "anon_select" ON "WaterDamageClassification"
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;

-- Verification (run AFTER migration applies):
--
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
--   -- Expected: empty result (every public.* table has RLS enabled).
--
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='anon_select';
--   -- Expected: 12 (one per public-ref table).
--
--   -- From the Supabase advisor:
--   -- The "rls_disabled" critical advisory should now report 0 tables.
