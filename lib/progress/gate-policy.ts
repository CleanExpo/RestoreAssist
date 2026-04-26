/**
 * Gate Policy — RA-1389 / Motion M-14.
 *
 * 16-gate hard / soft / audit classification per UX paper §5. Every gate
 * the Progress framework checks must have an entry here so that:
 *
 *   - HARD gaps block the transition (existing behaviour)
 *   - SOFT gaps surface as nudges in the UI and are recorded on the
 *     ProgressTransition for the M-15 5% override governance review
 *   - AUDIT gaps are observed silently for telemetry but never block or
 *     surface to the user
 *
 * Adding a new gate? Add its entry here AND emit it from the relevant
 * guard via GuardResult.softGaps / auditGaps. A guard returning a gap
 * key that isn't in this catalogue is a programming error and surfaces
 * via getGatePolicy throwing in dev.
 *
 * Board reference: .claude/board-2026-04-18/00-board-minutes.md §8 M-14.
 */

import type { TransitionKey } from "./state-machine";

export type GateClassification = "HARD" | "SOFT" | "AUDIT";

export interface GateEntry {
  /** Stable gate key — emitted on telemetry, persisted on transitions. */
  key: string;
  /** Hard-block, soft-nudge, or silent-observation. */
  classification: GateClassification;
  /** Short human label for the dashboard / UI. */
  label: string;
  /** What the gate verifies (one-line). */
  description: string;
  /** Transition keys this gate applies to. Empty = global. */
  appliesTo?: TransitionKey[];
}

/**
 * 16-gate catalogue. Numbered in description order from UX paper §5.
 *
 * HARD (8): block the transition until satisfied.
 * SOFT (4): allow the transition but record + nudge.
 * AUDIT (4): allow silently; data feeds telemetry only.
 */
export const GATE_CATALOGUE: GateEntry[] = [
  // ─── HARD: carrier-authority / legal-evidence / safety ──────────────────────
  {
    key: "evidence.makesafe.complete",
    classification: "HARD",
    label: "Make-safe actions complete",
    description:
      "All applicable MakeSafeAction rows are completed (or marked not applicable).",
    appliesTo: ["attest_stabilisation"],
  },
  {
    key: "evidence.swms.signed",
    classification: "HARD",
    label: "SWMS signed",
    description: "A SwmsDraft exists for the inspection and is signed.",
    appliesTo: ["attest_stabilisation"],
  },
  {
    key: "evidence.whs.cleared",
    classification: "HARD",
    label: "WHS hold cleared",
    description: "No open HIGH/CRITICAL WHSIncident on the inspection.",
    appliesTo: ["attest_stabilisation", "whs_cleared"],
  },
  {
    key: "evidence.scope.approved",
    classification: "HARD",
    label: "Scope approved by carrier",
    description: "Approving party (carrier or insured) has approved the scope.",
    appliesTo: ["approve_scope", "commence_drying"],
  },
  {
    key: "evidence.dry.target.met",
    classification: "HARD",
    label: "Dry target met",
    description:
      "Final moisture readings are at or below the dry standard for every monitored area.",
    appliesTo: ["certify_drying"],
  },
  {
    key: "evidence.invoice.authority",
    classification: "HARD",
    label: "Invoice authority",
    description: "Carrier or insured has granted authority to invoice.",
    appliesTo: ["issue_invoice"],
  },
  {
    key: "evidence.attestor.identity",
    classification: "HARD",
    label: "Attestor identity verified",
    description:
      "ProgressAttestation row links a verified user with role + email.",
  },
  {
    key: "evidence.subcontractor.licence",
    classification: "HARD",
    label: "Subcontractor licence current (engagement-time)",
    description:
      "Authorisation.verifiedAt within 14 days AND expiresAt in the future for the engaged subcontractor (RA-1383).",
  },

  // ─── SOFT: nudge but allow ─────────────────────────────────────────────────
  {
    key: "evidence.photo.coverage",
    classification: "SOFT",
    label: "Photo coverage adequate",
    description:
      "At least one inspection photo per monitored area. Nudge — not blocking.",
  },
  {
    key: "evidence.calibration.recent",
    classification: "SOFT",
    label: "Equipment calibration recent",
    description:
      "Moisture meter / thermal camera last calibrated within the IICRC-recommended window.",
    appliesTo: ["certify_drying"],
  },
  {
    key: "evidence.equipment.paired",
    classification: "SOFT",
    label: "Equipment Bluetooth-paired",
    description:
      "Reading came from a paired meter (vs typed manually). Quality signal only.",
  },
  {
    key: "evidence.note.populated",
    classification: "SOFT",
    label: "Technician note populated",
    description:
      "ProgressTransition.note has substantive content (>= 8 chars).",
  },

  // ─── AUDIT: observed silently ──────────────────────────────────────────────
  {
    key: "evidence.weather.captured",
    classification: "AUDIT",
    label: "Weather snapshot captured",
    description:
      "BOM weather snapshot at the time of attestation (informational).",
    appliesTo: ["attest_stabilisation", "certify_drying"],
  },
  {
    key: "evidence.location.captured",
    classification: "AUDIT",
    label: "Location captured",
    description:
      "Geo-coordinates recorded on the transition (informational; off-by-default).",
  },
  {
    key: "evidence.duration.normal",
    classification: "AUDIT",
    label: "Duration within p95",
    description:
      "Wall-clock between fromState and toState falls within the p95 of historic transitions of this key.",
  },
  {
    key: "evidence.actor.role.expected",
    classification: "AUDIT",
    label: "Actor role matches RACI default",
    description:
      "Actor role matches the default RACI for this transition. Override is allowed; we just observe.",
  },
];

const GATE_BY_KEY = new Map<string, GateEntry>(
  GATE_CATALOGUE.map((g) => [g.key, g]),
);

/**
 * Look up the gate's classification. Returns null if the key is unknown
 * (programming error — guards must only emit catalogue keys).
 */
export function getGatePolicy(gateKey: string): GateClassification | null {
  return GATE_BY_KEY.get(gateKey)?.classification ?? null;
}

/** Return all gates by classification. */
export function gatesByClassification(c: GateClassification): GateEntry[] {
  return GATE_CATALOGUE.filter((g) => g.classification === c);
}

/** Return the gate entry for a key, or null. */
export function getGate(gateKey: string): GateEntry | null {
  return GATE_BY_KEY.get(gateKey) ?? null;
}

/**
 * Filter a flat list of detected gap keys into hard / soft / audit
 * buckets per the catalogue. Unknown keys are returned in `unknown` —
 * callers should treat unknown as a programming error and surface it.
 */
export function classifyGaps(gapKeys: string[]): {
  hard: string[];
  soft: string[];
  audit: string[];
  unknown: string[];
} {
  const hard: string[] = [];
  const soft: string[] = [];
  const audit: string[] = [];
  const unknown: string[] = [];
  for (const k of gapKeys) {
    const c = getGatePolicy(k);
    if (c === "HARD") hard.push(k);
    else if (c === "SOFT") soft.push(k);
    else if (c === "AUDIT") audit.push(k);
    else unknown.push(k);
  }
  return { hard, soft, audit, unknown };
}
