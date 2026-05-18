# RLS Categorisation — 119 prod tables (RA-4970)

**Generated:** by `scripts/rls-categorise.py` against `prisma/schema.prisma`.
**Total tables:** 119

## Buckets

### `workspace` (2 tables)

- **AssessmentGeneration** — has workspaceId — scope to WorkspaceMember
- **ScrapingProviderConnection** — has workspaceId — scope to WorkspaceMember

### `organization` (3 tables)

- **OrganizationPricingConfig** — has organizationId — scope to User.organizationId
- **User** — has organizationId — scope to User.organizationId
- **UserInvite** — has organizationId — scope to User.organizationId

### `user` (20 tables)

- **Account** — has userId — scope to auth.uid()
- **AddonPurchase** — has userId — scope to auth.uid()
- **ChatMessage** — has userId — scope to auth.uid()
- **ClaimAnalysisBatch** — has userId — scope to auth.uid()
- **CompanyPricingConfig** — has userId — scope to auth.uid()
- **ContractorProfile** — has userId — scope to auth.uid()
- **CreditNote** — has userId — scope to auth.uid()
- **DeviceToken** — has userId — scope to auth.uid()
- **Estimate** — has userId — scope to auth.uid()
- **Feedback** — has userId — scope to auth.uid()
- **InvoicePayment** — has userId — scope to auth.uid()
- **Notification** — has userId — scope to auth.uid()
- **PortalInvitation** — has userId — scope to auth.uid()
- **RecurringInvoice** — has userId — scope to auth.uid()
- **RestorationDocument** — has userId — scope to auth.uid()
- **Scope** — has userId — scope to auth.uid()
- **Session** — has userId — scope to auth.uid()
- **StandardTemplate** — has userId — scope to auth.uid()
- **SubscriptionEvent** — has userId — scope to auth.uid()
- **UserReleaseSeen** — has userId — scope to auth.uid()

### `via-inspection` (19 tables)

- **AffectedArea** — joined through Inspection (workspace-scoped)
- **AustralianComplianceRecord** — joined through Inspection (workspace-scoped)
- **BiohazardAssessment** — joined through Inspection (workspace-scoped)
- **CarpetRestorationAssessment** — joined through Inspection (workspace-scoped)
- **CircuitAssessment** — joined through Inspection (workspace-scoped)
- **Classification** — joined through Inspection (workspace-scoped)
- **ContentsPackOutItem** — joined through Inspection (workspace-scoped)
- **CostEstimate** — joined through Inspection (workspace-scoped)
- **DryingGoalRecord** — joined through Inspection (workspace-scoped)
- **EnvironmentalData** — joined through Inspection (workspace-scoped)
- **FireSmokeDamageAssessment** — joined through Inspection (workspace-scoped)
- **HVACAssessment** — joined through Inspection (workspace-scoped)
- **InspectionPhoto** — joined through Inspection (workspace-scoped)
- **MoistureReading** — joined through Inspection (workspace-scoped)
- **MouldRemediationAssessment** — joined through Inspection (workspace-scoped)
- **PilotObservation** — joined through Inspection (workspace-scoped)
- **PsychrometricReading** — joined through Inspection (workspace-scoped)
- **ScopeItem** — joined through Inspection (workspace-scoped)
- **StormDamageAssessment** — joined through Inspection (workspace-scoped)

### `via-report` (3 tables)

- **AuthorityFormInstance** — joined through Report (workspace-scoped)
- **ContractorReview** — joined through Report (workspace-scoped)
- **ReportApproval** — joined through Report (workspace-scoped)

### `via-client` (2 tables)

- **ClientPortalAccount** — joined through Client (workspace-scoped)
- **ClientUser** — joined through Client (workspace-scoped)

### `via-invoice` (4 tables)

- **InvoiceEmail** — joined through Invoice (workspace-scoped)
- **InvoiceLineItem** — joined through Invoice (workspace-scoped)
- **InvoicePaymentAllocation** — joined through Invoice (workspace-scoped)
- **PaymentReminder** — joined through Invoice (workspace-scoped)

### `via-estimate` (3 tables)

- **EstimateLineItem** — joined through Estimate
- **EstimateVariation** — joined through Estimate
- **EstimateVersion** — joined through Estimate

### `public-ref` (11 tables)

- **AbnLookupCache** — read-only public reference data
- **AuthorityFormTemplate** — read-only public reference data
- **BuildingCode** — read-only public reference data
- **Citation** — read-only public reference data
- **CostDatabase** — read-only public reference data
- **IicrcChunk** — read-only public reference data
- **InsurancePolicyRequirement** — read-only public reference data
- **RegulatoryDocument** — read-only public reference data
- **RegulatorySection** — read-only public reference data
- **ScopePricingDatabase** — read-only public reference data
- **WaterDamageClassification** — read-only public reference data

### `service-only` (32 tables)

- **AgentDefinition** — server-side only; no anon/authenticated access
- **AgentTask** — server-side only; no anon/authenticated access
- **AgentTaskLog** — server-side only; no anon/authenticated access
- **AgentWorkflow** — server-side only; no anon/authenticated access
- **AscoraIntegration** — server-side only; no anon/authenticated access
- **AscoraJob** — server-side only; no anon/authenticated access
- **AscoraLineItem** — server-side only; no anon/authenticated access
- **AscoraNote** — server-side only; no anon/authenticated access
- **AttestationConsentToken** — server-side only; no anon/authenticated access
- **AuditLog** — server-side only; no anon/authenticated access
- **ContentAnalytics** — server-side only; no anon/authenticated access
- **ContentJob** — server-side only; no anon/authenticated access
- **ContentPost** — server-side only; no anon/authenticated access
- **CronJobRun** — server-side only; no anon/authenticated access
- **DrNrpgIntegration** — server-side only; no anon/authenticated access
- **DrNrpgJobSync** — server-side only; no anon/authenticated access
- **DrNrpgWebhookLog** — server-side only; no anon/authenticated access
- **EvaluationRun** — server-side only; no anon/authenticated access
- **GateCheck** — server-side only; no anon/authenticated access
- **HydrationJob** — server-side only; no anon/authenticated access
- **InvoiceAuditLog** — server-side only; no anon/authenticated access
- **OAuthHandoffToken** — server-side only; no anon/authenticated access
- **OverrideGovernanceReport** — server-side only; no anon/authenticated access
- **ProgressTelemetryEvent** — server-side only; no anon/authenticated access
- **PromptVariant** — server-side only; no anon/authenticated access
- **PropertyLookup** — server-side only; no anon/authenticated access
- **ScheduledEmail** — server-side only; no anon/authenticated access
- **SecurityEvent** — server-side only; no anon/authenticated access
- **StorageMirrorJob** — server-side only; no anon/authenticated access
- **StripeWebhookEvent** — server-side only; no anon/authenticated access
- **WebhookEvent** — server-side only; no anon/authenticated access
- **_prisma_migrations** — server-side only; no anon/authenticated access

### `unowned` (15 tables)

- **AppRelease** — no ownership FK found — manual review needed
- **AuthorityFormSignature** — no ownership FK found — manual review needed
- **ClaimAnalysis** — no ownership FK found — manual review needed
- **ContractorCertification** — no ownership FK found — manual review needed
- **ContractorServiceArea** — no ownership FK found — manual review needed
- **CostItem** — no ownership FK found — manual review needed
- **CreditNoteLineItem** — no ownership FK found — manual review needed
- **ExternalClient** — no ownership FK found — manual review needed
- **ExternalJob** — no ownership FK found — manual review needed
- **IntegrationSyncLog** — no ownership FK found — manual review needed
- **MissingElement** — no ownership FK found — manual review needed
- **Organization** — no ownership FK found — manual review needed
- **PasswordResetToken** — no ownership FK found — manual review needed
- **VerificationToken** — no ownership FK found — manual review needed
- **XeroAccountCodeMapping** — no ownership FK found — manual review needed

### `unknown` (5 tables)

- **BusinessProfile** — model not found in schema
- **EquipmentDeployment** — model not found in schema
- **MoistureMeter** — model not found in schema
- **Room** — model not found in schema
- **RoomAnnotation** — model not found in schema

## Next steps

1. Manually review `unowned` + `unknown` buckets — these need a policy decision before migration.
2. For each bucket, write the policy template (see RA-4970 ticket body).
3. Generate the migration: `scripts/rls-emit-migration.py` (TODO).
4. Apply to sandbox first, smoke, then prod.

<!-- BEGIN MANUAL REVIEW — content below is preserved by rls-categorise.py -->

## Manual review resolution (2026-05-18)

Schema inspection of the `unowned` bucket reveals chain ownership:

| Table | Resolved bucket | Chain |
|---|---|---|
| `XeroAccountCodeMapping` | via-integration | → `Integration.userId` / `Integration.workspaceId?` |
| `IntegrationSyncLog` | via-integration | → `Integration.userId` |
| `ExternalClient` | via-integration | → `Integration.userId` |
| `ExternalJob` | via-integration | → `Integration.userId` |
| `AuthorityFormSignature` | via-authority-form-instance | → `AuthorityFormInstance` → `Report` → workspace |
| `CreditNoteLineItem` | via-credit-note | → `CreditNote.userId` (already user-bucket) |
| `MissingElement` | via-claim-analysis | → `ClaimAnalysis.batchId` → `ClaimAnalysisBatch.userId` |
| `ClaimAnalysis` | via-claim-analysis-batch | → `ClaimAnalysisBatch.userId` |
| `ContractorCertification` | via-contractor-profile | → `ContractorProfile.userId` (already user-bucket) |
| `ContractorServiceArea` | via-contractor-profile | → `ContractorProfile.userId` |
| `CostItem` | via-cost-library | → `CostLibrary.workspaceId?` (workspace-scoped, nullable workspace fall-back to user) |
| `Organization` | special | members of org `o` can SELECT where `id = (SELECT organizationId FROM "User" WHERE id = auth.uid())`; INSERT/UPDATE/DELETE = service-role only |
| `AppRelease` | public-ref | release notes are public to authenticated users |
| `PasswordResetToken` | service-only | issued + redeemed server-side only |
| `VerificationToken` | service-only | NextAuth-managed, server-side only |

The 5 `unknown` tables (`BusinessProfile`, `EquipmentDeployment`, `MoistureMeter`, `Room`, `RoomAnnotation`) are present in `restoreassist-prod-2026` but **not in `prisma/schema.prisma` or `supabase/migrations/`**. They were likely created directly via the Supabase dashboard or by an older schema. **Action:** before writing policies for these, run `mcp__claude_ai_Supabase__list_tables --verbose` on each to inspect columns + FKs, then either bucket appropriately OR drop the table if confirmed unused. Tagged as "investigate first" in RA-4970.

## Final bucket sizes (after manual review)

| Bucket | Count |
|---|---|
| workspace | 2 |
| organization | 3 |
| user | 22 (20 + 2 reclassified from unowned) |
| via-inspection | 19 |
| via-report | 3 |
| via-client | 2 |
| via-invoice | 4 |
| via-estimate | 3 |
| via-integration | 4 |
| via-credit-note | 1 |
| via-claim-analysis-batch | 2 |
| via-contractor-profile | 2 |
| via-cost-library | 1 |
| via-authority-form-instance | 1 |
| public-ref | 12 (11 + AppRelease) |
| service-only | 34 (32 + PasswordResetToken + VerificationToken) |
| special (Organization) | 1 |
| investigate-first (unknown in prisma) | 5 |
| **Total** | **119** ✓ |

## Next steps

1. **Investigate the 5 "unknown" tables** — verbose Supabase list + decide drop-or-bucket.
2. **Audit `lib/supabase/server.ts`** — confirm server-side code uses `SUPABASE_SERVICE_ROLE_KEY` (not anon) for: cron handlers, webhook receivers, admin routes, all service-only tables. Tables in the `service-only` bucket will be inaccessible to anon-key clients after this migration.
3. **Write the migration** as `prisma/migrations/<date>_enable_rls_phase_1_critical_119_tables/migration.sql`. One bucket per section. Idempotent (`CREATE POLICY IF NOT EXISTS` is not supported in PG — use `DROP POLICY IF EXISTS ... CREATE POLICY ...` pattern).
4. **Apply to sandbox first** (`restoreassist-sandbox` Vercel project → its Supabase if separate, or to the empty `oxeiaavuspvpvanzcrjc` first). Run `pnpm test:e2e:sandbox` + `pnpm test:smoke:sandbox` + manual click-through.
5. **Apply to prod** in a low-traffic window (~03:00 AEST). Run smoke. Monitor Supabase logs for `permission denied` errors for 30 min.
6. **Re-run `mcp__claude_ai_Supabase__get_advisors`** on `udooysjajglluvuxkijp` → confirm 0 critical RLS findings.
