/**
 * NIR Content Gate Service
 *
 * Implements the content publication gate from docs/CONTENT-GATE.md.
 * Integrates assertClaimsPublishable() from nir-evidence-architecture.ts
 * into a typed domain-based gate system.
 *
 * Gate rule: No customer-facing content referencing NIR capabilities,
 * IICRC standards, or cost savings claims may be published until:
 *   1. All required evidence claims for that domain are SOURCED or VALIDATED
 *   2. The domain-specific certification has been obtained and recorded below
 *
 * HOW TO UPDATE CERTIFICATION STATUS:
 *   When a certification is obtained (e.g. WRT technician review complete),
 *   update the relevant entry in CERTIFICATION_STATUS below and open a PR.
 *   The PR reviewer must confirm the certification documentation exists.
 *   This creates a version-controlled audit trail — certifications cannot
 *   be silently changed in a database.
 *
 * Critique addressed: C6 — SEO content strategy runs ahead of standards proof
 */

import {
  EVIDENCE_REGISTER,
  getClaimStatus,
  getPublishableClaims,
  assertClaimsPublishable,
  type EvidenceClaim,
} from "@/lib/nir-evidence-architecture";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ContentDomain =
  | "water-damage"
  | "mould-remediation"
  | "fire-smoke"
  | "cost-savings"
  | "industry-standard";

export type GateStatus = "open" | "blocked" | "partial";

export type ContentType =
  | "blog-post"
  | "case-study"
  | "landing-page"
  | "social-post"
  | "press-release"
  | "pitch-deck"
  | "enterprise-proposal";

export interface ContentMetadata {
  domain: ContentDomain;
  contentType: ContentType;
  title: string;
  /** Claim IDs from EVIDENCE_REGISTER that this piece of content references */
  claimIds: string[];
  /** Author or system submitting content for gate check */
  submittedBy?: string;
}

export interface CertificationRecord {
  /** Whether the manual certification requirement has been met */
  certified: boolean;
  certifiedBy?: string;
  certifiedAt?: string;
  /** What certification is required (used when certified: false) */
  requirement: string;
  /** Who is responsible for obtaining/approving this certification */
  gateOwner: string;
}

export interface DomainGateConfig {
  domain: ContentDomain;
  label: string;
  description: string;
  /** Claims that must all be SOURCED or VALIDATED before content in this domain is publishable */
  requiredPublishableClaims: string[];
  /** Content types that become publishable once gate is open */
  contentTypesUnlocked: ContentType[];
}

export interface GateCheckResult {
  domain: ContentDomain;
  gateStatus: GateStatus;
  /** Specific reason the gate is blocked (empty if open) */
  blockReasons: string[];
  /** Claims that passed the publishability check */
  allowedClaims: EvidenceClaim[];
  /** Claims that failed — still HYPOTHESIS or DERIVED */
  blockedClaims: EvidenceClaim[];
  /** Whether the domain certification requirement has been met */
  certificationMet: boolean;
  certificationRecord: CertificationRecord;
  /** Actions required to open the gate */
  requiredActions: string[];
}

export interface GateClearance {
  approved: boolean;
  approvedDomains: ContentDomain[];
  blockedDomains: ContentDomain[];
  results: Record<ContentDomain, GateCheckResult>;
  /** ISO timestamp of this gate check */
  checkedAt: string;
}

// ─── DOMAIN GATE CONFIGURATION ────────────────────────────────────────────────

const DOMAIN_GATE_CONFIG: Record<ContentDomain, DomainGateConfig> = {
  "water-damage": {
    domain: "water-damage",
    label: "Water Damage Restoration",
    description:
      "Blog posts, case studies, landing pages, and social content referencing " +
      "IICRC S500 standards, water damage categories/classes, or NIR water damage capabilities.",
    requiredPublishableClaims: ["CLAIM-001"],
    contentTypesUnlocked: [
      "blog-post",
      "case-study",
      "landing-page",
      "social-post",
    ],
  },

  "mould-remediation": {
    domain: "mould-remediation",
    label: "Mould Remediation",
    description:
      "Content referencing IICRC S520 standards, mould condition classification, " +
      "containment requirements, or NIR mould remediation capabilities.",
    requiredPublishableClaims: ["CLAIM-001"],
    contentTypesUnlocked: ["blog-post", "case-study"],
  },

  "fire-smoke": {
    domain: "fire-smoke",
    label: "Fire & Smoke Restoration",
    description:
      "Content referencing IICRC S700 standards, smoke residue classification, " +
      "or NIR fire and smoke restoration capabilities.",
    requiredPublishableClaims: ["CLAIM-001"],
    contentTypesUnlocked: ["blog-post", "case-study"],
  },

  "cost-savings": {
    domain: "cost-savings",
    label: "Cost & Savings Claims",
    description:
      "Content citing NIR cost savings figures, claims cycle time reduction, " +
      "adjuster time savings, or any quantitative efficiency claim derived from EVIDENCE_REGISTER.",
    requiredPublishableClaims: [
      "CLAIM-001",
      "CLAIM-002",
      "CLAIM-003",
      "CLAIM-004",
      "CLAIM-005",
      "CLAIM-006",
      "CLAIM-007",
    ],
    contentTypesUnlocked: [
      "blog-post",
      "case-study",
      "landing-page",
      "pitch-deck",
      "enterprise-proposal",
    ],
  },

  "industry-standard": {
    domain: "industry-standard",
    label: '"Industry Standard" Claims',
    description:
      'Content claiming NIR is "the" national industry standard, referencing ' +
      "widespread adoption, or citing institutional endorsement.",
    requiredPublishableClaims: ["CLAIM-001", "CLAIM-002", "CLAIM-003"],
    contentTypesUnlocked: [
      "press-release",
      "pitch-deck",
      "enterprise-proposal",
    ],
  },
};

// ─── CERTIFICATION STATUS ─────────────────────────────────────────────────────

/**
 * Manual certification records — updated via PR when certifications are obtained.
 *
 * Current status: ALL DOMAINS BLOCKED (pre-Phase 2 pilot, no certifications yet)
 *
 * To mark a domain certified:
 *   1. Obtain the certification (see requirement field)
 *   2. Update certified: true, certifiedBy, certifiedAt below
 *   3. Open a PR — reviewer must confirm certification documentation exists
 *   4. Merge to main — gate opens for that domain
 */
const CERTIFICATION_STATUS: Record<ContentDomain, CertificationRecord> = {
  "water-damage": {
    certified: false,
    requirement:
      "S500 standards mapping in lib/nir-standards-mapping.ts reviewed and " +
      "signed off by a WRT-certified (Water Restoration Technician) IICRC technician.",
    gateOwner: "Restoration Technical Lead",
  },

  "mould-remediation": {
    certified: false,
    requirement:
      "S520 standards mapping reviewed and signed off by a CMRS (Certified Mould " +
      "Remediation Supervisor) or ASD (Applied Structural Drying) certified technician.",
    gateOwner: "Restoration Technical Lead",
  },

  "fire-smoke": {
    certified: false,
    requirement:
      "S700 standards mapping reviewed and signed off by a FSRT (Fire and Smoke " +
      "Restoration Technician) IICRC certified technician.",
    gateOwner: "Restoration Technical Lead",
  },

  "cost-savings": {
    certified: false,
    requirement:
      "Phase 2 pilot data collected: minimum 50 NIR claims measured. All CLAIM-002 " +
      "through CLAIM-007 promoted from HYPOTHESIS to VALIDATED in lib/nir-evidence-architecture.ts.",
    gateOwner: "Product Lead",
  },

  "industry-standard": {
    certified: false,
    requirement:
      "ICA (Insurance Council of Australia) working group submission lodged, " +
      "with documented engagement from at least one major insurer TPA network.",
    gateOwner: "CEO / Founder",
  },
};

// ─── GATE CHECK FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Check the gate status for a content domain.
 *
 * @param domain - The content domain to check
 * @param additionalClaimIds - Any extra claim IDs this specific piece of content references
 * @returns GateCheckResult with full status breakdown
 */
export function checkContentGate(
  domain: ContentDomain,
  additionalClaimIds: string[] = [],
): GateCheckResult {
  const config = DOMAIN_GATE_CONFIG[domain];
  const certification = CERTIFICATION_STATUS[domain];

  const allRequestedClaimIds = [
    ...new Set([...config.requiredPublishableClaims, ...additionalClaimIds]),
  ];

  const allowedClaims: EvidenceClaim[] = [];
  const blockedClaims: EvidenceClaim[] = [];
  const blockReasons: string[] = [];

  for (const id of allRequestedClaimIds) {
    const claim = getClaimStatus(id);
    if (!claim) {
      blockReasons.push(`Claim ${id} not found in EVIDENCE_REGISTER`);
      continue;
    }
    if (claim.status === "SOURCED" || claim.status === "VALIDATED") {
      allowedClaims.push(claim);
    } else {
      blockedClaims.push(claim);
      blockReasons.push(
        `${id} is ${claim.status} — "${claim.claim}" requires Phase 2 pilot validation before use in content.`,
      );
    }
  }

  // Certification is a hard blocker regardless of claim status
  if (!certification.certified) {
    blockReasons.push(
      `Domain certification not yet obtained. Required: ${certification.requirement}`,
    );
  }

  const requiredActions: string[] = [];

  if (blockedClaims.length > 0) {
    requiredActions.push(
      `Validate ${blockedClaims.length} claim(s) through Phase 2 pilot: ` +
        blockedClaims.map((c) => c.id).join(", "),
    );
  }

  if (!certification.certified) {
    requiredActions.push(
      `Obtain domain certification (owner: ${certification.gateOwner}): ${certification.requirement}`,
    );
  }

  // Gate status determination:
  //   open    — zero block reasons
  //   blocked — all requested claims blocked OR certification missing
  //   partial — some claims allowed but some blocked
  let gateStatus: GateStatus;
  if (blockReasons.length === 0) {
    gateStatus = "open";
  } else if (allowedClaims.length === 0 || !certification.certified) {
    gateStatus = "blocked";
  } else {
    gateStatus = "partial";
  }

  return {
    domain,
    gateStatus,
    blockReasons,
    allowedClaims,
    blockedClaims,
    certificationMet: certification.certified,
    certificationRecord: certification,
    requiredActions,
  };
}

/**
 * Validate a piece of content before publication.
 * Throws a ContentGateViolationError if the gate is not open.
 *
 * This is the primary function to call in any content publication workflow.
 *
 * @example
 *   await validateContentBeforePublish({
 *     domain: 'water-damage',
 *     contentType: 'blog-post',
 *     title: 'Understanding IICRC S500 Water Categories',
 *     claimIds: ['CLAIM-001'],
 *     submittedBy: 'cms-api',
 *   })
 */
export function validateContentBeforePublish(
  metadata: ContentMetadata,
): GateCheckResult {
  const result = checkContentGate(metadata.domain, metadata.claimIds);

  if (result.gateStatus === "blocked") {
    throw new ContentGateViolationError(
      `Content gate BLOCKED for domain "${metadata.domain}". ` +
        `"${metadata.title}" cannot be published. ` +
        `Required actions: ${result.requiredActions.join(" | ")}`,
      result,
    );
  }

  return result;
}

/**
 * Get a clearance report for all domains at once.
 * Used by the admin gate dashboard.
 */
export function getAllGateStatuses(): GateClearance {
  const domains = Object.keys(DOMAIN_GATE_CONFIG) as ContentDomain[];
  const results = {} as Record<ContentDomain, GateCheckResult>;

  for (const domain of domains) {
    results[domain] = checkContentGate(domain);
  }

  const approvedDomains = domains.filter(
    (d) => results[d].gateStatus === "open",
  );
  const blockedDomains = domains.filter(
    (d) => results[d].gateStatus !== "open",
  );

  return {
    approved: blockedDomains.length === 0,
    approvedDomains,
    blockedDomains,
    results,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Get only the claims that are safe to reference in any customer-facing content,
 * regardless of domain. Wraps getPublishableClaims() with domain context.
 */
export function getPublishableClaimsForDomain(
  domain: ContentDomain,
): EvidenceClaim[] {
  const config = DOMAIN_GATE_CONFIG[domain];
  return getPublishableClaims().filter((claim) =>
    config.requiredPublishableClaims.includes(claim.id),
  );
}

/** Re-export for convenience — callers can import everything from this module */
export { assertClaimsPublishable, getPublishableClaims, EVIDENCE_REGISTER };

// ─── ERROR TYPE ───────────────────────────────────────────────────────────────

export class ContentGateViolationError extends Error {
  readonly gateResult: GateCheckResult;

  constructor(message: string, gateResult: GateCheckResult) {
    super(message);
    this.name = "ContentGateViolationError";
    this.gateResult = gateResult;
  }
}
