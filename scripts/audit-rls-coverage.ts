/**
 * RA-4956 — Static RLS coverage auditor.
 *
 * Parses the RA-4956 tenant-scoped-RLS migration and the companion RA-4970
 * RLS-enable migration, then proves — WITHOUT a database — that the policy set
 * the migration emits actually covers every table the RLS audit says must be
 * tenant-isolated, and that no emitted policy references a phantom scoping
 * column.
 *
 * This is the always-green CI layer. The runnable proof that the policies
 * truly isolate tenants lives in `scripts/rls-harness/` (needs a live ephemeral Postgres).
 *
 * What it asserts (see audit-rls-coverage.test.ts for the executable gate):
 *   1. RLS-ENABLE invariant: every one of the 119 audited tables is named in
 *      the RA-4970 enable migration (so RLS is on → default-deny baseline).
 *   2. Policy coverage: every table the audit buckets as tenant-scoped
 *      (NOT public-ref, NOT service-only, NOT investigate-first) receives at
 *      least one RA-4956 policy.
 *   3. Scoping integrity: every emitted policy predicate references a real
 *      scoping anchor — `auth.uid()` directly, a workspace helper
 *      (is_workspace_owner / is_workspace_member), an organization lookup, or
 *      a parent-join (EXISTS … parent). No policy is `USING (true)` for an
 *      authenticated tenant table (that would be an accidental public read).
 *   4. Service-only tables stay default-deny: no ra4956_* policy is emitted
 *      for a table the audit marks service-only.
 */

import { readFileSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// ESM-safe repo root: __dirname is undefined when this module is imported by a
// natively-run ESM script (e.g. `tsx scripts/audit-rls.ts`). vitest's transform
// happens to provide __dirname, but import.meta.url works in both.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIGRATION_DIRS = [
  resolve(REPO, "prisma/migrations"),
  resolve(REPO, "docs/ops/supabase-migrations-archive"),
];

export const RA4956_MIGRATION = resolve(
  REPO,
  "prisma/migrations/20260614000000_ra_4956_tenant_scoped_rls_policies/migration.sql",
);
export const RA4970_MIGRATION = resolve(
  REPO,
  "docs/ops/supabase-migrations-archive/20260518_enable_rls_phase_1_close_anon_exposure.sql",
);
/**
 * RA-4956 follow-up: downgrades the NextAuth token tables Session/Account from
 * userId-scoped to service-only by dropping their ra4956_* policies. Its drops
 * are netted out of the RA-4956 emitted set so this gate reflects the real
 * post-follow-up RLS posture (see parseServiceOnlyDowngrade).
 */
export const RA4956_FOLLOWUP_MIGRATION = resolve(
  REPO,
  "prisma/migrations/20260615000000_ra_4956_session_account_service_only/migration.sql",
);
/**
 * PR #1326 — RLS for the 8 Sketch/Capture/Insurer/Material tables that shipped
 * after RA-4970 and were found anon-exposed. Uses its own `rask_*` emitters +
 * an ENABLE-RLS loop; the guard below asserts none of the 8 silently loses its
 * ENABLE or its policy.
 */
export const RA_SKETCH_MIGRATION = resolve(
  REPO,
  "prisma/migrations/20260615120000_ra_sketch_capture_rls/migration.sql",
);
/**
 * RA-6949/RA-6922 — enables RLS (default-deny) on ClientCommsLog and
 * FeatureEntitlement, closing the anon-key exposure the Supabase advisor
 * flagged. Picked up automatically by allRlsEnabledTables()'s directory walk;
 * exported here (mirroring the RA_SKETCH_MIGRATION precedent) so the file's
 * role in the RLS posture is discoverable from this module.
 */
export const RA_RLS_CLIENTCOMMSLOG_FEATUREENTITLEMENT_MIGRATION = resolve(
  REPO,
  "docs/ops/supabase-migrations-archive/20260705040000_ra6949_ra6922_enable_rls_clientcommslog_featureentitlement.sql",
);

/**
 * The 119 tables the Supabase advisor flagged as RLS-disabled (the audit set).
 * Mirrors `scripts/rls-categorise.py` RLS_DISABLED — kept in sync by hand; the
 * test cross-checks this list against the RA-4970 migration so drift is caught.
 */
export const AUDIT_TABLES: readonly string[] = `
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
`
  .split(/\s+/)
  .filter(Boolean);

/**
 * Tables intentionally left WITHOUT an authenticated tenant policy.
 *
 * - public-ref: anon_select (USING true) created by RA-4970 — readable on
 *   purpose; not a tenant-isolation concern.
 * - service-only: server/service-role only; RLS-enabled default-deny is the
 *   whole point — a tenant policy here would be a regression.
 * - investigate-first: present in prod but absent from prisma/schema.prisma;
 *   RA-4970 enabled RLS (default-deny) and RA-4956 deliberately adds no policy
 *   until the column shape is verified. Documented in the migration footer.
 */
export const PUBLIC_REF = new Set<string>([
  "BuildingCode",
  "CostDatabase",
  "IicrcChunk",
  "RegulatoryDocument",
  "RegulatorySection",
  "Citation",
  "InsurancePolicyRequirement",
  "ScopePricingDatabase",
  "WaterDamageClassification",
  "AbnLookupCache",
  "AuthorityFormTemplate",
  // Global release-notes table: no ownership column (id, version only); every
  // user reads the same rows. The per-user read-state join (UserReleaseSeen)
  // IS tenant-scoped. So AppRelease is reference data, not a tenant table.
  "AppRelease",
]);

export const SERVICE_ONLY = new Set<string>([
  "_prisma_migrations",
  "WebhookEvent",
  "StripeWebhookEvent",
  "CronJobRun",
  "OAuthHandoffToken",
  "AttestationConsentToken",
  "OverrideGovernanceReport",
  "SecurityEvent",
  "AuditLog",
  "ScheduledEmail",
  "PropertyLookup",
  // RA-6917: de-identified cross-org restoration data asset. Server/service-role
  // only; RLS-enabled default-deny (no tenant policy) is the whole point.
  "RestorationIncident",
  "StorageMirrorJob",
  "StorageRestoreJob",
  "HydrationJob",
  "InvoiceAuditLog",
  "AgentDefinition",
  "AgentWorkflow",
  "AgentTask",
  "AgentTaskLog",
  "EvaluationRun",
  "PromptVariant",
  "AscoraIntegration",
  "DrNrpgIntegration",
  "AscoraJob",
  "AscoraLineItem",
  "AscoraNote",
  "DrNrpgJobSync",
  "DrNrpgWebhookLog",
  // RA-6988: DR-NRPG webhook idempotency ledger — server/service-role only,
  // sibling of DrNrpgWebhookLog/DrNrpgJobSync.
  "DrNrpgWebhookEvent",
  "ProgressTelemetryEvent",
  "ContentJob",
  "ContentPost",
  "ContentAnalytics",
  "GateCheck",
  "PasswordResetToken",
  "VerificationToken",
  // NextAuth OAuth token tables — downgraded from userId-scoped to service-only
  // by the RA-4956 follow-up migration (20260615000000). They hold refresh /
  // access tokens; only server code (Postgres superuser + service role, both
  // BYPASSRLS) may touch them, so default-deny for `authenticated` is correct.
  "Account",
  "Session",
]);

/**
 * Present in prod, absent from prisma/schema.prisma — deliberately default-deny
 * (no tenant policy) until column shape is verified. From the migration footer.
 */
export const INVESTIGATE_FIRST = new Set<string>([
  "BusinessProfile",
  "EquipmentDeployment",
  "MoistureMeter",
  "Room",
  "RoomAnnotation",
]);

export interface EmittedPolicy {
  /** Table the policy targets (unquoted). */
  table: string;
  /** Which scoping anchor the predicate uses. */
  anchor:
    | "user-uid"
    | "workspace-helper"
    | "org-lookup"
    | "parent-join"
    | "none";
  /** Raw fragment the anchor was detected in (for diagnostics). */
  source: string;
}

const ANCHOR_PATTERNS: { anchor: EmittedPolicy["anchor"]; re: RegExp }[] = [
  { anchor: "workspace-helper", re: /is_workspace_(owner|member)\s*\(/ },
  { anchor: "parent-join", re: /EXISTS\s*\(\s*SELECT/i },
  { anchor: "org-lookup", re: /"organizationId"\s*=/ },
  { anchor: "user-uid", re: /auth\.uid\(\)/ },
];

function classifyAnchor(predicate: string): EmittedPolicy["anchor"] {
  for (const { anchor, re } of ANCHOR_PATTERNS) {
    if (re.test(predicate)) return anchor;
  }
  return "none";
}

/**
 * Extract the set of tables that receive at least one ra4956_* policy, along
 * with the scoping anchor of the strongest predicate seen for each table.
 *
 * Covers the three emission styles in the migration:
 *   a) generic emitters: `SELECT pg_temp.policy_*('Table'[, ...])`
 *   b) inline `CREATE POLICY "ra4956_..." ON public."Table" ... USING (...)`
 *   c) FOREACH-loop emitters over an array of table names.
 */
export function parseEmittedPolicies(sql: string): Map<string, EmittedPolicy> {
  const out = new Map<string, EmittedPolicy>();

  const upgrade = (
    table: string,
    anchor: EmittedPolicy["anchor"],
    source: string,
  ) => {
    const rank: Record<EmittedPolicy["anchor"], number> = {
      none: 0,
      "user-uid": 1,
      "org-lookup": 2,
      "workspace-helper": 3,
      "parent-join": 3,
    };
    const prev = out.get(table);
    if (!prev || rank[anchor] > rank[prev.anchor]) {
      out.set(table, { table, anchor, source });
    }
  };

  // (a) generic emitter calls. The emitter NAME tells us the anchor family;
  //     the emitter bodies (audited separately below) build the predicate.
  const emitterAnchor: Record<string, EmittedPolicy["anchor"]> = {
    policy_user_owned: "user-uid",
    policy_workspace_owned: "workspace-helper",
    policy_child_via_parent: "parent-join",
    policy_org_scoped_readonly: "org-lookup",
  };
  const emitterRe =
    /pg_temp\.(policy_user_owned|policy_workspace_owned|policy_child_via_parent|policy_org_scoped_readonly)\s*\(\s*'([^']+)'/g;
  for (const m of sql.matchAll(emitterRe)) {
    const fn = m[1];
    const table = m[2];
    upgrade(table, emitterAnchor[fn], `emitter ${fn}`);
  }

  // (b) inline CREATE POLICY "ra4956_*" ON public."Table" ... (USING|WITH CHECK)(pred)
  const inlineRe =
    /CREATE\s+POLICY\s+"ra4956_\w+"\s+ON\s+public\."([^"]+)"[\s\S]*?(?:USING|WITH\s+CHECK)\s*\(([\s\S]*?)\)\s*(?:\$q\$|;|WITH\s+CHECK)/gi;
  for (const m of sql.matchAll(inlineRe)) {
    const table = m[1];
    const predicate = m[2];
    upgrade(table, classifyAnchor(predicate), "inline CREATE POLICY");
  }

  // (c) FOREACH t IN ARRAY ARRAY[...]  — loop emitters (Contractor* tables).
  //     Associate every array member with the predicate built in that DO block.
  const foreachRe =
    /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]([\s\S]*?)END\s+LOOP/gi;
  for (const m of sql.matchAll(foreachRe)) {
    const members = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const body = m[2];
    const anchor = classifyAnchor(body);
    for (const t of members) upgrade(t, anchor, "FOREACH emitter");
  }

  return out;
}

/** Tables named in an ALTER TABLE ... ENABLE ROW LEVEL SECURITY (RA-4970). */
export function parseRlsEnabledTables(sql: string): Set<string> {
  const out = new Set<string>();
  // direct ALTER TABLE statements
  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:public\.)?["']?(\w+)["']?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
  )) {
    out.add(m[1]);
  }
  // RA-4970 uses a pg_temp.enable_rls_if_exists('Table') emitter
  for (const m of sql.matchAll(/enable_rls_if_exists\s*\(\s*'([^']+)'/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Tables a ra4956 follow-up migration downgrades to service-only (drops all
 * their ra4956_* policies). Parses table names out of the FOREACH array(s),
 * ignoring the policy-name array (`ra4956_select` …). Returns empty for any SQL
 * that is not a ra4956 policy-drop migration.
 */
export function parseServiceOnlyDowngrade(sql: string): Set<string> {
  const out = new Set<string>();
  if (!/DROP\s+POLICY/i.test(sql) || !/ra4956/.test(sql)) return out;
  for (const arr of sql.matchAll(/ARRAY\[([^\]]+)\]/g)) {
    for (const member of arr[1].matchAll(/'([^']+)'/g)) {
      if (!/^ra4956_/.test(member[1])) out.add(member[1]);
    }
  }
  return out;
}

/**
 * PR #1326 coverage: tables the sketch/capture migration ENABLEs RLS on, and
 * tables it emits a policy for (via the rask_via_parent / rask_via_grandparent
 * / rask_reference_readall emitters). A table in `enabled` but not `policied`
 * is RLS-enabled-without-a-policy = silent default-deny breakage.
 */
export function parseSketchRlsCoverage(sql: string): {
  enabled: Set<string>;
  policied: Set<string>;
} {
  const enabled = new Set<string>();
  const policied = new Set<string>();
  // The FOREACH array in the block that performs ENABLE ROW LEVEL SECURITY.
  const enableBlock = sql.match(
    /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\][\s\S]*?ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
  );
  if (enableBlock) {
    for (const m of enableBlock[1].matchAll(/'([^']+)'/g)) enabled.add(m[1]);
  }
  // Policy emitter calls — first arg is the target table.
  for (const m of sql.matchAll(
    /pg_temp\.rask_(?:via_parent|via_grandparent|reference_readall)\s*\(\s*'([^']+)'/g,
  )) {
    policied.add(m[1]);
  }
  return { enabled, policied };
}

// ───────────────────────────────────────────────────────────────────────────
// RA-6677: schema-derived RLS disposition. The original guard hardcoded a frozen
// 119-table list and never read schema.prisma, so a NEW model was invisible to
// it (the exact mechanism behind the #1326 exposure). These functions derive the
// table universe from schema.prisma and the RLS-enable posture from EVERY
// migration, so any new model that isn't dispositioned fails CI.
// ───────────────────────────────────────────────────────────────────────────

/** Every Prisma model → its table name (honouring `@@map`). */
export function schemaModels(): Map<string, string> {
  const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8");
  const out = new Map<string, string>();
  for (const block of schema.split(/\n(?=model )/)) {
    const m = block.match(/^model\s+(\w+)\s*\{/);
    if (!m) continue;
    const map = block.match(/@@map\("([^"]+)"\)/);
    out.set(m[1], map ? map[1] : m[1]);
  }
  return out;
}

/** Every table that gets ENABLE ROW LEVEL SECURITY across ALL migration files. */
export function allRlsEnabledTables(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.name.endsWith(".sql")) {
        const sql = readFileSync(p, "utf8");
        for (const m of sql.matchAll(
          /ALTER\s+TABLE\s+(?:public\.)?"?(\w+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
        )) {
          out.add(m[1]);
        }
        for (const m of sql.matchAll(/enable_rls_if_exists\s*\(\s*'(\w+)'/g)) {
          out.add(m[1]);
        }
        // FOREACH ... ENABLE ROW LEVEL SECURITY loop (the sketch migration).
        const eb = sql.match(
          /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\][\s\S]*?ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
        );
        if (eb) for (const x of eb[1].matchAll(/'(\w+)'/g)) out.add(x[1]);
      }
    }
  };
  MIGRATION_DIRS.forEach(walk);
  return out;
}

/**
 * Models audited 2026-06-15 (RA-6677) as NOT yet RLS-governed by any migration.
 * Prod anon/authenticated exposure is UNCONFIRMED (needs the Supabase advisor).
 * NONE are declared exempt without verification — each must either receive an
 * ENABLE-RLS + tenant-policy migration (then be removed from this list) or be
 * reclassified into RLS_EXEMPT with a documented reason. **This list may only
 * shrink** — the test below fails if an entry is already RLS-enabled (stale) or
 * if a brand-new un-RLS'd model appears that isn't listed here.
 */
export const PENDING_RLS = new Set<string>([
  "ActivationEvent",
  "AdminImpersonation",
  "Authorisation",
  "BrandAmbassadorPost",
  "CancellationFeedback",
  "ClaimProgress",
  "ClaimSketch",
  // RA-6996: orphan prod tables adopted into the schema (tenant data via userId/
  // inspectionId FKs). RLS tenant policies to be added with the rest under RA-6677.
  "ClientInvite",
  "CustodyEvent",
  "MobileInspection",
  "PushToken",
  "DeviceSigningKey",
  "EmailAudit",
  "EmailConnection",
  "FloorPlan",
  "FormAttachment",
  "FormAuditLog",
  "FormSignature",
  "FormSubmission",
  "FormTemplate",
  "FormTemplateVersion",
  "HistoricalJob",
  "InterviewQuestion",
  "InterviewResponse",
  "InterviewSession",
  "InterviewStandardsMapping",
  "InvoiceSequence",
  "InvoiceSyncJob",
  "InvoiceTemplate",
  "LidarScan",
  "LiveTeacherSession",
  "MakeSafeAction",
  "OAuthStateNonce",
  "ProgressAttestation",
  "ProgressTransition",
  "ScopeTemplate",
  "ScopeVariation",
  "SketchAnnotation",
  "StandardsChunk",
  "SubscriptionTier",
  "SupportTicket",
  "SwmsDraft",
  "TeacherToolCall",
  "TeacherUtterance",
  "UsageEvent",
  "VoiceNote",
  "VoiceTranscript",
  "WHSCorrectiveAction",
  "WHSIncident",
]);

/** Models verified to legitimately need no RLS (non-tenant). Keep minimal. */
export const RLS_EXEMPT = new Set<string>([]);

/**
 * Disposition of a model: "rls" (an ENABLE migration exists), "exempt", "pending",
 * or "unclassified" (a new model nobody has triaged — must fail CI).
 */
export function rlsDisposition(
  model: string,
  table: string,
  rlsEnabled: Set<string>,
): "rls" | "exempt" | "pending" | "unclassified" {
  if (rlsEnabled.has(table) || rlsEnabled.has(model)) return "rls";
  if (RLS_EXEMPT.has(model)) return "exempt";
  if (PENDING_RLS.has(model)) return "pending";
  return "unclassified";
}

/** Tables that should carry an authenticated tenant policy. */
export function tenantScopedTables(): string[] {
  return AUDIT_TABLES.filter(
    (t) =>
      !PUBLIC_REF.has(t) && !SERVICE_ONLY.has(t) && !INVESTIGATE_FIRST.has(t),
  );
}

export function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}
