import "server-only";
import { createHash } from "node:crypto";

/**
 * RA-8105: authorised data projection, not an authentication mechanism.
 *
 * Only call this after the existing server's session/share-token and
 * report-tenancy lookup have granted access to this EXACT report.
 * Never accept a ReportReadGrant from query parameters or a client payload.
 * No new database or source-of-truth for inspections is introduced.
 */
export type ReportReadGrant = Readonly<{
  reportId: string;
  organisationId: string;
  audience: "owner" | "manager" | "technician" | "property-owner" | "insurer";
  mayViewAddress: boolean;
  mayViewFinancials: boolean;
  /** Granted permissions must already have been checked against the real session/token. */
  expiresAt: string;
}>;

export type VerifiedReportProjection = Readonly<{
  reportId: string;
  organisationId: string;
  revision: string;
  revisionCreatedAt: string;
  reportNumber: string;
  status: string;
  workspaceBrand: Readonly<{ businessName: string; approvedLogoAssetId?: string }>;
  propertyAddress?: string | null;
  /** No 'safe' assumption is permitted when formal assessment is missing. */
  safetyAssessment: "NOT_ASSESSED" | "PENDING_VERIFICATION" | "ASSESSED";
  hazards: readonly Readonly<{
    id: string;
    title: string;
    action: string;
    verification: "unverified" | "verified" | "resolved";
  }>[];
  moistureReadings: readonly Readonly<{
    id: string;
    roomId: string;
    observedAt: string;
    value: number;
    unit: "WME" | "RH_PERCENT" | "G_PER_KG" | "CELSIUS";
  }>[];
  scopeItems: readonly Readonly<{
    id: string;
    description: string;
    approvalStatus: "unknown" | "proposed" | "authorised";
  }>[];
  financials?: Readonly<{ estimatedTotalCents: number; currency: "AUD" | "NZD"; estimateStatus: "draft" | "approved" }>;
  sourceRefs: readonly Readonly<{ kind: "inspection" | "scope" | "sketch" | "photo" | "reading"; id: string }>[];
}>;

type SanitisedReportBody = Readonly<{
  schemaVersion: 1;
  reportId: string;
  organisationId: string;
  revision: string;
  revisionCreatedAt: string;
  reportNumber: string;
  status: string;
  brand: { businessName: string; approvedLogoAssetId?: string };
  propertyAddress?: string;
  safetyAssessment: VerifiedReportProjection["safetyAssessment"];
  hazards: VerifiedReportProjection["hazards"];
  moistureReadings: VerifiedReportProjection["moistureReadings"];
  scopeItems: VerifiedReportProjection["scopeItems"];
  financials?: VerifiedReportProjection["financials"];
  sourceRefs: VerifiedReportProjection["sourceRefs"];
}>;

export type ReportExperienceSnapshot = Readonly<SanitisedReportBody & {
  audience: ReportReadGrant["audience"];
  /** Digest of the permission-specific material, not a replacement for signed source evidence. */
  contentDigestSha256: string;
}>;

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SIGNATURE_REF = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,200}$/;

function ensureId(value: string, label: string, pattern = ID): void {
  if (!pattern.test(value)) throw new Error("Invalid " + label);
}
function isoTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid " + label);
  return parsed;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

export function buildReportExperienceSnapshot(
  evidence: VerifiedReportProjection,
  grant: ReportReadGrant,
  nowIso: string,
): ReportExperienceSnapshot {
  ensureId(grant.reportId, "grant report ID");
  ensureId(grant.organisationId, "grant organisation ID");
  ensureId(evidence.reportId, "report ID");
  ensureId(evidence.organisationId, "report organisation ID");
  ensureId(evidence.revision, "revision", SIGNATURE_REF);
  if (grant.reportId !== evidence.reportId || grant.organisationId !== evidence.organisationId) {
    throw new Error("Denied: report or organisation mismatch");
  }
  if (isoTime(grant.expiresAt, "grant expiry") <= isoTime(nowIso, "reference time")) {
    throw new Error("Denied: grant expired");
  }
  isoTime(evidence.revisionCreatedAt, "revision timestamp");
  if (!evidence.workspaceBrand.businessName.trim()) throw new Error("Missing authoritative organisation brand");
  if (evidence.workspaceBrand.approvedLogoAssetId) ensureId(evidence.workspaceBrand.approvedLogoAssetId, "approved logo asset ID");
  for (const source of evidence.sourceRefs) ensureId(source.id, "source ID", SIGNATURE_REF);
  for (const hazard of evidence.hazards) ensureId(hazard.id, "hazard ID");
  for (const reading of evidence.moistureReadings) {
    ensureId(reading.id, "reading ID");
    ensureId(reading.roomId, "reading room ID");
    isoTime(reading.observedAt, "reading timestamp");
    if (!Number.isFinite(reading.value)) throw new Error("Invalid observed reading");
  }
  for (const item of evidence.scopeItems) ensureId(item.id, "scope ID");
  if (evidence.financials && (!Number.isSafeInteger(evidence.financials.estimatedTotalCents) || evidence.financials.estimatedTotalCents < 0)) {
    throw new Error("Invalid money in authoritative evidence");
  }

  // Clone the authorised projection. Do not return live mutable Prisma objects.
  const body: SanitisedReportBody = {
    schemaVersion: 1,
    reportId: evidence.reportId,
    organisationId: evidence.organisationId,
    revision: evidence.revision,
    revisionCreatedAt: evidence.revisionCreatedAt,
    reportNumber: evidence.reportNumber,
    status: evidence.status,
    brand: { ...evidence.workspaceBrand },
    ...(grant.mayViewAddress && evidence.propertyAddress ? { propertyAddress: evidence.propertyAddress } : {}),
    safetyAssessment: evidence.safetyAssessment,
    hazards: evidence.hazards.map(item => ({ ...item })),
    moistureReadings: evidence.moistureReadings.map(item => ({ ...item })),
    scopeItems: evidence.scopeItems.map(item => ({ ...item })),
    ...(grant.mayViewFinancials && evidence.financials ? { financials: { ...evidence.financials } } : {}),
    sourceRefs: evidence.sourceRefs.map(item => ({ ...item })),
  };
  const contentDigestSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return deepFreeze({ ...body, audience: grant.audience, contentDigestSha256 });
}
