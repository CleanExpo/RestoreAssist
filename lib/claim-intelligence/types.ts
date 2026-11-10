/**
 * RA-8276 step 1: the contract of the Claim Pathway engine.
 *
 * One pure function (`composePathway`) turns claim facts into two views of
 * the same data: the technician's tick-and-flick checklist and the
 * customer's plain-English brief. No AI, no network, no clock.
 */
import type { EvidenceClass } from "@/lib/types/evidence";
import type { JobType } from "@/lib/evidence/workflow-definitions";
import type { StandardKey } from "@/lib/nir-standards-mapping";
import type { ClaimHazardInputs } from "@/lib/restoration/claim-recommendations";
import type {
  PpeRequirement,
  WaterCategory,
} from "@/lib/restoration/ppe-requirements";

// ── Input ──────────────────────────────────────────────────────────────────

export type HvacType = "split" | "ducted" | "none" | "unknown";

/** Smoke residue hint from the intake. A hint, never a finding. */
export type SmokeResidueHint =
  "protein" | "dry" | "wet" | "fuel_oil" | "unknown";

export interface PropertyFacts {
  storeys?: number | null;
  buildYear?: number | null;
  furnished?: boolean | null;
  hvacType?: HvacType | null;
  hvacRanSinceLoss?: boolean | null;
  ceilingHeightM?: number | null;
  /** AU state or territory code, e.g. "NSW". Selects state WHS regulation rows. */
  state?: string | null;
}

export interface LossFacts {
  /** ISO date (YYYY-MM-DD). Shown as given; the engine never reads a clock. */
  lossDate?: string | null;
  originRoom?: string | null;
  /** Fire only: what the caller described, e.g. "light protein smoke". */
  smokeColour?: string | null;
  smokeResidueHint?: SmokeResidueHint | null;
  /** Water only. Setting either one means water is present. */
  waterCategory?: WaterCategory | null;
  waterClass?: 1 | 2 | 3 | 4 | null;
  affectedRooms?: string[] | null;
}

/** Hazard flags. Water lives in `loss` so there is one place to set it. */
export type ClaimHazardFlags = Omit<
  ClaimHazardInputs,
  | "waterCategory"
  | "waterClass"
  | "waterPresent"
  | "highLevelWork"
  | "storeys"
  | "ceilingHeightM"
>;

export interface ClaimFacts {
  /** Any form `normalizeClaimType` accepts ("FIRE_SMOKE", "fire", "WATER"). */
  claimType: string;
  hazards?: ClaimHazardFlags;
  property?: PropertyFacts;
  loss?: LossFacts;
}

// ── Output ─────────────────────────────────────────────────────────────────

/**
 * Checklist sections, in display order. `protection` is reserved for RA-8277
 * (AI oversight and business protection) and carries no items in step 1.
 */
export const PATHWAY_SECTIONS = [
  "safety",
  "ppe",
  "standards",
  "investigate",
  "evidence",
  "scope",
  "protection",
] as const;
export type PathwaySection = (typeof PATHWAY_SECTIONS)[number];

export type EvidenceType = "photo" | "reading" | "test" | "note";

export interface EvidenceRequirement {
  evidenceClass: EvidenceClass;
  minCount: number;
  type: EvidenceType;
}

/**
 * Every item starts `proposed`. The technician confirms, changes or rejects
 * it; nothing becomes job data until then.
 */
export type PathwayItemStatus =
  "proposed" | "confirmed" | "changed" | "rejected";

export interface PathwayItem {
  /** Stable for the same input. */
  id: string;
  section: PathwaySection;
  /** "required" items must be done; "advisory" items are judgement calls. */
  severity: "required" | "advisory";
  action: string;
  why: string;
  /** Citations: `standardCite()` output or a WHS source label. */
  basis: string[];
  /** Empty only for standards items, which are confirmed rather than evidenced. */
  evidence: EvidenceRequirement[];
  status: PathwayItemStatus;
  guidance: { apprentice: string; experienced: string };
}

export interface CustomerBriefSection {
  heading: string;
  lines: string[];
}

export interface CustomerBrief {
  whatHappened: CustomerBriefSection;
  standardsExpect: CustomerBriefSection;
  properScope: CustomerBriefSection;
  toConfirm: CustomerBriefSection;
  questions: CustomerBriefSection;
}

export interface ClaimPathway {
  claimType: JobType;
  /** Governing standards, lead standard first. */
  standards: StandardKey[];
  waterPresent: boolean;
  ppe: PpeRequirement;
  techPathway: PathwayItem[];
  customerBrief: CustomerBrief;
}
