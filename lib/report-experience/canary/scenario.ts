import { createHash } from "node:crypto";
import type { ReportExperienceSnapshot, VerifiedReportProjection } from "../snapshot";

/**
 * RA-8110: the one synthetic scenario the report theme canary renders.
 *
 * Nothing here is a real customer, address, person, reading or price. The
 * estimate is a deliberately unusual sentinel so that a leak of it into a page
 * a technician can open cannot be mistaken for anything else.
 *
 * This file is DATA plus a mirror of the disclosure rule. The rule itself is
 * owned by `authoriseReportExperienceRead` and `buildReportExperienceSnapshot`;
 * `__tests__/pipeline-parity.test.ts` builds a snapshot through those real
 * functions for every audience and requires it to equal `canarySnapshot`, byte
 * for byte including the digest. If the rule changes, that test fails here
 * instead of the canary quietly testing a copy.
 */
export const CANARY_AUDIENCES = ["owner", "manager", "technician", "property-owner", "insurer"] as const;
export type CanaryAudience = (typeof CANARY_AUDIENCES)[number];

export function isCanaryAudience(value: unknown): value is CanaryAudience {
  return typeof value === "string" && (CANARY_AUDIENCES as readonly string[]).includes(value);
}

/** Who sees the price. A technician never does (RA-8494). */
export const CANARY_SEES_MONEY: Readonly<Record<CanaryAudience, boolean>> = {
  owner: true,
  manager: true,
  technician: false,
  "property-owner": true,
  insurer: true,
};

/** $76,543.21 as cents: unlike any real estimate, so any trace of it is a leak. */
export const CANARY_SENTINEL_CENTS = 7_654_321;
export const CANARY_ADDRESS = "1 Example Street, Testville QLD 4000";

export const CANARY_EVIDENCE: VerifiedReportProjection = {
  reportId: "report_canary_001",
  organisationId: "org_canary_business",
  revision: "rev-canary-1",
  revisionCreatedAt: "2026-03-10T00:00:00.000Z",
  reportNumber: "SYN-0001",
  status: "Synthetic canary",
  workspaceBrand: { businessName: "Synthetic Test Restoration Pty Ltd" },
  propertyAddress: CANARY_ADDRESS,
  safetyAssessment: "PENDING_VERIFICATION",
  hazards: [
    { id: "hz1", title: "Possible live wiring in wet wall cavity", action: "Isolate the circuit before entry", verification: "unverified" },
    { id: "hz2", title: "Wet floor in hallway", action: "Place wet-floor signage", verification: "verified" },
  ],
  moistureReadings: [
    { id: "rd1", roomId: "room_kitchen", observedAt: "2026-03-02T09:00:00.000Z", value: 36, unit: "WME" },
    { id: "rd2", roomId: "room_kitchen", observedAt: "2026-03-05T09:00:00.000Z", value: 24, unit: "WME" },
    { id: "rd3", roomId: "room_hall", observedAt: "2026-03-03T09:00:00.000Z", value: 12.4, unit: "G_PER_KG" },
  ],
  scopeItems: [
    { id: "sc1", description: "Extract standing water from kitchen", approvalStatus: "authorised" },
    { id: "sc2", description: "Remove wet plasterboard in hall", approvalStatus: "proposed" },
  ],
  financials: { estimatedTotalCents: CANARY_SENTINEL_CENTS, currency: "AUD", estimateStatus: "draft" },
  sourceRefs: [{ kind: "inspection", id: "insp_canary_1" }],
};

/** The snapshot the server would hand this audience. Key order matches the real builder so the digest matches. */
export function canarySnapshot(audience: CanaryAudience): ReportExperienceSnapshot {
  const e = CANARY_EVIDENCE;
  const body = {
    schemaVersion: 1 as const,
    reportId: e.reportId,
    organisationId: e.organisationId,
    revision: e.revision,
    revisionCreatedAt: e.revisionCreatedAt,
    reportNumber: e.reportNumber,
    status: e.status,
    brand: { businessName: e.workspaceBrand.businessName },
    propertyAddress: CANARY_ADDRESS,
    safetyAssessment: e.safetyAssessment,
    hazards: e.hazards,
    moistureReadings: e.moistureReadings,
    scopeItems: e.scopeItems,
    ...(CANARY_SEES_MONEY[audience] ? { financials: e.financials } : {}),
    sourceRefs: e.sourceRefs,
  };
  const contentDigestSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, audience, contentDigestSha256 } as ReportExperienceSnapshot;
}
