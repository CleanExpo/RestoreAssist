/**
 * Sprint I: Evidence QA Scoring
 * [RA-411] Automatic quality scoring for evidence items.
 *
 * Scores each evidence item 0-100 based on completeness and quality
 * heuristics. Technicians see their score before leaving site so they
 * can retake poor photos or add missing metadata.
 *
 * Purely algorithmic -- no external API calls.
 */

import type { EvidenceClass } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface QAScore {
  evidenceId: string;
  score: number; // 0-100
  tier: "acceptable" | "marginal" | "rejected"; // 85+ | 70-84 | 0-69
  flags: string[]; // human-readable issues
  recommendation: string; // what to fix
}

export interface InspectionQAResult {
  inspectionId: string;
  aggregateScore: number;
  passesGate: boolean; // aggregate >= 70 AND no mandatory item < 50
  items: QAScore[];
  summary: {
    acceptable: number;
    marginal: number;
    rejected: number;
  };
}

/**
 * Minimal evidence item shape required for QA scoring.
 * Matches the Prisma EvidenceItem select used by the API route.
 */
export interface EvidenceItemForQA {
  id: string;
  evidenceClass: EvidenceClass;
  fileUrl: string | null;
  fileSizeBytes: number | null;
  description: string | null;
  capturedLat: number | null;
  capturedLng: number | null;
  capturedAt: Date | null;
  structuredData: string | null;
  /** Whether this item is linked to a mandatory workflow step */
  isMandatory?: boolean;
}

// ============================================
// HELPERS
// ============================================

/** Evidence classes that are photo-based */
const PHOTO_CLASSES: EvidenceClass[] = [
  "PHOTO_DAMAGE",
  "PHOTO_EQUIPMENT",
  "PHOTO_PROGRESS",
  "PHOTO_COMPLETION",
  "THERMAL_IMAGE",
];

/** Keywords indicating restoration context in technician notes */
const RESTORATION_KEYWORDS = [
  "water",
  "floor",
  "ceiling",
  "wall",
  "wet",
  "dry",
  "damage",
  "mould",
  "mold",
  "moisture",
  "leak",
  "drying",
  "dehumidifier",
  "fan",
  "affected",
  "contamination",
  "category",
  "class",
];

/**
 * Safely parse the structuredData JSON field.
 * Returns an empty object on parse failure.
 */
function parseStructuredData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Assign tier label from numeric score */
function tierFromScore(score: number): "acceptable" | "marginal" | "rejected" {
  if (score >= 85) return "acceptable";
  if (score >= 70) return "marginal";
  return "rejected";
}

/** Clamp score to 0-100 */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ============================================
// SCORING RULES
// ============================================

function scorePhoto(item: EvidenceItemForQA): QAScore {
  let score = 0;
  const flags: string[] = [];

  // +40: has a file URL
  if (item.fileUrl) {
    score += 40;
  } else {
    flags.push("No photo file attached");
  }

  // +20: file is not a thumbnail (> 50 KB)
  if (item.fileSizeBytes && item.fileSizeBytes > 50_000) {
    score += 20;
  } else if (item.fileSizeBytes !== null && item.fileSizeBytes <= 50_000) {
    flags.push("Photo may be too small or low resolution — retake");
  } else if (!item.fileUrl) {
    // No file at all — already flagged above
  } else {
    flags.push("Photo may be too small or low resolution — retake");
  }

  // +20: has a description/caption
  if (item.description && item.description.trim().length > 0) {
    score += 20;
  } else {
    flags.push("Add a caption describing what is visible");
  }

  // +10: has GPS coordinates
  if (item.capturedLat !== null && item.capturedLng !== null) {
    score += 10;
  } else {
    flags.push("GPS location not recorded");
  }

  // +10: GPS accuracy bonus — if structuredData contains gpsAccuracy <= 20m
  const data = parseStructuredData(item.structuredData);
  const gpsAccuracy =
    typeof data.gpsAccuracy === "number" ? data.gpsAccuracy : null;
  if (gpsAccuracy !== null && gpsAccuracy <= 20) {
    score += 10;
  }
  // Note: if GPS coords exist but no accuracy data, this 10 points is simply not awarded

  const recommendation =
    flags.length > 0
      ? flags[0] // Lead with the most impactful fix
      : "Evidence meets quality standards";

  return {
    evidenceId: item.id,
    score: clamp(score),
    tier: tierFromScore(clamp(score)),
    flags,
    recommendation,
  };
}

function scoreMoistureReading(item: EvidenceItemForQA): QAScore {
  let score = 0;
  const flags: string[] = [];
  const data = parseStructuredData(item.structuredData);

  const numericValue =
    typeof data.numericValue === "number" ? data.numericValue : null;
  const materialType =
    typeof data.materialType === "string" && data.materialType.trim()
      ? data.materialType
      : null;
  const roomLocation =
    typeof data.roomLocation === "string" && data.roomLocation.trim()
      ? data.roomLocation
      : null;

  // +40: has a numeric value
  if (numericValue !== null) {
    score += 40;
  } else {
    flags.push("Numeric moisture reading value is missing");
  }

  // +20: value in plausible range (5-100%)
  if (numericValue !== null && numericValue >= 5 && numericValue <= 100) {
    score += 20;
  } else if (numericValue !== null) {
    flags.push(
      `Moisture reading ${numericValue}% is outside plausible range (5-100)`,
    );
  }

  // +20: has room location or description
  if (
    roomLocation ||
    (item.description && item.description.trim().length > 0)
  ) {
    score += 20;
  } else {
    flags.push(
      "Record the location of this reading (room name or description)",
    );
  }

  // +10: has GPS
  if (item.capturedLat !== null && item.capturedLng !== null) {
    score += 10;
  } else {
    flags.push("GPS location not recorded");
  }

  // +10: has material type
  if (materialType) {
    score += 10;
  } else {
    flags.push("Record the material type being measured");
  }

  const recommendation =
    flags.length > 0 ? flags[0] : "Evidence meets quality standards";

  return {
    evidenceId: item.id,
    score: clamp(score),
    tier: tierFromScore(clamp(score)),
    flags,
    recommendation,
  };
}

function scoreTechnicianNote(item: EvidenceItemForQA): QAScore {
  let score = 0;
  const flags: string[] = [];

  // For technician notes, the text content lives in the description field
  const textContent = item.description?.trim() ?? "";

  // +30: has text content
  if (textContent.length > 0) {
    score += 30;
  } else {
    flags.push("Note has no text content");
  }

  // +30: text is at least 20 characters
  if (textContent.length >= 20) {
    score += 30;
  } else if (textContent.length > 0) {
    flags.push("Note is too brief — add more detail about what was observed");
  }

  // +20: contains a restoration-relevant keyword
  const lowerText = textContent.toLowerCase();
  const hasKeyword = RESTORATION_KEYWORDS.some((kw) => lowerText.includes(kw));
  if (hasKeyword) {
    score += 20;
  } else if (textContent.length > 0) {
    flags.push(
      "Include specific details about damage, materials, or conditions observed",
    );
  }

  // +10: has GPS
  if (item.capturedLat !== null && item.capturedLng !== null) {
    score += 10;
  } else {
    flags.push("GPS location not recorded");
  }

  // +10: has timestamp
  if (item.capturedAt !== null) {
    score += 10;
  } else {
    flags.push("Capture timestamp is missing");
  }

  const recommendation =
    flags.length > 0 ? flags[0] : "Evidence meets quality standards";

  return {
    evidenceId: item.id,
    score: clamp(score),
    tier: tierFromScore(clamp(score)),
    flags,
    recommendation,
  };
}

function scoreGenericEvidence(item: EvidenceItemForQA): QAScore {
  let score = 0;
  const flags: string[] = [];

  // +60: has file URL or description content
  const hasContent =
    item.fileUrl || (item.description && item.description.trim().length > 0);
  if (hasContent) {
    score += 60;
  } else {
    flags.push("No file or text content attached");
  }

  // +20: has description
  if (item.description && item.description.trim().length > 0) {
    score += 20;
  } else {
    flags.push("Add a description for this evidence item");
  }

  // +10: has GPS
  if (item.capturedLat !== null && item.capturedLng !== null) {
    score += 10;
  } else {
    flags.push("GPS location not recorded");
  }

  // +10: has timestamp
  if (item.capturedAt !== null) {
    score += 10;
  } else {
    flags.push("Capture timestamp is missing");
  }

  const recommendation =
    flags.length > 0 ? flags[0] : "Evidence meets quality standards";

  return {
    evidenceId: item.id,
    score: clamp(score),
    tier: tierFromScore(clamp(score)),
    flags,
    recommendation,
  };
}

// ============================================
// MAIN SCORING FUNCTION
// ============================================

/**
 * Score a single evidence item based on its class.
 */
export function scoreEvidenceItem(item: EvidenceItemForQA): QAScore {
  if (PHOTO_CLASSES.includes(item.evidenceClass)) {
    return scorePhoto(item);
  }

  switch (item.evidenceClass) {
    case "MOISTURE_READING":
      return scoreMoistureReading(item);
    case "TECHNICIAN_NOTE":
      return scoreTechnicianNote(item);
    default:
      return scoreGenericEvidence(item);
  }
}

/**
 * Score all evidence items for an inspection.
 *
 * @param inspectionId - The inspection these items belong to
 * @param evidenceItems - Array of evidence items to score
 * @returns Aggregate QA result with per-item scores
 */
export function scoreInspectionEvidence(
  inspectionId: string,
  evidenceItems: EvidenceItemForQA[],
): InspectionQAResult {
  if (evidenceItems.length === 0) {
    return {
      inspectionId,
      aggregateScore: 0,
      passesGate: false,
      items: [],
      summary: { acceptable: 0, marginal: 0, rejected: 0 },
    };
  }

  const items = evidenceItems.map(scoreEvidenceItem);

  const summary = {
    acceptable: items.filter((i) => i.tier === "acceptable").length,
    marginal: items.filter((i) => i.tier === "marginal").length,
    rejected: items.filter((i) => i.tier === "rejected").length,
  };

  const aggregateScore = Math.round(
    items.reduce((sum, i) => sum + i.score, 0) / items.length,
  );

  // Gate: aggregate >= 70 AND no mandatory item scores below 50
  const hasMandatoryFailure = evidenceItems.some((evidenceItem, idx) => {
    return evidenceItem.isMandatory && items[idx].score < 50;
  });

  const passesGate = aggregateScore >= 70 && !hasMandatoryFailure;

  return {
    inspectionId,
    aggregateScore,
    passesGate,
    items,
    summary,
  };
}
