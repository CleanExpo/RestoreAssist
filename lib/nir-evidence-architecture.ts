/**
 * NIR Evidence Architecture
 *
 * Every quantitative claim in RestoreAssist materials is classified here as:
 *   SOURCED    — backed by external published data (cite the source)
 *   HYPOTHESIS — working estimate with a defined Phase 2 measurement plan
 *   DERIVED    — calculated from other sourced/validated inputs
 *
 * Critique addressed: C2 — Cost savings figures cited as facts with no source
 *
 * IMPORTANT: No HYPOTHESIS claim should appear in customer-facing materials
 * until it has been promoted to VALIDATED through pilot measurement.
 * See: docs/CONTENT-GATE.md
 */

export type EvidenceStatus = "SOURCED" | "HYPOTHESIS" | "DERIVED" | "VALIDATED";

export interface EvidenceClaim {
  id: string;
  claim: string;
  value: string | number;
  status: EvidenceStatus;
  source?: string;
  hypothesis?: {
    measurementMethod: string;
    sampleSize: string;
    measurementPhase: "Phase 2 pilot";
    successCriteria: string;
  };
  lastUpdated: string;
  notes?: string;
}

/**
 * The canonical evidence register for all quantitative NIR claims.
 * This is the single source of truth — marketing materials must
 * reference this, not maintain their own figures.
 */
export const EVIDENCE_REGISTER: EvidenceClaim[] = [
  {
    id: "CLAIM-001",
    claim: "Annual Australian restoration/remediation claims volume",
    value: "250,000",
    status: "SOURCED",
    source:
      "Insurance Council of Australia Annual Claims Report. Range: 230,000–280,000. Update annually.",
    lastUpdated: "2026-03",
  },
  {
    id: "CLAIM-002",
    claim: "Per-claim cost impact from report format fragmentation",
    value: "$1,800–$4,200 (mid-point $3,000)",
    status: "HYPOTHESIS",
    hypothesis: {
      measurementMethod:
        "Track re-inspection costs, adjuster time (timed sessions), dispute resolution time across 50 pilot claims vs. 50 control claims using existing formats.",
      sampleSize: "50 NIR pilot claims + 50 control claims",
      measurementPhase: "Phase 2 pilot",
      successCriteria:
        "Measured cost difference is statistically significant (p<0.05)",
    },
    lastUpdated: "2026-03",
    notes:
      "DO NOT cite as fact in customer materials until VALIDATED. Use range and label as pilot hypothesis.",
  },
  {
    id: "CLAIM-003",
    claim: "Re-inspection rate for non-standardised reports",
    value: "15–25%",
    status: "HYPOTHESIS",
    hypothesis: {
      measurementMethod:
        "Count re-inspection work orders per claim across pilot cohort. Compare NIR vs. control group.",
      sampleSize: "50 NIR + 50 control claims",
      measurementPhase: "Phase 2 pilot",
      successCriteria:
        "NIR re-inspection rate <10%, control rate measured for baseline",
    },
    lastUpdated: "2026-03",
    notes:
      "DO NOT cite as established industry fact. State as practitioner-reported estimate pending validation.",
  },
  {
    id: "CLAIM-004",
    claim: "Insurance adjuster time to decode non-standardised report",
    value: "90–180 minutes",
    status: "HYPOTHESIS",
    hypothesis: {
      measurementMethod:
        "Timed adjuster review sessions: NIR vs. 3 different company-specific formats. n=6 adjusters, 5 reports each format.",
      sampleSize: "6 adjusters × 20 reports = 120 timed sessions",
      measurementPhase: "Phase 2 pilot",
      successCriteria:
        "NIR average review time <45 minutes; >30% reduction vs. control formats",
    },
    lastUpdated: "2026-03",
  },
  {
    id: "CLAIM-005",
    claim: "Technician ease-of-use rating for NIR mobile form",
    value: "85%+ rating 4 or 5 out of 5",
    status: "HYPOTHESIS",
    hypothesis: {
      measurementMethod:
        "5-point post-use survey after first 3 inspections. Minimum 20 technician respondents.",
      sampleSize: "Minimum 20 technicians across pilot companies",
      measurementPhase: "Phase 2 pilot",
      successCriteria: "≥85% of respondents rate ease of use 4 or 5",
    },
    lastUpdated: "2026-03",
  },
  {
    id: "CLAIM-006",
    claim: "Industry-wide annual savings from NIR adoption",
    value: "$625M–$1.25B",
    status: "DERIVED",
    source:
      "Derived: CLAIM-001 (claims volume) × CLAIM-002 (per-claim saving). Will be updated when CLAIM-002 is validated.",
    lastUpdated: "2026-03",
    notes:
      "Publish as scenario model (low/mid/high), not point estimate. Always disclose derivation methodology.",
  },
  {
    id: "CLAIM-007",
    claim: "Claims cycle time reduction with NIR",
    value: "3–5 days vs. 7–14 days industry average",
    status: "HYPOTHESIS",
    hypothesis: {
      measurementMethod:
        "Track claim-open to scope-approval timeline. Pilot claims vs. same company historical average.",
      sampleSize: "50 pilot claims per company (minimum 3 companies)",
      measurementPhase: "Phase 2 pilot",
      successCriteria:
        "Median scope approval time <5 business days for NIR vs. company historical baseline",
    },
    lastUpdated: "2026-03",
  },
];

/**
 * Look up evidence status for a specific claim ID
 */
export function getClaimStatus(claimId: string): EvidenceClaim | undefined {
  return EVIDENCE_REGISTER.find((c) => c.id === claimId);
}

/**
 * Get all claims that are safe to use in customer-facing materials
 * (SOURCED or VALIDATED only — never HYPOTHESIS or DERIVED alone)
 */
export function getPublishableClaims(): EvidenceClaim[] {
  return EVIDENCE_REGISTER.filter(
    (c) => c.status === "SOURCED" || c.status === "VALIDATED",
  );
}

/**
 * Validate that a piece of content only uses publishable claims.
 * Pass claim IDs used in the content — throws if any are not yet publishable.
 */
export function assertClaimsPublishable(claimIds: string[]): void {
  const unpublishable = claimIds.filter((id) => {
    const claim = getClaimStatus(id);
    return (
      !claim || (claim.status !== "SOURCED" && claim.status !== "VALIDATED")
    );
  });
  if (unpublishable.length > 0) {
    throw new Error(
      `Content gate violation: The following claims are not yet validated for ` +
        `customer-facing use: ${unpublishable.join(", ")}. ` +
        `See lib/nir-evidence-architecture.ts for measurement plans.`,
    );
  }
}
