import "server-only";
import { createHash } from "node:crypto";
import { isIssuedReportReadGrant } from "./authorise";

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

const SAFETY_ASSESSMENTS = ["NOT_ASSESSED", "PENDING_VERIFICATION", "ASSESSED"] as const;
const HAZARD_VERIFICATIONS = ["unverified", "verified", "resolved"] as const;
const READING_UNITS = ["WME", "RH_PERCENT", "G_PER_KG", "CELSIUS"] as const;
const SCOPE_APPROVALS = ["unknown", "proposed", "authorised"] as const;
const CURRENCIES = ["AUD", "NZD"] as const;
const ESTIMATE_STATUSES = ["draft", "approved"] as const;
const SOURCE_KINDS = ["inspection", "scope", "sketch", "photo", "reading"] as const;

// Every copied value is checked at runtime: TypeScript types do not stop an
// object or an unknown option from crossing this disclosure boundary.
function ensureId(value: unknown, label: string, pattern = ID): void {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("Invalid " + label);
}
function ensureText(value: unknown, label: string): void {
  if (typeof value !== "string") throw new Error("Invalid " + label);
}
function ensureOneOf(value: unknown, allowed: readonly string[], label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error("Invalid " + label);
}
function isoTime(value: unknown, label: string): number {
  if (typeof value !== "string") throw new Error("Invalid " + label);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid " + label);
  return parsed;
}

// Read a list by index into records built here. Never call the input's own
// map(): a list can replace it and return records with getters on them.
function plainList<T, R>(list: readonly T[], label: string, pick: (item: T) => R): R[] {
  if (!Array.isArray(list)) throw new Error("Invalid " + label);
  const length = list.length;
  const out: R[] = [];
  for (let i = 0; i < length; i++) out.push(pick(list[i]));
  return out;
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
  // RA-8105: only the exact grant object authoriseReportExperienceRead issued.
  if (!isIssuedReportReadGrant(grant)) throw new Error("Denied: grant not issued by the server gate");

  // Read every input value exactly once into plain data, then check and copy
  // only that data. A getter or proxy could otherwise pass a check and return
  // something else when it is copied. Name every field: a spread would also
  // copy undeclared runtime fields (a signed URL, an internal note) across
  // this disclosure boundary.
  const access = {
    reportId: grant.reportId,
    organisationId: grant.organisationId,
    audience: grant.audience,
    mayViewAddress: grant.mayViewAddress,
    mayViewFinancials: grant.mayViewFinancials,
    expiresAt: grant.expiresAt,
  };
  const brand = evidence.workspaceBrand;
  const money = evidence.financials;
  const read = {
    reportId: evidence.reportId,
    organisationId: evidence.organisationId,
    revision: evidence.revision,
    revisionCreatedAt: evidence.revisionCreatedAt,
    reportNumber: evidence.reportNumber,
    status: evidence.status,
    businessName: brand.businessName,
    approvedLogoAssetId: brand.approvedLogoAssetId,
    propertyAddress: evidence.propertyAddress,
    safetyAssessment: evidence.safetyAssessment,
    hazards: plainList(evidence.hazards, "hazards", item => ({
      id: item.id, title: item.title, action: item.action, verification: item.verification,
    })),
    moistureReadings: plainList(evidence.moistureReadings, "readings", item => ({
      id: item.id, roomId: item.roomId, observedAt: item.observedAt, value: item.value, unit: item.unit,
    })),
    scopeItems: plainList(evidence.scopeItems, "scope items", item => ({
      id: item.id, description: item.description, approvalStatus: item.approvalStatus,
    })),
    financials: money
      ? { estimatedTotalCents: money.estimatedTotalCents, currency: money.currency, estimateStatus: money.estimateStatus }
      : undefined,
    sourceRefs: plainList(evidence.sourceRefs, "source references", item => ({ kind: item.kind, id: item.id })),
  };

  ensureId(access.reportId, "grant report ID");
  ensureId(access.organisationId, "grant organisation ID");
  ensureId(read.reportId, "report ID");
  ensureId(read.organisationId, "report organisation ID");
  ensureId(read.revision, "revision", SIGNATURE_REF);
  if (access.reportId !== read.reportId || access.organisationId !== read.organisationId) {
    throw new Error("Denied: report or organisation mismatch");
  }
  // The server clock is the floor: a caller's old reference time must not extend a grant.
  const reference = Math.max(Date.now(), isoTime(nowIso, "reference time"));
  if (isoTime(access.expiresAt, "grant expiry") <= reference) {
    throw new Error("Denied: grant expired");
  }
  isoTime(read.revisionCreatedAt, "revision timestamp");
  ensureText(read.reportNumber, "report number");
  ensureText(read.status, "status");
  const businessName: unknown = read.businessName;
  if (typeof businessName !== "string" || !businessName.trim()) throw new Error("Missing authoritative organisation brand");
  if (read.propertyAddress !== undefined && read.propertyAddress !== null) {
    ensureText(read.propertyAddress, "property address");
  }
  ensureOneOf(read.safetyAssessment, SAFETY_ASSESSMENTS, "safety assessment");
  // ID.test(null) coerces null to "null" and matches, so the type is checked first.
  const logo: unknown = read.approvedLogoAssetId;
  if (logo !== undefined && (typeof logo !== "string" || !ID.test(logo))) {
    throw new Error("Invalid approved logo asset ID");
  }
  for (const source of read.sourceRefs) {
    ensureOneOf(source.kind, SOURCE_KINDS, "source kind");
    ensureId(source.id, "source ID", SIGNATURE_REF);
  }
  for (const hazard of read.hazards) {
    ensureId(hazard.id, "hazard ID");
    ensureText(hazard.title, "hazard title");
    ensureText(hazard.action, "hazard action");
    ensureOneOf(hazard.verification, HAZARD_VERIFICATIONS, "hazard verification");
  }
  for (const reading of read.moistureReadings) {
    ensureId(reading.id, "reading ID");
    ensureId(reading.roomId, "reading room ID");
    isoTime(reading.observedAt, "reading timestamp");
    if (!Number.isFinite(reading.value)) throw new Error("Invalid observed reading");
    ensureOneOf(reading.unit, READING_UNITS, "reading unit");
  }
  for (const item of read.scopeItems) {
    ensureId(item.id, "scope ID");
    ensureText(item.description, "scope description");
    ensureOneOf(item.approvalStatus, SCOPE_APPROVALS, "scope approval");
  }
  if (read.financials) {
    if (!Number.isSafeInteger(read.financials.estimatedTotalCents) || read.financials.estimatedTotalCents < 0) {
      throw new Error("Invalid money in authoritative evidence");
    }
    ensureOneOf(read.financials.currency, CURRENCIES, "currency");
    ensureOneOf(read.financials.estimateStatus, ESTIMATE_STATUSES, "estimate status");
  }

  // Copy only the checked plain data. Do not return live mutable Prisma objects.
  const body: SanitisedReportBody = {
    schemaVersion: 1,
    reportId: read.reportId,
    organisationId: read.organisationId,
    revision: read.revision,
    revisionCreatedAt: read.revisionCreatedAt,
    reportNumber: read.reportNumber,
    status: read.status,
    brand: {
      businessName: read.businessName,
      ...(read.approvedLogoAssetId !== undefined ? { approvedLogoAssetId: read.approvedLogoAssetId } : {}),
    },
    ...(access.mayViewAddress && read.propertyAddress ? { propertyAddress: read.propertyAddress } : {}),
    safetyAssessment: read.safetyAssessment,
    hazards: read.hazards,
    moistureReadings: read.moistureReadings,
    scopeItems: read.scopeItems,
    ...(access.mayViewFinancials && read.financials ? { financials: read.financials } : {}),
    sourceRefs: read.sourceRefs,
  };
  const contentDigestSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return deepFreeze({ ...body, audience: access.audience, contentDigestSha256 });
}
