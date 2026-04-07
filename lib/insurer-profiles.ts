/**
 * [RA-406] Insurer Profile Templates
 * Per-insurer evidence requirements and reporting specifications.
 *
 * Six major Australian insurer profiles: IAG, Suncorp, QBE, Allianz, Zurich, AIG.
 * Each profile defines:
 *   - Required evidence classes (what the insurer demands in every claim)
 *   - Preferred evidence classes (what strengthens the claim)
 *   - Report formatting requirements (section order, mandatory sections, branding)
 *   - Claim submission preferences (file formats, naming conventions, portals)
 *   - S500:2025 compliance emphasis areas per insurer
 *
 * The guided capture workflow (Sprint G) adapts dynamically based on
 * the selected insurer profile — surfacing insurer-specific requirements
 * as mandatory steps.
 */
import type { EvidenceClass } from "@/lib/types/evidence";
import type { JobType } from "@/lib/evidence/workflow-definitions";

// ━━━ Insurer Identifiers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const INSURER_IDS = [
  "IAG",
  "SUNCORP",
  "QBE",
  "ALLIANZ",
  "ZURICH",
  "AIG",
] as const;

export type InsurerId = (typeof INSURER_IDS)[number];

/** Human-readable insurer names */
export const INSURER_LABELS: Record<InsurerId, string> = {
  IAG: "IAG (NRMA, CGU, SGIO, SGIC)",
  SUNCORP: "Suncorp (AAMI, GIO, Vero)",
  QBE: "QBE Australia",
  ALLIANZ: "Allianz Australia",
  ZURICH: "Zurich Australia",
  AIG: "AIG Australia",
};
// ━━━ Report Section Definitions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const REPORT_SECTIONS = [
  "EXECUTIVE_SUMMARY",
  "SCOPE_OF_WORKS",
  "SITE_ASSESSMENT",
  "MOISTURE_DATA",
  "THERMAL_IMAGING",
  "ENVIRONMENTAL_CONDITIONS",
  "DAMAGE_CLASSIFICATION",
  "AFFECTED_AREAS",
  "EQUIPMENT_DEPLOYMENT",
  "DRYING_PLAN",
  "CONTENTS_ASSESSMENT",
  "HEALTH_SAFETY",
  "COMPLIANCE_STATEMENT",
  "PHOTO_APPENDIX",
  "FLOOR_PLANS",
  "LAB_RESULTS",
  "COST_ESTIMATE",
  "TIMELINE",
  "RECOMMENDATIONS",
  "TECHNICIAN_CREDENTIALS",
  "CHAIN_OF_CUSTODY",
  "INSURER_DECLARATION",
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  EXECUTIVE_SUMMARY: "Executive Summary",
  SCOPE_OF_WORKS: "Scope of Works",
  SITE_ASSESSMENT: "Site Assessment",
  MOISTURE_DATA: "Moisture Mapping & Data",
  THERMAL_IMAGING: "Thermal Imaging Analysis",
  ENVIRONMENTAL_CONDITIONS: "Environmental Conditions",
  DAMAGE_CLASSIFICATION: "Damage Classification (S500)",
  AFFECTED_AREAS: "Affected Areas Register",
  EQUIPMENT_DEPLOYMENT: "Equipment Deployment Log",
  DRYING_PLAN: "Drying Plan & Goals",
  CONTENTS_ASSESSMENT: "Contents Assessment",
  HEALTH_SAFETY: "Health & Safety Compliance",
  COMPLIANCE_STATEMENT: "IICRC S500:2025 Compliance Statement",
  PHOTO_APPENDIX: "Photo Evidence Appendix",
  FLOOR_PLANS: "Floor Plans & Diagrams",
  LAB_RESULTS: "Laboratory Results",
  COST_ESTIMATE: "Cost Estimate / Variation Register",
  TIMELINE: "Project Timeline",
  RECOMMENDATIONS: "Recommendations & Next Steps",
  TECHNICIAN_CREDENTIALS: "Technician Qualifications",
  CHAIN_OF_CUSTODY: "Chain of Custody Record",
  INSURER_DECLARATION: "Insurer Declaration / Sign-Off",
};
// ━━━ Core Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** File format preferences for claim submission */
export type SubmissionFormat = "PDF" | "XLSX" | "DOCX" | "JSON" | "XML";

/** Portal submission method */
export type SubmissionMethod =
  | "EMAIL"
  | "PORTAL_UPLOAD"
  | "API"
  | "PHYSICAL_MAIL";

/** Evidence requirement level per insurer */
export interface InsurerEvidenceRequirement {
  evidenceClass: EvidenceClass;
  /** Whether this evidence is mandatory for the insurer */
  mandatory: boolean;
  /** Minimum count of items required (e.g., 3 moisture readings minimum) */
  minimumCount: number;
  /** Insurer-specific instructions for this evidence type */
  instructions: string;
  /** S500:2025 section reference relevant to this requirement */
  s500Reference?: string;
}

/** Report formatting specification per insurer */
export interface InsurerReportSpec {
  /** Ordered list of report sections the insurer requires */
  requiredSections: ReportSection[];
  /** Optional sections the insurer prefers but does not mandate */
  preferredSections: ReportSection[];
  /** Section order — defines the insurer's preferred report structure */
  sectionOrder: ReportSection[];
  /** Whether the insurer requires a cover page with their branding */
  requiresCoverPage: boolean;
  /** Insurer-specific header text for the report */
  headerText: string;
  /** Maximum report length guidance (pages) — 0 = no limit */
  maxPagesGuidance: number;
  /** Whether to include the IICRC S500:2025 compliance matrix */
  includeComplianceMatrix: boolean;
  /** Photo requirements */
  photoRequirements: {
    minimumPerRoom: number;
    requireTimestamps: boolean;
    requireGeoTags: boolean;
    requireBeforeAfter: boolean;
    maxResolutionMp: number;
  };
}
/** Claim submission preferences per insurer */
export interface InsurerSubmissionSpec {
  /** Preferred file formats for report submission */
  preferredFormats: SubmissionFormat[];
  /** Submission method */
  submissionMethod: SubmissionMethod;
  /** Portal URL (if portal-based submission) */
  portalUrl?: string;
  /** Email address for submissions (if email-based) */
  submissionEmail?: string;
  /** File naming convention — use {CLAIM_REF}, {DATE}, {TYPE} placeholders */
  fileNamingConvention: string;
  /** Maximum file size per upload in MB */
  maxFileSizeMb: number;
  /** Whether the insurer accepts combined PDF or requires separate files */
  acceptsCombinedPdf: boolean;
  /** Turnaround time expectation in business days */
  expectedTurnaroundDays: number;
}

/** Job-type-specific overrides for an insurer */
export interface InsurerJobTypeOverride {
  jobType: JobType;
  /** Additional mandatory evidence beyond the base profile */
  additionalMandatoryEvidence: EvidenceClass[];
  /** Additional report sections required for this job type */
  additionalRequiredSections: ReportSection[];
  /** Insurer-specific notes for this job type */
  notes: string;
}
/** Complete insurer profile — the main exported type */
export interface InsurerProfileTemplate {
  id: InsurerId;
  name: string;
  brands: string[];
  /** Claims system used by the insurer */
  claimsSystem: string;
  /** Australian market share estimate */
  marketShare: string;
  /** Base evidence requirements (apply to all job types) */
  evidenceRequirements: InsurerEvidenceRequirement[];
  /** Report formatting specification */
  reportSpec: InsurerReportSpec;
  /** Claim submission preferences */
  submissionSpec: InsurerSubmissionSpec;
  /** Job-type-specific overrides */
  jobTypeOverrides: InsurerJobTypeOverride[];
  /** S500:2025 compliance emphasis areas this insurer cares most about */
  s500EmphasisAreas: string[];
  /** General notes about working with this insurer */
  notes: string;
}
// ━━━ Shared Evidence Requirements ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Common baseline evidence that all Australian insurers require

const BASE_MANDATORY_EVIDENCE: InsurerEvidenceRequirement[] = [
  {
    evidenceClass: "MOISTURE_READING",
    mandatory: true,
    minimumCount: 3,
    instructions:
      "Minimum 3 readings per affected room. Include dry reference reading from unaffected area.",
    s500Reference: "S500 §10.2",
  },
  {
    evidenceClass: "PHOTO_DAMAGE",
    mandatory: true,
    minimumCount: 4,
    instructions:
      "Minimum 4 damage photos per affected room. Wide-angle + detail shots required.",
    s500Reference: "S500 §12.1",
  },
  {
    evidenceClass: "AMBIENT_ENVIRONMENTAL",
    mandatory: true,
    minimumCount: 1,
    instructions:
      "Temperature and relative humidity at time of initial inspection.",
    s500Reference: "S500 §7.3",
  },
  {
    evidenceClass: "AUTHORITY_FORM",
    mandatory: true,
    minimumCount: 1,
    instructions: "Signed authority to proceed / access authorisation form.",
  },
  {
    evidenceClass: "SCOPE_DOCUMENT",
    mandatory: true,
    minimumCount: 1,
    instructions: "Detailed scope of works aligned with insurer requirements.",
  },
];
/** Standard report section order used as fallback */
const STANDARD_SECTION_ORDER: ReportSection[] = [
  "EXECUTIVE_SUMMARY",
  "SCOPE_OF_WORKS",
  "SITE_ASSESSMENT",
  "DAMAGE_CLASSIFICATION",
  "MOISTURE_DATA",
  "THERMAL_IMAGING",
  "ENVIRONMENTAL_CONDITIONS",
  "AFFECTED_AREAS",
  "EQUIPMENT_DEPLOYMENT",
  "DRYING_PLAN",
  "CONTENTS_ASSESSMENT",
  "HEALTH_SAFETY",
  "COMPLIANCE_STATEMENT",
  "COST_ESTIMATE",
  "TIMELINE",
  "RECOMMENDATIONS",
  "PHOTO_APPENDIX",
  "FLOOR_PLANS",
  "LAB_RESULTS",
  "TECHNICIAN_CREDENTIALS",
  "CHAIN_OF_CUSTODY",
  "INSURER_DECLARATION",
];
// ━━━ Insurer Profile: IAG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const IAG_PROFILE: InsurerProfileTemplate = {
  id: "IAG",
  name: "Insurance Australia Group",
  brands: ["NRMA", "CGU", "SGIO", "SGIC", "Swann"],
  claimsSystem: "Guidewire ClaimCenter",
  marketShare: "~33%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "THERMAL_IMAGE",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "IAG requires thermal imaging for all water damage claims. Minimum 2 thermal images per affected area showing moisture extent.",
      s500Reference: "S500 §10.2.4",
    },
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Detailed equipment deployment log with serial numbers, placement dates, and daily readings.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "FLOOR_PLAN",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Annotated floor plan showing moisture mapping, equipment placement, and affected areas. IAG requires this for all claims over $5,000.",
    },
    {
      evidenceClass: "PHOTO_PROGRESS",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "Progress photos at 24hr and 48hr minimum. IAG audits progress documentation frequency.",
      s500Reference: "S500 §12.4",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "DRYING_PLAN",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
    ],
    preferredSections: [
      "CONTENTS_ASSESSMENT",
      "HEALTH_SAFETY",
      "TECHNICIAN_CREDENTIALS",
      "CHAIN_OF_CUSTODY",
    ],
    sectionOrder: [
      "EXECUTIVE_SUMMARY",
      "DAMAGE_CLASSIFICATION",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "ENVIRONMENTAL_CONDITIONS",
      "AFFECTED_AREAS",
      "DRYING_PLAN",
      "EQUIPMENT_DEPLOYMENT",
      "CONTENTS_ASSESSMENT",
      "COST_ESTIMATE",
      "TIMELINE",
      "COMPLIANCE_STATEMENT",
      "HEALTH_SAFETY",
      "RECOMMENDATIONS",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
      "LAB_RESULTS",
      "TECHNICIAN_CREDENTIALS",
      "CHAIN_OF_CUSTODY",
      "INSURER_DECLARATION",
    ],
    requiresCoverPage: true,
    headerText: "Restoration Assessment Report — IAG Supplier Network",
    maxPagesGuidance: 30,
    includeComplianceMatrix: true,
    photoRequirements: {
      minimumPerRoom: 4,
      requireTimestamps: true,
      requireGeoTags: true,
      requireBeforeAfter: true,
      maxResolutionMp: 12,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF", "XLSX"],
    submissionMethod: "PORTAL_UPLOAD",
    portalUrl: "https://suppliers.iag.com.au",
    fileNamingConvention: "IAG-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 50,
    acceptsCombinedPdf: true,
    expectedTurnaroundDays: 3,
  },
  jobTypeOverrides: [
    {
      jobType: "MOULD",
      additionalMandatoryEvidence: ["LAB_RESULT", "COMPLIANCE_CERTIFICATE"],
      additionalRequiredSections: ["LAB_RESULTS", "HEALTH_SAFETY"],
      notes:
        "IAG requires independent lab results for all mould claims. Hygienist clearance certificate mandatory before sign-off.",
    },
    {
      jobType: "SEWAGE",
      additionalMandatoryEvidence: [
        "LAB_RESULT",
        "COMPLIANCE_CERTIFICATE",
        "VIDEO_WALKTHROUGH",
      ],
      additionalRequiredSections: ["LAB_RESULTS", "HEALTH_SAFETY"],
      notes:
        "Category 3 water: IAG mandates video walkthrough of affected areas plus biohazard clearance certificate.",
    },
    {
      jobType: "STORM",
      additionalMandatoryEvidence: ["THIRD_PARTY_REPORT"],
      additionalRequiredSections: [],
      notes:
        "CAT event claims: IAG may require BOM weather data as third-party report to validate storm causation.",
    },
  ],
  s500EmphasisAreas: [
    "Moisture mapping with dry reference standards (§10.2)",
    "Thermal imaging documentation (§10.2.4)",
    "Equipment deployment records with serial numbers (§11.1)",
    "Progress monitoring at minimum 24hr intervals (§12.4)",
    "Damage classification per S500 water categories (§7)",
  ],
  notes:
    "Largest insurer by claims volume. Strict on documentation completeness — incomplete reports are returned. Uses Guidewire ClaimCenter. Cover page with IAG supplier branding expected.",
};
// ━━━ Insurer Profile: Suncorp ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUNCORP_PROFILE: InsurerProfileTemplate = {
  id: "SUNCORP",
  name: "Suncorp Group",
  brands: ["AAMI", "GIO", "Bingle", "Vero"],
  claimsSystem: "Majesco Claims",
  marketShare: "~16%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "THERMAL_IMAGE",
      mandatory: false,
      minimumCount: 1,
      instructions:
        "Thermal imaging preferred but not mandatory for standard water damage. Required for claims over $10,000.",
      s500Reference: "S500 §10.2.4",
    },
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Equipment log with daily monitoring data. Suncorp audits equipment utilisation rates.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "PHOTO_COMPLETION",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "Suncorp requires completion photos for every affected room before final invoice approval.",
      s500Reference: "S500 §12.6",
    },
    {
      evidenceClass: "TECHNICIAN_NOTE",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Suncorp requires detailed technician field notes explaining restoration decisions and methodology.",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "COST_ESTIMATE",
      "COMPLIANCE_STATEMENT",
      "PHOTO_APPENDIX",
    ],
    preferredSections: [
      "THERMAL_IMAGING",
      "DRYING_PLAN",
      "CONTENTS_ASSESSMENT",
      "FLOOR_PLANS",
    ],
    sectionOrder: STANDARD_SECTION_ORDER,
    requiresCoverPage: false,
    headerText: "Restoration Report — Suncorp Supplier Panel",
    maxPagesGuidance: 25,
    includeComplianceMatrix: true,
    photoRequirements: {
      minimumPerRoom: 3,
      requireTimestamps: true,
      requireGeoTags: false,
      requireBeforeAfter: true,
      maxResolutionMp: 16,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF"],
    submissionMethod: "PORTAL_UPLOAD",
    portalUrl: "https://supplier.suncorp.com.au",
    fileNamingConvention: "SC-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 25,
    acceptsCombinedPdf: true,
    expectedTurnaroundDays: 5,
  },
  jobTypeOverrides: [
    {
      jobType: "MOULD",
      additionalMandatoryEvidence: ["LAB_RESULT"],
      additionalRequiredSections: ["LAB_RESULTS", "HEALTH_SAFETY"],
      notes:
        "Suncorp requires lab results for mould species identification on all mould remediation claims.",
    },
    {
      jobType: "STORM",
      additionalMandatoryEvidence: ["THIRD_PARTY_REPORT", "VIDEO_WALKTHROUGH"],
      additionalRequiredSections: [],
      notes:
        "QLD storm events: Suncorp requires video walkthrough and BOM data. Strong QLD presence means high storm claim volume.",
    },
    {
      jobType: "CONTENTS_ONLY",
      additionalMandatoryEvidence: ["PHOTO_COMPLETION"],
      additionalRequiredSections: ["CONTENTS_ASSESSMENT"],
      notes:
        "Suncorp contents claims require detailed before/after photo evidence for every item over $500 replacement value.",
    },
  ],
  s500EmphasisAreas: [
    "Completion documentation (§12.6)",
    "Equipment utilisation records (§11.1)",
    "Technician field notes and decision rationale",
    "Before/after photo evidence for all affected rooms",
    "Cost estimate alignment with scope of works",
  ],
  notes:
    "Strong QLD presence — high volume during storm season. Emphasis on completion documentation and cost justification. Uses Majesco Claims. Less strict on thermal imaging than IAG but more demanding on completion evidence.",
};
// ━━━ Insurer Profile: QBE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QBE_PROFILE: InsurerProfileTemplate = {
  id: "QBE",
  name: "QBE Insurance Australia",
  brands: ["QBE"],
  claimsSystem: "Guidewire ClaimCenter",
  marketShare: "~10%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "THERMAL_IMAGE",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Thermal imaging required for all commercial property claims. Residential: required for claims over $15,000.",
      s500Reference: "S500 §10.2.4",
    },
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Equipment deployment log with daily psychrometric data. QBE cross-references equipment days vs. drying goals.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "COMPLIANCE_CERTIFICATE",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "QBE requires IICRC compliance certificate or equivalent for all restoration claims over $20,000.",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "DRYING_PLAN",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "PHOTO_APPENDIX",
      "TECHNICIAN_CREDENTIALS",
    ],
    preferredSections: [
      "THERMAL_IMAGING",
      "CONTENTS_ASSESSMENT",
      "FLOOR_PLANS",
      "CHAIN_OF_CUSTODY",
    ],
    sectionOrder: STANDARD_SECTION_ORDER,
    requiresCoverPage: false,
    headerText: "Restoration Assessment — QBE Approved Supplier",
    maxPagesGuidance: 20,
    includeComplianceMatrix: true,
    photoRequirements: {
      minimumPerRoom: 3,
      requireTimestamps: true,
      requireGeoTags: false,
      requireBeforeAfter: true,
      maxResolutionMp: 12,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF", "XLSX"],
    submissionMethod: "PORTAL_UPLOAD",
    portalUrl: "https://suppliers.qbe.com.au",
    fileNamingConvention: "QBE-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 40,
    acceptsCombinedPdf: true,
    expectedTurnaroundDays: 5,
  },
  jobTypeOverrides: [
    {
      jobType: "COMMERCIAL",
      additionalMandatoryEvidence: [
        "THERMAL_IMAGE",
        "FLOOR_PLAN",
        "COMPLIANCE_CERTIFICATE",
      ],
      additionalRequiredSections: [
        "FLOOR_PLANS",
        "TECHNICIAN_CREDENTIALS",
        "CHAIN_OF_CUSTODY",
      ],
      notes:
        "QBE commercial lines are their strength. Full documentation suite required including floor plans and chain of custody.",
    },
    {
      jobType: "STRATA",
      additionalMandatoryEvidence: ["FLOOR_PLAN", "THIRD_PARTY_REPORT"],
      additionalRequiredSections: ["FLOOR_PLANS"],
      notes:
        "Strata claims: QBE requires floor plan showing common vs. lot property boundaries. Third-party building report often required.",
    },
  ],
  s500EmphasisAreas: [
    "Technician qualifications and IICRC certification (§3)",
    "Drying plan with psychrometric calculations (§10)",
    "Equipment deployment aligned to drying goals (§11.1)",
    "Compliance certification for high-value claims",
    "Commercial property documentation standards",
  ],
  notes:
    "Commercial lines focus — stronger in strata and commercial restoration. Same Guidewire platform as IAG. Strict on technician credentials and compliance certification. Cross-references equipment days against drying plan goals.",
};
// ━━━ Insurer Profile: Allianz ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLIANZ_PROFILE: InsurerProfileTemplate = {
  id: "ALLIANZ",
  name: "Allianz Australia Insurance",
  brands: ["Allianz"],
  claimsSystem: "Proprietary (Guidewire transition in progress)",
  marketShare: "~9%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Equipment log with daily monitoring. Allianz reviews equipment utilisation efficiency.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "PHOTO_PROGRESS",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Progress photos at each monitoring visit. Allianz flags claims lacking progress documentation.",
      s500Reference: "S500 §12.4",
    },
    {
      evidenceClass: "PHOTO_COMPLETION",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "Completion photos for every affected area before equipment removal.",
      s500Reference: "S500 §12.6",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "COST_ESTIMATE",
      "COMPLIANCE_STATEMENT",
      "PHOTO_APPENDIX",
    ],
    preferredSections: [
      "THERMAL_IMAGING",
      "DRYING_PLAN",
      "HEALTH_SAFETY",
      "CONTENTS_ASSESSMENT",
    ],
    sectionOrder: STANDARD_SECTION_ORDER,
    requiresCoverPage: false,
    headerText: "Restoration Report — Allianz Supplier Panel",
    maxPagesGuidance: 20,
    includeComplianceMatrix: false,
    photoRequirements: {
      minimumPerRoom: 3,
      requireTimestamps: true,
      requireGeoTags: false,
      requireBeforeAfter: true,
      maxResolutionMp: 12,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF"],
    submissionMethod: "EMAIL",
    submissionEmail: "claims.restoration@allianz.com.au",
    fileNamingConvention: "ALZ-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 20,
    acceptsCombinedPdf: true,
    expectedTurnaroundDays: 5,
  },
  jobTypeOverrides: [
    {
      jobType: "MOULD",
      additionalMandatoryEvidence: ["LAB_RESULT", "COMPLIANCE_CERTIFICATE"],
      additionalRequiredSections: ["LAB_RESULTS", "HEALTH_SAFETY"],
      notes:
        "Allianz VIC updated mould protocols after 2022 storm season. Lab results and hygienist clearance mandatory.",
    },
    {
      jobType: "FIRE_SMOKE",
      additionalMandatoryEvidence: ["THIRD_PARTY_REPORT", "LAB_RESULT"],
      additionalRequiredSections: ["LAB_RESULTS", "HEALTH_SAFETY"],
      notes:
        "Fire/smoke claims: Allianz requires third-party cause investigation report and air quality testing results.",
    },
  ],
  s500EmphasisAreas: [
    "Progress monitoring documentation (§12.4)",
    "Completion verification (§12.6)",
    "Equipment utilisation efficiency (§11.1)",
    "Mould remediation protocols (post-2022 updates)",
    "Cost estimate alignment with damage extent",
  ],
  notes:
    "Transitioning to Guidewire — submission processes may change. VIC presence strong with updated mould protocols. Email-based submission currently. Less demanding on thermal imaging but strict on progress and completion evidence.",
};
// ━━━ Insurer Profile: Zurich ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ZURICH_PROFILE: InsurerProfileTemplate = {
  id: "ZURICH",
  name: "Zurich Australian Insurance",
  brands: ["Zurich"],
  claimsSystem: "Guidewire ClaimCenter",
  marketShare: "~5%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "THERMAL_IMAGE",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "Zurich requires thermal imaging for all commercial property claims. Residential: claims over $10,000.",
      s500Reference: "S500 §10.2.4",
    },
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Detailed equipment log. Zurich audits equipment days and cross-references with psychrometric drying calculations.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "FLOOR_PLAN",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Annotated floor plan required for all commercial claims and residential claims with 3+ affected rooms.",
    },
    {
      evidenceClass: "COMPLIANCE_CERTIFICATE",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Zurich requires IICRC compliance documentation for all restoration claims.",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "DRYING_PLAN",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
      "TECHNICIAN_CREDENTIALS",
    ],
    preferredSections: [
      "CONTENTS_ASSESSMENT",
      "HEALTH_SAFETY",
      "CHAIN_OF_CUSTODY",
      "LAB_RESULTS",
    ],
    sectionOrder: [
      "EXECUTIVE_SUMMARY",
      "DAMAGE_CLASSIFICATION",
      "SITE_ASSESSMENT",
      "SCOPE_OF_WORKS",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "ENVIRONMENTAL_CONDITIONS",
      "AFFECTED_AREAS",
      "DRYING_PLAN",
      "EQUIPMENT_DEPLOYMENT",
      "CONTENTS_ASSESSMENT",
      "HEALTH_SAFETY",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "TIMELINE",
      "RECOMMENDATIONS",
      "TECHNICIAN_CREDENTIALS",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
      "LAB_RESULTS",
      "CHAIN_OF_CUSTODY",
      "INSURER_DECLARATION",
    ],
    requiresCoverPage: true,
    headerText: "Restoration Assessment Report — Zurich Approved Contractor",
    maxPagesGuidance: 25,
    includeComplianceMatrix: true,
    photoRequirements: {
      minimumPerRoom: 4,
      requireTimestamps: true,
      requireGeoTags: true,
      requireBeforeAfter: true,
      maxResolutionMp: 16,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF", "XLSX"],
    submissionMethod: "PORTAL_UPLOAD",
    portalUrl: "https://suppliers.zurich.com.au",
    fileNamingConvention: "ZUR-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 50,
    acceptsCombinedPdf: false,
    expectedTurnaroundDays: 3,
  },
  jobTypeOverrides: [
    {
      jobType: "COMMERCIAL",
      additionalMandatoryEvidence: [
        "THERMAL_IMAGE",
        "FLOOR_PLAN",
        "VIDEO_WALKTHROUGH",
        "COMPLIANCE_CERTIFICATE",
      ],
      additionalRequiredSections: [
        "FLOOR_PLANS",
        "CHAIN_OF_CUSTODY",
        "TECHNICIAN_CREDENTIALS",
      ],
      notes:
        "Zurich commercial lines: full documentation suite including video walkthrough. Chain of custody documentation mandatory.",
    },
  ],
  s500EmphasisAreas: [
    "Thermal imaging with annotated analysis (§10.2.4)",
    "Psychrometric drying calculations (§10)",
    "Floor plan documentation (§12)",
    "Technician IICRC credentials (§3)",
    "Commercial property documentation standards",
  ],
  notes:
    "Commercial focus similar to QBE. Uses Guidewire ClaimCenter. Requires separate file uploads (no combined PDF). Strict on thermal imaging and floor plans. Cover page with Zurich branding expected.",
};
// ━━━ Insurer Profile: AIG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AIG_PROFILE: InsurerProfileTemplate = {
  id: "AIG",
  name: "AIG Australia",
  brands: ["AIG"],
  claimsSystem: "Proprietary Claims Platform",
  marketShare: "~3%",
  evidenceRequirements: [
    ...BASE_MANDATORY_EVIDENCE,
    {
      evidenceClass: "THERMAL_IMAGE",
      mandatory: true,
      minimumCount: 2,
      instructions:
        "AIG requires thermal imaging for all restoration claims regardless of value. International standard.",
      s500Reference: "S500 §10.2.4",
    },
    {
      evidenceClass: "EQUIPMENT_LOG",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Detailed equipment log. AIG requires daily monitoring with psychrometric data.",
      s500Reference: "S500 §11.1",
    },
    {
      evidenceClass: "FLOOR_PLAN",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "Annotated floor plan mandatory for all AIG claims. International documentation standard.",
    },
    {
      evidenceClass: "VIDEO_WALKTHROUGH",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "AIG requires video walkthrough of all affected areas. International claims standard.",
    },
    {
      evidenceClass: "COMPLIANCE_CERTIFICATE",
      mandatory: true,
      minimumCount: 1,
      instructions:
        "IICRC compliance certificate or equivalent international standard certification required.",
    },
    {
      evidenceClass: "CHAIN_OF_CUSTODY",
      mandatory: false,
      minimumCount: 0,
      instructions:
        "Chain of custody documentation preferred for high-value claims (>$50,000).",
    },
  ],
  reportSpec: {
    requiredSections: [
      "EXECUTIVE_SUMMARY",
      "SCOPE_OF_WORKS",
      "SITE_ASSESSMENT",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "ENVIRONMENTAL_CONDITIONS",
      "DAMAGE_CLASSIFICATION",
      "AFFECTED_AREAS",
      "EQUIPMENT_DEPLOYMENT",
      "DRYING_PLAN",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
      "TECHNICIAN_CREDENTIALS",
      "CHAIN_OF_CUSTODY",
    ],
    preferredSections: [
      "CONTENTS_ASSESSMENT",
      "HEALTH_SAFETY",
      "LAB_RESULTS",
      "INSURER_DECLARATION",
    ],
    sectionOrder: [
      "EXECUTIVE_SUMMARY",
      "SITE_ASSESSMENT",
      "DAMAGE_CLASSIFICATION",
      "SCOPE_OF_WORKS",
      "MOISTURE_DATA",
      "THERMAL_IMAGING",
      "ENVIRONMENTAL_CONDITIONS",
      "AFFECTED_AREAS",
      "DRYING_PLAN",
      "EQUIPMENT_DEPLOYMENT",
      "CONTENTS_ASSESSMENT",
      "HEALTH_SAFETY",
      "COMPLIANCE_STATEMENT",
      "COST_ESTIMATE",
      "TIMELINE",
      "RECOMMENDATIONS",
      "TECHNICIAN_CREDENTIALS",
      "CHAIN_OF_CUSTODY",
      "PHOTO_APPENDIX",
      "FLOOR_PLANS",
      "LAB_RESULTS",
      "INSURER_DECLARATION",
    ],
    requiresCoverPage: true,
    headerText: "Restoration Assessment Report — AIG Approved Provider",
    maxPagesGuidance: 0,
    includeComplianceMatrix: true,
    photoRequirements: {
      minimumPerRoom: 5,
      requireTimestamps: true,
      requireGeoTags: true,
      requireBeforeAfter: true,
      maxResolutionMp: 16,
    },
  },
  submissionSpec: {
    preferredFormats: ["PDF", "JSON"],
    submissionMethod: "PORTAL_UPLOAD",
    portalUrl: "https://claims.aig.com.au",
    fileNamingConvention: "AIG-{CLAIM_REF}-{DATE}-{TYPE}",
    maxFileSizeMb: 100,
    acceptsCombinedPdf: false,
    expectedTurnaroundDays: 3,
  },
  jobTypeOverrides: [
    {
      jobType: "COMMERCIAL",
      additionalMandatoryEvidence: ["LAB_RESULT", "THIRD_PARTY_REPORT"],
      additionalRequiredSections: [
        "LAB_RESULTS",
        "CHAIN_OF_CUSTODY",
        "INSURER_DECLARATION",
      ],
      notes:
        "AIG commercial claims follow international documentation standards. Full suite required including third-party engineering reports.",
    },
    {
      jobType: "CLANDESTINE_HAZARDOUS",
      additionalMandatoryEvidence: [
        "LAB_RESULT",
        "THIRD_PARTY_REPORT",
        "COMPLIANCE_CERTIFICATE",
      ],
      additionalRequiredSections: [
        "LAB_RESULTS",
        "HEALTH_SAFETY",
        "CHAIN_OF_CUSTODY",
      ],
      notes:
        "AIG hazardous material claims: full laboratory chain of custody, third-party hazmat assessment, and clearance certification mandatory.",
    },
  ],
  s500EmphasisAreas: [
    "International documentation standards",
    "Video walkthrough of all affected areas",
    "Thermal imaging with detailed analysis (§10.2.4)",
    "Floor plan documentation (§12)",
    "Chain of custody for evidence integrity",
    "Technician IICRC credentials (§3)",
  ],
  notes:
    "International insurer — applies stricter documentation standards than domestic insurers. Requires separate file uploads. Video walkthrough mandatory. No page limit on reports. Highest photo-per-room requirement (5). JSON submission format supported for API integration.",
};
// ━━━ Profile Registry ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** All insurer profiles indexed by ID */
export const INSURER_PROFILES: Record<InsurerId, InsurerProfileTemplate> = {
  IAG: IAG_PROFILE,
  SUNCORP: SUNCORP_PROFILE,
  QBE: QBE_PROFILE,
  ALLIANZ: ALLIANZ_PROFILE,
  ZURICH: ZURICH_PROFILE,
  AIG: AIG_PROFILE,
};

// ━━━ Utility Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get an insurer profile by ID.
 * Returns undefined if the insurer is not in the registry.
 */
export function getInsurerProfile(
  insurerId: InsurerId,
): InsurerProfileTemplate | undefined {
  return INSURER_PROFILES[insurerId];
}

/**
 * Check if a string is a valid insurer ID.
 */
export function isValidInsurerId(id: string): id is InsurerId {
  return (INSURER_IDS as readonly string[]).includes(id);
}
/**
 * Get the complete evidence requirements for an insurer + job type combination.
 * Merges base profile requirements with job-type-specific overrides.
 */
export function getEvidenceRequirements(
  insurerId: InsurerId,
  jobType?: JobType,
): InsurerEvidenceRequirement[] {
  const profile = INSURER_PROFILES[insurerId];
  if (!profile) return [];

  const baseRequirements = [...profile.evidenceRequirements];

  if (!jobType) return baseRequirements;

  const override = profile.jobTypeOverrides.find((o) => o.jobType === jobType);
  if (!override) return baseRequirements;

  // Merge: add any additional mandatory evidence from the override
  for (const evidenceClass of override.additionalMandatoryEvidence) {
    const existing = baseRequirements.find(
      (r) => r.evidenceClass === evidenceClass,
    );
    if (existing) {
      // Upgrade to mandatory if it was optional
      existing.mandatory = true;
    } else {
      // Add new mandatory requirement
      baseRequirements.push({
        evidenceClass,
        mandatory: true,
        minimumCount: 1,
        instructions: `Required by ${profile.name} for ${jobType} claims.`,
      });
    }
  }

  return baseRequirements;
}

/**
 * Get the ordered report sections for an insurer + job type combination.
 * Merges base report spec with job-type-specific additional sections.
 */
export function getReportSections(
  insurerId: InsurerId,
  jobType?: JobType,
): {
  required: ReportSection[];
  preferred: ReportSection[];
  order: ReportSection[];
} {
  const profile = INSURER_PROFILES[insurerId];
  if (!profile) {
    return { required: [], preferred: [], order: STANDARD_SECTION_ORDER };
  }

  const { requiredSections, preferredSections, sectionOrder } =
    profile.reportSpec;

  if (!jobType) {
    return {
      required: [...requiredSections],
      preferred: [...preferredSections],
      order: [...sectionOrder],
    };
  }

  const override = profile.jobTypeOverrides.find((o) => o.jobType === jobType);
  if (!override) {
    return {
      required: [...requiredSections],
      preferred: [...preferredSections],
      order: [...sectionOrder],
    };
  }

  // Merge additional required sections
  const mergedRequired = new Set([
    ...requiredSections,
    ...override.additionalRequiredSections,
  ]);
  // Remove newly required sections from preferred
  const mergedPreferred = preferredSections.filter(
    (s) => !mergedRequired.has(s),
  );

  return {
    required: Array.from(mergedRequired),
    preferred: mergedPreferred,
    order: [...sectionOrder],
  };
}
/**
 * Get mandatory evidence classes that are missing from a submission.
 * Used by the submission gate (Sprint G) to enforce insurer requirements.
 */
export function getMissingMandatoryEvidence(
  insurerId: InsurerId,
  jobType: JobType,
  submittedEvidence: { evidenceClass: EvidenceClass; count: number }[],
): {
  evidenceClass: EvidenceClass;
  required: number;
  submitted: number;
  instructions: string;
}[] {
  const requirements = getEvidenceRequirements(insurerId, jobType);
  const missing: {
    evidenceClass: EvidenceClass;
    required: number;
    submitted: number;
    instructions: string;
  }[] = [];

  for (const req of requirements) {
    if (!req.mandatory) continue;

    const submitted = submittedEvidence.find(
      (e) => e.evidenceClass === req.evidenceClass,
    );
    const submittedCount = submitted?.count ?? 0;

    if (submittedCount < req.minimumCount) {
      missing.push({
        evidenceClass: req.evidenceClass,
        required: req.minimumCount,
        submitted: submittedCount,
        instructions: req.instructions,
      });
    }
  }

  return missing;
}

/**
 * Format a claim reference according to the insurer's naming convention.
 */
export function formatClaimReference(
  insurerId: InsurerId,
  claimRef: string,
  date: Date,
  documentType: string,
): string {
  const profile = INSURER_PROFILES[insurerId];
  if (!profile) return `${claimRef}-${documentType}`;

  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");

  return profile.submissionSpec.fileNamingConvention
    .replace("{CLAIM_REF}", claimRef)
    .replace("{DATE}", dateStr)
    .replace("{TYPE}", documentType);
}

/**
 * Get all insurer profiles as a list (for UI dropdowns, etc.).
 */
export function getAllInsurerProfiles(): InsurerProfileTemplate[] {
  return INSURER_IDS.map((id) => INSURER_PROFILES[id]);
}

/**
 * Compare evidence requirements across insurers for a given job type.
 * Useful for generating a comparison matrix in the UI.
 */
export function compareInsurerRequirements(
  jobType: JobType,
): Record<
  InsurerId,
  { mandatory: EvidenceClass[]; optional: EvidenceClass[] }
> {
  const result = {} as Record<
    InsurerId,
    { mandatory: EvidenceClass[]; optional: EvidenceClass[] }
  >;

  for (const insurerId of INSURER_IDS) {
    const reqs = getEvidenceRequirements(insurerId, jobType);
    result[insurerId] = {
      mandatory: reqs.filter((r) => r.mandatory).map((r) => r.evidenceClass),
      optional: reqs.filter((r) => !r.mandatory).map((r) => r.evidenceClass),
    };
  }

  return result;
}
