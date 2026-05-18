#!/usr/bin/env python3
"""Categorise Prisma models by RLS access pattern.

Reads prisma/schema.prisma + the 119-table RLS-disabled list from Supabase advisor,
then buckets each table by ownership column for policy assignment.

Output: .claude/aggregation/supabase/rls-categorisation.md
"""

from __future__ import annotations
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCHEMA = REPO / "prisma" / "schema.prisma"
OUT = REPO / ".claude" / "aggregation" / "supabase" / "rls-categorisation.md"

# 119 tables from Supabase advisor (restoreassist-prod-2026, udooysjajglluvuxkijp)
# Source: aggregation/supabase/state.md
RLS_DISABLED = """
_prisma_migrations Account Session User VerificationToken CostItem Scope Estimate
EstimateLineItem EstimateVersion EstimateVariation CompanyPricingConfig AddonPurchase
ClaimAnalysisBatch ClaimAnalysis MissingElement StandardTemplate EnvironmentalData
MoistureReading AffectedArea Classification ScopeItem CostEstimate AuditLog
BuildingCode CostDatabase InspectionPhoto ChatMessage RegulatoryDocument
RegulatorySection Citation InsurancePolicyRequirement PasswordResetToken ExternalClient
ExternalJob IntegrationSyncLog Organization UserInvite AuthorityFormTemplate
AuthorityFormInstance AuthorityFormSignature SecurityEvent AgentDefinition AgentWorkflow
AgentTask AgentTaskLog ScheduledEmail CronJobRun ClientUser PortalInvitation
ReportApproval Room RoomAnnotation BusinessProfile ContractorCertification
ContractorServiceArea ContractorReview WebhookEvent StripeWebhookEvent Notification
InvoiceLineItem InvoicePayment InvoicePaymentAllocation CreditNote CreditNoteLineItem
RecurringInvoice InvoiceAuditLog InvoiceEmail PaymentReminder ContractorProfile
Feedback RestorationDocument MoistureMeter EquipmentDeployment PilotObservation
AscoraIntegration AscoraJob AscoraLineItem AscoraNote ScopePricingDatabase
DrNrpgIntegration DrNrpgJobSync DrNrpgWebhookLog DryingGoalRecord PromptVariant
EvaluationRun AppRelease UserReleaseSeen IicrcChunk GateCheck PropertyLookup
XeroAccountCodeMapping ProgressTelemetryEvent OverrideGovernanceReport
AttestationConsentToken AssessmentGeneration DeviceToken OAuthHandoffToken
ScrapingProviderConnection HydrationJob AbnLookupCache OrganizationPricingConfig
WaterDamageClassification PsychrometricReading CircuitAssessment ContentJob ContentPost
ContentAnalytics FireSmokeDamageAssessment ContentsPackOutItem MouldRemediationAssessment
StormDamageAssessment BiohazardAssessment CarpetRestorationAssessment HVACAssessment
AustralianComplianceRecord StorageMirrorJob ClientPortalAccount SubscriptionEvent
""".split()

# Reference data: read-only public lookup tables
PUBLIC_REF = {
    "BuildingCode", "CostDatabase", "IicrcChunk", "StandardsChunk",
    "RegulatoryDocument", "RegulatorySection", "Citation",
    "InsurancePolicyRequirement", "ScopePricingDatabase",
    "WaterDamageClassification",  # if reference; verify
    "AbnLookupCache",  # cached ABR lookups, read-public OK
    "SubscriptionTier",
    "InterviewQuestion", "InterviewStandardsMapping",
    "Permission", "RolePermission", "WorkspaceRole",
    "ScopeTemplate", "FormTemplate", "FormTemplateVersion",
    "AuthorityFormTemplate", "InvoiceTemplate",
}

# Service-role only: no anon/authenticated access at all
SERVICE_ONLY = {
    "_prisma_migrations",
    "WebhookEvent", "StripeWebhookEvent",
    "CronJobRun",
    "OAuthStateNonce", "OAuthHandoffToken", "AttestationConsentToken",
    "AdminImpersonation",
    "AbnLookupCache",  # also acceptable as service-only if write-side
    "OverrideGovernanceReport",
    "SecurityEvent",
    "AuditLog",
    "ScheduledEmail", "EmailAudit",
    "DeviceSigningKey",
    "PropertyLookup",  # cached scraper results
    "StorageMirrorJob",
    "HydrationJob",
    "InvoiceSyncJob",
    "InvoiceAuditLog",
    "FormAuditLog",
    "AgentDefinition", "AgentWorkflow", "AgentTask", "AgentTaskLog",
    "EvaluationRun", "PromptVariant",
    "AscoraIntegration", "DrNrpgIntegration",  # integration credentials
    "AscoraJob", "AscoraLineItem", "AscoraNote",
    "DrNrpgJobSync", "DrNrpgWebhookLog",
    "ProgressTelemetryEvent",
    "ContentJob", "ContentPost", "ContentAnalytics",
    "GateCheck",
}


def parse_models(schema_text: str) -> dict[str, dict]:
    """Return {ModelName: {'fields': [...], 'block': str}}."""
    pattern = re.compile(r"^model\s+(\w+)\s*\{(.*?)^\}", re.M | re.S)
    models = {}
    for match in pattern.finditer(schema_text):
        name = match.group(1)
        block = match.group(2)
        fields = re.findall(r"^\s+(\w+)\s+", block, re.M)
        models[name] = {"fields": fields, "block": block}
    return models


def categorise(name: str, info: dict | None) -> tuple[str, str]:
    """Return (bucket, reason)."""
    if name in PUBLIC_REF:
        return ("public-ref", "read-only public reference data")
    if name in SERVICE_ONLY:
        return ("service-only", "server-side only; no anon/authenticated access")
    if info is None:
        return ("unknown", "model not found in schema")
    fields = info["fields"]
    if "workspaceId" in fields:
        return ("workspace", "has workspaceId — scope to WorkspaceMember")
    if "organizationId" in fields:
        return ("organization", "has organizationId — scope to User.organizationId")
    if "orgId" in fields:
        return ("organization", "has orgId — scope to User.organizationId")
    if "userId" in fields:
        return ("user", "has userId — scope to auth.uid()")
    # Heuristic chains
    if "inspectionId" in fields:
        return ("via-inspection", "joined through Inspection (workspace-scoped)")
    if "reportId" in fields:
        return ("via-report", "joined through Report (workspace-scoped)")
    if "clientId" in fields:
        return ("via-client", "joined through Client (workspace-scoped)")
    if "invoiceId" in fields:
        return ("via-invoice", "joined through Invoice (workspace-scoped)")
    if "estimateId" in fields:
        return ("via-estimate", "joined through Estimate")
    if "claimAnalysisId" in fields:
        return ("via-claim-analysis", "joined through ClaimAnalysis")
    if "contractorId" in fields or "contractorProfileId" in fields:
        return ("via-contractor", "joined through ContractorProfile")
    if "formSubmissionId" in fields or "formTemplateId" in fields:
        return ("via-form", "joined through FormTemplate/Submission")
    if "claimProgressId" in fields or "transitionId" in fields:
        return ("via-claim-progress", "joined through ClaimProgress (workspace-scoped)")
    if "interviewSessionId" in fields:
        return ("via-interview", "joined through InterviewSession")
    if "templateId" in fields:
        return ("via-template", "joined through workspace-scoped template")
    return ("unowned", "no ownership FK found — manual review needed")


def main():
    schema_text = SCHEMA.read_text()
    models = parse_models(schema_text)
    buckets: dict[str, list[tuple[str, str]]] = {}
    for table in sorted(set(RLS_DISABLED)):
        bucket, reason = categorise(table, models.get(table))
        buckets.setdefault(bucket, []).append((table, reason))

    lines = [
        "# RLS Categorisation — 119 prod tables (RA-4970)",
        "",
        f"**Generated:** by `scripts/rls-categorise.py` against `prisma/schema.prisma`.",
        f"**Total tables:** {len(set(RLS_DISABLED))}",
        "",
        "## Buckets",
        "",
    ]
    bucket_order = [
        "workspace", "organization", "user",
        "via-inspection", "via-report", "via-client", "via-invoice",
        "via-estimate", "via-claim-analysis", "via-contractor", "via-form",
        "via-claim-progress", "via-interview", "via-template",
        "public-ref", "service-only", "unowned", "unknown",
    ]
    for bucket in bucket_order:
        if bucket not in buckets:
            continue
        items = buckets[bucket]
        lines.append(f"### `{bucket}` ({len(items)} tables)")
        lines.append("")
        for table, reason in items:
            lines.append(f"- **{table}** — {reason}")
        lines.append("")

    lines.extend([
        "## Next steps",
        "",
        "1. Manually review `unowned` + `unknown` buckets — these need a policy decision before migration.",
        "2. For each bucket, write the policy template (see RA-4970 ticket body).",
        "3. Generate the migration: `scripts/rls-emit-migration.py` (TODO).",
        "4. Apply to sandbox first, smoke, then prod.",
    ])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")
    print(f"\nBucket sizes:")
    for bucket in bucket_order:
        if bucket in buckets:
            print(f"  {bucket}: {len(buckets[bucket])}")


if __name__ == "__main__":
    main()
