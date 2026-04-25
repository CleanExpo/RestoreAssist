/**
 * Deskilling Scorecard — Types (RA-1135)
 *
 * 4-tier KPI framework that measures whether "AI Carries the Smart" is working.
 * Baselines from admin-burden forensic audit 2026-04-17.
 */

// ─── BASELINE & TARGET CONSTANTS ──────────────────────────────────────────────

export const SCORECARD_BASELINES = {
  tier1_qualityDelta: 28, // points: senior avg score − junior avg score (pre-Live-Teacher)
  tier2_seniorMinutes: 85, // minutes to submission for senior tech
  tier2_juniorMinutes: 120, // minutes to submission for junior tech
  tier3_errorRate: 0.3, // ~30% scope/equipment/timeline error rate
  tier4_complianceRate: 0.2, // ~20% compliance flags caught
} as const;

export const SCORECARD_TARGETS = {
  tier1_qualityDelta: 5, // <5 points gap by Live Teacher P3 GA
  tier2_minutes: 55, // 55 min for both junior and senior
  tier3_errorRate: 0.05, // <5% error rate
  tier4_complianceRate: 1.0, // 100% compliance flags caught
} as const;

// ─── TIER RESULT TYPES ────────────────────────────────────────────────────────

/** Tier 1 — Junior vs Senior Quality Delta (North Star) */
export interface Tier1Result {
  seniorAvgScore: number; // 0–100
  juniorAvgScore: number; // 0–100
  delta: number; // seniorAvgScore − juniorAvgScore
  sampleSize: { senior: number; junior: number };
  measuredAt: string; // ISO timestamp
  source: "ai-audit"; // populated by monthly audit-automation
}

/** Tier 2 — Time-to-submission (minutes per inspection) */
export interface Tier2Result {
  seniorAvgMinutes: number;
  juniorAvgMinutes: number;
  sampleSize: { senior: number; junior: number };
  measuredAt: string;
  source: "live-data"; // computed from LiveTeacherSession + Inspection.submittedAt
}

/** Tier 3 — Scope/equipment/timeline error rate */
export interface Tier3Result {
  errorRate: number; // 0..1
  sampledCount: number;
  flaggedCount: number;
  measuredAt: string;
  source: "ai-audit";
}

/** Tier 4 — Compliance flags caught rate */
export interface Tier4Result {
  catchRate: number; // 0..1
  sampledCount: number;
  caughtCount: number;
  measuredAt: string;
  source: "ai-audit";
}

// ─── AGGREGATE SCORECARD ──────────────────────────────────────────────────────

export interface DeskillingScorecardSnapshot {
  /** ISO date-range of the data window (90-day rolling unless overridden) */
  windowStart: string;
  windowEnd: string;
  generatedAt: string;

  tier1: Tier1Result | null; // null until first AI audit runs
  tier2: Tier2Result | null;
  tier3: Tier3Result | null; // null until first AI audit runs
  tier4: Tier4Result | null; // null until first AI audit runs
}

// ─── TECHNICIAN RECORD ────────────────────────────────────────────────────────

export interface TechnicianScorecardEntry {
  userId: string;
  displayName: string; // anonymised label e.g. "Tech #7"
  isJunior: boolean;
  avgSubmissionMinutes: number | null;
  reportCount: number;
  // Populated by audit run:
  avgQualityScore: number | null;
  avgErrorRate: number | null;
  avgComplianceRate: number | null;
}

// ─── AUDIT REPORT ─────────────────────────────────────────────────────────────

export interface AuditReportResult {
  inspectionId: string;
  qualityScore: number; // 0–100 (blind review by Claude)
  hasErrors: boolean; // scope/equipment/timeline discrepancy found
  complianceFlagsCaught: boolean; // mandatory compliance fields present
  reviewSummary: string; // <50 words
}
