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
-- Environment-tolerant: each table operation skips silently if the
-- table does not exist in the target database. This lets the same
-- migration apply cleanly against sandbox / dev / prod, where the
-- table set can differ (prod-only tables like ScrapingProviderConnection
-- raise "relation does not exist" on narrower schemas).
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
-- Idempotent. Re-running this migration is a no-op.

BEGIN;

-- ─── Helper: enable RLS if the table exists ────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.enable_rls_if_exists(tbl text) RETURNS void AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  ELSE
    RAISE NOTICE 'RA-4970: skipped ENABLE RLS on missing table %', tbl;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── Helper: create anon-SELECT policy if the table exists ─────────────────

CREATE OR REPLACE FUNCTION pg_temp.create_anon_select_if_exists(tbl text) RETURNS void AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NOT NULL THEN
    EXECUTE format('DROP POLICY IF EXISTS "anon_select" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "anon_select" ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      tbl
    );
  ELSE
    RAISE NOTICE 'RA-4970: skipped anon_select policy on missing table %', tbl;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── Enable RLS on all 119 tables (skips silently if missing) ──────────────

-- workspace (2)
SELECT pg_temp.enable_rls_if_exists('AssessmentGeneration');
SELECT pg_temp.enable_rls_if_exists('ScrapingProviderConnection');

-- organization (3)
SELECT pg_temp.enable_rls_if_exists('OrganizationPricingConfig');
SELECT pg_temp.enable_rls_if_exists('User');
SELECT pg_temp.enable_rls_if_exists('UserInvite');

-- user (24)
SELECT pg_temp.enable_rls_if_exists('Account');
SELECT pg_temp.enable_rls_if_exists('AddonPurchase');
SELECT pg_temp.enable_rls_if_exists('BusinessProfile');
SELECT pg_temp.enable_rls_if_exists('ChatMessage');
SELECT pg_temp.enable_rls_if_exists('ClaimAnalysisBatch');
SELECT pg_temp.enable_rls_if_exists('CompanyPricingConfig');
SELECT pg_temp.enable_rls_if_exists('ContractorProfile');
SELECT pg_temp.enable_rls_if_exists('CreditNote');
SELECT pg_temp.enable_rls_if_exists('DeviceToken');
SELECT pg_temp.enable_rls_if_exists('Estimate');
SELECT pg_temp.enable_rls_if_exists('Feedback');
SELECT pg_temp.enable_rls_if_exists('InvoicePayment');
SELECT pg_temp.enable_rls_if_exists('MoistureMeter');
SELECT pg_temp.enable_rls_if_exists('Notification');
SELECT pg_temp.enable_rls_if_exists('PortalInvitation');
SELECT pg_temp.enable_rls_if_exists('RecurringInvoice');
SELECT pg_temp.enable_rls_if_exists('RestorationDocument');
SELECT pg_temp.enable_rls_if_exists('Scope');
SELECT pg_temp.enable_rls_if_exists('Session');
SELECT pg_temp.enable_rls_if_exists('StandardTemplate');
SELECT pg_temp.enable_rls_if_exists('SubscriptionEvent');
SELECT pg_temp.enable_rls_if_exists('UserReleaseSeen');

-- via-inspection (20)
SELECT pg_temp.enable_rls_if_exists('AffectedArea');
SELECT pg_temp.enable_rls_if_exists('AustralianComplianceRecord');
SELECT pg_temp.enable_rls_if_exists('BiohazardAssessment');
SELECT pg_temp.enable_rls_if_exists('CarpetRestorationAssessment');
SELECT pg_temp.enable_rls_if_exists('CircuitAssessment');
SELECT pg_temp.enable_rls_if_exists('Classification');
SELECT pg_temp.enable_rls_if_exists('ContentsPackOutItem');
SELECT pg_temp.enable_rls_if_exists('CostEstimate');
SELECT pg_temp.enable_rls_if_exists('DryingGoalRecord');
SELECT pg_temp.enable_rls_if_exists('EnvironmentalData');
SELECT pg_temp.enable_rls_if_exists('FireSmokeDamageAssessment');
SELECT pg_temp.enable_rls_if_exists('HVACAssessment');
SELECT pg_temp.enable_rls_if_exists('InspectionPhoto');
SELECT pg_temp.enable_rls_if_exists('MoistureReading');
SELECT pg_temp.enable_rls_if_exists('MouldRemediationAssessment');
SELECT pg_temp.enable_rls_if_exists('PilotObservation');
SELECT pg_temp.enable_rls_if_exists('PsychrometricReading');
SELECT pg_temp.enable_rls_if_exists('Room');
SELECT pg_temp.enable_rls_if_exists('ScopeItem');
SELECT pg_temp.enable_rls_if_exists('StormDamageAssessment');

-- via-report (4)
SELECT pg_temp.enable_rls_if_exists('AuthorityFormInstance');
SELECT pg_temp.enable_rls_if_exists('ContractorReview');
SELECT pg_temp.enable_rls_if_exists('EquipmentDeployment');
SELECT pg_temp.enable_rls_if_exists('ReportApproval');

-- via-client (2)
SELECT pg_temp.enable_rls_if_exists('ClientPortalAccount');
SELECT pg_temp.enable_rls_if_exists('ClientUser');

-- via-invoice (4)
SELECT pg_temp.enable_rls_if_exists('InvoiceEmail');
SELECT pg_temp.enable_rls_if_exists('InvoiceLineItem');
SELECT pg_temp.enable_rls_if_exists('InvoicePaymentAllocation');
SELECT pg_temp.enable_rls_if_exists('PaymentReminder');

-- via-estimate (3)
SELECT pg_temp.enable_rls_if_exists('EstimateLineItem');
SELECT pg_temp.enable_rls_if_exists('EstimateVariation');
SELECT pg_temp.enable_rls_if_exists('EstimateVersion');

-- via-integration (4)
SELECT pg_temp.enable_rls_if_exists('ExternalClient');
SELECT pg_temp.enable_rls_if_exists('ExternalJob');
SELECT pg_temp.enable_rls_if_exists('IntegrationSyncLog');
SELECT pg_temp.enable_rls_if_exists('XeroAccountCodeMapping');

-- via-credit-note (1)
SELECT pg_temp.enable_rls_if_exists('CreditNoteLineItem');

-- via-claim-analysis-batch (2)
SELECT pg_temp.enable_rls_if_exists('ClaimAnalysis');
SELECT pg_temp.enable_rls_if_exists('MissingElement');

-- via-contractor-profile (2)
SELECT pg_temp.enable_rls_if_exists('ContractorCertification');
SELECT pg_temp.enable_rls_if_exists('ContractorServiceArea');

-- via-cost-library (1)
SELECT pg_temp.enable_rls_if_exists('CostItem');

-- via-authority-form-instance (1)
SELECT pg_temp.enable_rls_if_exists('AuthorityFormSignature');

-- via-room → Inspection (1)
SELECT pg_temp.enable_rls_if_exists('RoomAnnotation');

-- public-ref (12) — RLS-enabled, with anon_select policy created below
SELECT pg_temp.enable_rls_if_exists('AbnLookupCache');
SELECT pg_temp.enable_rls_if_exists('AppRelease');
SELECT pg_temp.enable_rls_if_exists('AuthorityFormTemplate');
SELECT pg_temp.enable_rls_if_exists('BuildingCode');
SELECT pg_temp.enable_rls_if_exists('Citation');
SELECT pg_temp.enable_rls_if_exists('CostDatabase');
SELECT pg_temp.enable_rls_if_exists('IicrcChunk');
SELECT pg_temp.enable_rls_if_exists('InsurancePolicyRequirement');
SELECT pg_temp.enable_rls_if_exists('RegulatoryDocument');
SELECT pg_temp.enable_rls_if_exists('RegulatorySection');
SELECT pg_temp.enable_rls_if_exists('ScopePricingDatabase');
SELECT pg_temp.enable_rls_if_exists('WaterDamageClassification');

-- service-only (34)
SELECT pg_temp.enable_rls_if_exists('AgentDefinition');
SELECT pg_temp.enable_rls_if_exists('AgentTask');
SELECT pg_temp.enable_rls_if_exists('AgentTaskLog');
SELECT pg_temp.enable_rls_if_exists('AgentWorkflow');
SELECT pg_temp.enable_rls_if_exists('AscoraIntegration');
SELECT pg_temp.enable_rls_if_exists('AscoraJob');
SELECT pg_temp.enable_rls_if_exists('AscoraLineItem');
SELECT pg_temp.enable_rls_if_exists('AscoraNote');
SELECT pg_temp.enable_rls_if_exists('AttestationConsentToken');
SELECT pg_temp.enable_rls_if_exists('AuditLog');
SELECT pg_temp.enable_rls_if_exists('ContentAnalytics');
SELECT pg_temp.enable_rls_if_exists('ContentJob');
SELECT pg_temp.enable_rls_if_exists('ContentPost');
SELECT pg_temp.enable_rls_if_exists('CronJobRun');
SELECT pg_temp.enable_rls_if_exists('DrNrpgIntegration');
SELECT pg_temp.enable_rls_if_exists('DrNrpgJobSync');
SELECT pg_temp.enable_rls_if_exists('DrNrpgWebhookLog');
SELECT pg_temp.enable_rls_if_exists('EvaluationRun');
SELECT pg_temp.enable_rls_if_exists('GateCheck');
SELECT pg_temp.enable_rls_if_exists('HydrationJob');
SELECT pg_temp.enable_rls_if_exists('InvoiceAuditLog');
SELECT pg_temp.enable_rls_if_exists('OAuthHandoffToken');
SELECT pg_temp.enable_rls_if_exists('OverrideGovernanceReport');
SELECT pg_temp.enable_rls_if_exists('ProgressTelemetryEvent');
SELECT pg_temp.enable_rls_if_exists('PromptVariant');
SELECT pg_temp.enable_rls_if_exists('PropertyLookup');
SELECT pg_temp.enable_rls_if_exists('ScheduledEmail');
SELECT pg_temp.enable_rls_if_exists('SecurityEvent');
SELECT pg_temp.enable_rls_if_exists('StorageMirrorJob');
SELECT pg_temp.enable_rls_if_exists('StripeWebhookEvent');
SELECT pg_temp.enable_rls_if_exists('WebhookEvent');
SELECT pg_temp.enable_rls_if_exists('_prisma_migrations');
SELECT pg_temp.enable_rls_if_exists('PasswordResetToken');
SELECT pg_temp.enable_rls_if_exists('VerificationToken');

-- special: Organization (1)
SELECT pg_temp.enable_rls_if_exists('Organization');

-- ─── Public-ref anon-SELECT policies (12) ──────────────────────────────────

SELECT pg_temp.create_anon_select_if_exists('AbnLookupCache');
SELECT pg_temp.create_anon_select_if_exists('AppRelease');
SELECT pg_temp.create_anon_select_if_exists('AuthorityFormTemplate');
SELECT pg_temp.create_anon_select_if_exists('BuildingCode');
SELECT pg_temp.create_anon_select_if_exists('Citation');
SELECT pg_temp.create_anon_select_if_exists('CostDatabase');
SELECT pg_temp.create_anon_select_if_exists('IicrcChunk');
SELECT pg_temp.create_anon_select_if_exists('InsurancePolicyRequirement');
SELECT pg_temp.create_anon_select_if_exists('RegulatoryDocument');
SELECT pg_temp.create_anon_select_if_exists('RegulatorySection');
SELECT pg_temp.create_anon_select_if_exists('ScopePricingDatabase');
SELECT pg_temp.create_anon_select_if_exists('WaterDamageClassification');

COMMIT;

-- Verification (run AFTER migration applies):
--
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
--   -- Expected against prod: empty result (all 119 public.* tables have RLS enabled).
--   -- Against narrower envs: empty result if those envs' tables are a subset of the 119.
--
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='anon_select';
--   -- Expected: 12 against any env where the public-ref tables exist.
--
--   -- From the Supabase advisor:
--   -- The "rls_disabled" critical advisory should now report 0 tables.
--
-- Skip notices:
--   The migration emits a `NOTICE` line per missing table. Inspect the
--   notices output to confirm only expected-missing tables were skipped
--   (e.g. prod-only tables when applying to a stripped-down sandbox).
