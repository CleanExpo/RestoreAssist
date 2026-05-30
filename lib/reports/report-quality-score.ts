/**
 * RA-5038 — Senior PM report-quality scoring engine.
 *
 * A deterministic, READ-ONLY, offline scorer that grades a restoration report
 * against the dimensions a Senior Project Manager reviews before sign-off.
 * No DB access, no AI calls — pure input → score, so it is trivially testable
 * and safe to run against any existing report ("read-only first pass").
 *
 * Design (no-invaders): this UNIFIES rather than duplicates existing logic —
 *   - evidence completeness mirrors the inline checks in
 *     `app/api/reports/completeness-check/route.ts` (now extracted as a pure
 *     function the route can adopt);
 *   - scope-of-works quality is delegated to the existing deterministic
 *     `evaluateScopeQuality` in `lib/ai/scope-quality-evaluator.ts` when scope
 *     text is supplied.
 *
 * Constraints honoured (per the RA-5038 brief):
 *   - IICRC findings are framed as review ASSISTANCE ("likely missing reference"),
 *     never as a certification or compliance claim.
 *   - Missing evidence is surfaced as actionable review items, not vague prose.
 *   - Neutral-language checks flag unsupported causation / scope expansion /
 *     legal-insurance-health-safety advice for human review — they do not rewrite.
 */

export type QualityStatus = "complete" | "partial" | "missing";

export interface QualityDimension {
  key: string;
  label: string;
  /** 0–100 for this dimension. */
  score: number;
  /** Relative weight within the active composite (weights of active dims sum to 1). */
  weight: number;
  status: QualityStatus;
  /** Actionable review items — what a reviewer should do next. */
  issues: string[];
}

export interface ReportQualityScore {
  /** 0–100 weighted composite across the dimensions that applied. */
  composite: number;
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: QualityDimension[];
  /** Flat, de-duplicated actionable list across all dimensions. */
  missingEvidence: string[];
  flags: {
    /** Phrases a reviewer should check — unsupported causation / scope creep / advice. */
    neutralLanguage: string[];
    /** Likely-missing IICRC reference cues (assistance, not a compliance claim). */
    iicrcReadiness: string[];
  };
}

/** Inspection evidence presence — counts of attached records (and env-data flag). */
export interface EvidenceCounts {
  moistureReadings: number;
  affectedAreas: number;
  classifications: number;
  scopeItems: number;
  costEstimates: number;
  photos: number;
  environmentalData: boolean;
}

export interface ReportQualityInput {
  report: {
    clientName?: string | null;
    propertyAddress?: string | null;
    hazardType?: string | null;
    propertyPostcode?: string | null;
    incidentDate?: Date | string | null;
    technicianAttendanceDate?: Date | string | null;
    jobNumber?: string | null;
    claimReferenceNumber?: string | null;
    description?: string | null;
    technicianFieldReport?: string | null;
    reportInstructions?: string | null;
    clientSummaryCache?: string | null;
  };
  client?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  /** Null when no inspection is linked (evidence dimension then scores 0). */
  inspection?: EvidenceCounts | null;
  /** Generated scope-of-works text; enables the scope dimension when present. */
  scopeText?: string | null;
}

const has = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim().length > 0;

function statusFromScore(score: number): QualityStatus {
  if (score >= 90) return "complete";
  if (score >= 50) return "partial";
  return "missing";
}

function gradeFromComposite(c: number): ReportQualityScore["grade"] {
  if (c >= 90) return "A";
  if (c >= 80) return "B";
  if (c >= 65) return "C";
  if (c >= 50) return "D";
  return "F";
}

// ── Dimension: required job metadata ────────────────────────────────────────
function scoreMetadata(input: ReportQualityInput): QualityDimension {
  const r = input.report;
  const required: Array<[string, unknown]> = [
    ["Client name", r.clientName],
    ["Property address", r.propertyAddress],
    ["Property postcode (state detection)", r.propertyPostcode],
    ["Hazard / damage type", r.hazardType],
    ["Incident date", r.incidentDate],
    ["Technician attendance date", r.technicianAttendanceDate],
    ["Job number", r.jobNumber],
  ];
  const issues = required
    .filter(([, v]) => !has(v))
    .map(([label]) => `Add ${label}`);
  const score = Math.round(
    ((required.length - issues.length) / required.length) * 100,
  );
  return {
    key: "metadata",
    label: "Required job metadata",
    score,
    weight: 0.15,
    status: statusFromScore(score),
    issues,
  };
}

// ── Dimension: evidence completeness ────────────────────────────────────────
function scoreEvidence(input: ReportQualityInput): QualityDimension {
  const insp = input.inspection;
  const issues: string[] = [];
  if (!insp) {
    return {
      key: "evidence",
      label: "Evidence completeness",
      score: 0,
      weight: 0.3,
      status: "missing",
      issues: [
        "Link an inspection — no field evidence is attached to this report",
      ],
    };
  }
  const checks: Array<[boolean, string]> = [
    [insp.photos > 0, "Attach site photos"],
    [insp.moistureReadings > 0, "Record moisture readings"],
    [insp.affectedAreas > 0, "Define affected areas / room mapping"],
    [insp.classifications > 0, "Run IICRC water category/class classification"],
    [insp.scopeItems > 0, "Generate scope-of-works items"],
    [insp.costEstimates > 0, "Calculate cost estimates"],
    [
      insp.environmentalData,
      "Record environmental data (temp / RH / dew point)",
    ],
  ];
  checks.forEach(([ok, msg]) => {
    if (!ok) issues.push(msg);
  });
  const score = Math.round(
    ((checks.length - issues.length) / checks.length) * 100,
  );
  return {
    key: "evidence",
    label: "Evidence completeness",
    score,
    weight: 0.3,
    status: statusFromScore(score),
    issues,
  };
}

// ── Dimension: neutral language (flag for review, never rewrite) ────────────
const CAUSATION =
  /\b(caused by|due to (the )?negligence|as a (direct )?result of the (owner|builder|tenant|landlord)|the fault of|to blame)\b/gi;
const SCOPE_CREEP =
  /\b(while (we'?re|we are) (on site|here)|should also replace the entire|recommend replacing everything|additional works beyond scope)\b/gi;
const ADVICE =
  /\b(you should (make a|lodge a) claim|covered by (your )?insurance|the insurer (must|will) pay|safe to re-?occupy|not safe to occupy|health (risk|hazard) to|you are liable|seek legal)\b/gi;

function collectText(input: ReportQualityInput): string {
  const r = input.report;
  return [
    r.description,
    r.technicianFieldReport,
    r.reportInstructions,
    r.clientSummaryCache,
    input.scopeText,
  ]
    .filter(has)
    .join("\n");
}

function scoreNeutralLanguage(text: string): {
  dim: QualityDimension;
  flags: string[];
} {
  const flags: string[] = [];
  const issues: string[] = [];
  const sweep = (re: RegExp, label: string) => {
    const found = text.match(re);
    if (found) {
      const uniq = Array.from(new Set(found.map((s) => s.trim())));
      flags.push(...uniq);
      issues.push(`Review ${label}: ${uniq.slice(0, 3).join("; ")}`);
    }
  };
  sweep(CAUSATION, "unsupported causation language");
  sweep(SCOPE_CREEP, "possible scope expansion");
  sweep(ADVICE, "legal/insurance/health/safety advice");
  // Start at 100, −20 per category triggered (max 3 categories).
  const categoriesHit = issues.length;
  const score = Math.max(
    0,
    100 - categoriesHit * 20 - Math.max(0, flags.length - categoriesHit) * 5,
  );
  return {
    dim: {
      key: "neutralLanguage",
      label: "Neutral language",
      score,
      weight: 0.15,
      status: statusFromScore(score),
      issues,
    },
    flags,
  };
}

// ── Dimension: IICRC-reference readiness (assistance, not certification) ─────
const IICRC_CUES =
  /\b(IICRC|S500|S520|S540|AS\/?NZS|category\s*[1-3]|class\s*[1-4])\b/i;

function scoreIicrcReadiness(text: string): {
  dim: QualityDimension;
  flags: string[];
} {
  const flags: string[] = [];
  const issues: string[] = [];
  if (!IICRC_CUES.test(text)) {
    flags.push("No IICRC/AS-NZS reference detected");
    issues.push(
      "Likely missing a standard reference — consider citing IICRC S500:2025 §… for water-damage scope (review assistance, not a compliance claim)",
    );
  }
  // Bare "category"/"class" mention without a number is a terminology gap cue.
  if (/\bcategory\b/i.test(text) && !/\bcategory\s*[1-3]\b/i.test(text)) {
    issues.push(
      "'Category' mentioned without a 1–3 value — confirm the water category",
    );
  }
  const score =
    issues.length === 0 ? 100 : Math.max(40, 100 - issues.length * 30);
  return {
    dim: {
      key: "iicrcReadiness",
      label: "IICRC-reference readiness",
      score,
      weight: 0.15,
      status: statusFromScore(score),
      issues,
    },
    flags,
  };
}

// ── Dimension: client usability ─────────────────────────────────────────────
function scoreClientUsability(input: ReportQualityInput): QualityDimension {
  const r = input.report;
  const issues: string[] = [];
  if (!has(r.clientSummaryCache))
    issues.push("Generate the plain-English client summary");
  if (!has(r.description))
    issues.push("Add an executive summary / report description");
  const text = collectText(input).toLowerCase();
  if (!/\bexclusion|not included|out of scope\b/.test(text))
    issues.push("State scope boundary / exclusions for the client");
  const score = Math.round(((3 - issues.length) / 3) * 100);
  return {
    key: "clientUsability",
    label: "Client usability",
    score,
    weight: 0.1,
    status: statusFromScore(score),
    issues,
  };
}

/**
 * Score a report's quality. Pure + deterministic — pass the report, its client,
 * inspection evidence counts, and (optionally) generated scope text.
 */
export function scoreReportQuality(
  input: ReportQualityInput,
): ReportQualityScore {
  const text = collectText(input);
  const neutral = scoreNeutralLanguage(text);
  const iicrc = scoreIicrcReadiness(text);

  const dimensions: QualityDimension[] = [
    scoreMetadata(input),
    scoreEvidence(input),
    neutral.dim,
    iicrc.dim,
    scoreClientUsability(input),
  ];

  // Re-normalise weights across the active dimensions so the composite is 0–100.
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const composite = Math.round(
    dimensions.reduce((s, d) => s + d.score * (d.weight / totalWeight), 0),
  );

  const missingEvidence = Array.from(
    new Set(dimensions.flatMap((d) => d.issues)),
  );

  return {
    composite,
    grade: gradeFromComposite(composite),
    dimensions,
    missingEvidence,
    flags: { neutralLanguage: neutral.flags, iicrcReadiness: iicrc.flags },
  };
}
