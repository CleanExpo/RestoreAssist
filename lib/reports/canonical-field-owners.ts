/**
 * V1 Phase 3 (P3-5) — which datum owns moisture / scope for reports.
 */

export const CANONICAL_REPORT_FIELD_OWNERS = {
  moistureReadings: "Inspection.moistureReading (relational; invalidated excluded)",
  scopeOfWorks: "ScopeItem + generatedNarrative",
  costEstimate: "Estimate + EstimateVersion.snapshot when approved",
  clientIdentity: "Inspection.clientId → Client (fallback Report.clientId)",
  insurerClaim: "Inspection.insurerProfileId + claimNumber",
} as const;

export type CanonicalFieldKey = keyof typeof CANONICAL_REPORT_FIELD_OWNERS;
