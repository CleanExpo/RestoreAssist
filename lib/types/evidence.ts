/**
 * Sprint G: Inspection Intelligence — Evidence Types
 * 17 evidence classes with chain-of-custody metadata
 * IICRC S500:2025 compliant evidence tracking
 */

/** 17 evidence classes covering all restoration inspection documentation */
export const EVIDENCE_CLASSES = [
  "MOISTURE_READING",
  "THERMAL_IMAGE",
  "AMBIENT_ENVIRONMENTAL",
  "PHOTO_DAMAGE",
  "PHOTO_EQUIPMENT",
  "PHOTO_PROGRESS",
  "PHOTO_COMPLETION",
  "VIDEO_WALKTHROUGH",
  "FLOOR_PLAN",
  "SCOPE_DOCUMENT",
  "LAB_RESULT",
  "AUTHORITY_FORM",
  "EQUIPMENT_LOG",
  "TECHNICIAN_NOTE",
  "VOICE_MEMO",
  "THIRD_PARTY_REPORT",
  "COMPLIANCE_CERTIFICATE",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** Human-readable labels for evidence classes */
export const EVIDENCE_CLASS_LABELS: Record<EvidenceClass, string> = {
  MOISTURE_READING: "Moisture Reading",
  THERMAL_IMAGE: "Thermal Image",
  AMBIENT_ENVIRONMENTAL: "Ambient Environmental",
  PHOTO_DAMAGE: "Damage Photo",
  PHOTO_EQUIPMENT: "Equipment Photo",
  PHOTO_PROGRESS: "Progress Photo",
  PHOTO_COMPLETION: "Completion Photo",
  VIDEO_WALKTHROUGH: "Video Walkthrough",
  FLOOR_PLAN: "Floor Plan",
  SCOPE_DOCUMENT: "Scope Document",
  LAB_RESULT: "Lab Result",
  AUTHORITY_FORM: "Authority Form",
  EQUIPMENT_LOG: "Equipment Log",
  TECHNICIAN_NOTE: "Technician Note",
  VOICE_MEMO: "Voice Memo",
  THIRD_PARTY_REPORT: "Third-Party Report",
  COMPLIANCE_CERTIFICATE: "Compliance Certificate",
};

/** IICRC S500:2025 section references for evidence classes */
export const EVIDENCE_S500_REFS: Partial<Record<EvidenceClass, string>> = {
  MOISTURE_READING: "S500 §10.2 — Moisture assessment and monitoring",
  THERMAL_IMAGE: "S500 §10.2.4 — Infrared thermography",
  AMBIENT_ENVIRONMENTAL: "S500 §7.3 — Environmental conditions documentation",
  PHOTO_DAMAGE: "S500 §12.1 — Initial damage documentation",
  PHOTO_PROGRESS: "S500 §12.4 — Progress monitoring documentation",
  PHOTO_COMPLETION: "S500 §12.6 — Completion verification",
  EQUIPMENT_LOG: "S500 §11.1 — Equipment deployment records",
  COMPLIANCE_CERTIFICATE: "S500 §3 — Qualification and certification",
};

/** Workflow step statuses */
export type WorkflowStepStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED"
  | "BLOCKED";

/** Exception reason codes for skipped evidence */
export const EXCEPTION_REASON_CODES = [
  "ACCESS_DENIED",
  "EQUIPMENT_UNAVAILABLE",
  "SAFETY_HAZARD",
  "CLIENT_REFUSED",
  "WEATHER_CONDITIONS",
  "TIME_CONSTRAINT",
  "NOT_APPLICABLE",
  "OTHER",
] as const;

export type ExceptionReasonCode = (typeof EXCEPTION_REASON_CODES)[number];

/** Exception reason labels */
export const EXCEPTION_REASON_LABELS: Record<ExceptionReasonCode, string> = {
  ACCESS_DENIED: "Access denied to area",
  EQUIPMENT_UNAVAILABLE: "Required equipment unavailable",
  SAFETY_HAZARD: "Safety hazard prevents capture",
  CLIENT_REFUSED: "Client refused access/documentation",
  WEATHER_CONDITIONS: "Weather conditions prevent capture",
  TIME_CONSTRAINT: "Time constraint — will capture on return visit",
  NOT_APPLICABLE: "Not applicable to this job type",
  OTHER: "Other (see notes)",
};

/** Evidence categories for grouping in UI */
export const EVIDENCE_CATEGORIES = {
  MEASUREMENTS: [
    "MOISTURE_READING",
    "THERMAL_IMAGE",
    "AMBIENT_ENVIRONMENTAL",
  ] as EvidenceClass[],
  PHOTOS: [
    "PHOTO_DAMAGE",
    "PHOTO_EQUIPMENT",
    "PHOTO_PROGRESS",
    "PHOTO_COMPLETION",
  ] as EvidenceClass[],
  MEDIA: ["VIDEO_WALKTHROUGH", "VOICE_MEMO"] as EvidenceClass[],
  DOCUMENTS: [
    "FLOOR_PLAN",
    "SCOPE_DOCUMENT",
    "LAB_RESULT",
    "AUTHORITY_FORM",
    "EQUIPMENT_LOG",
    "TECHNICIAN_NOTE",
    "THIRD_PARTY_REPORT",
    "COMPLIANCE_CERTIFICATE",
  ] as EvidenceClass[],
} as const;

/** Risk tier labels */
export const RISK_TIER_LABELS: Record<number, string> = {
  1: "Standard",
  2: "Elevated — additional evidence required",
  3: "Critical — full documentation mandatory",
};
