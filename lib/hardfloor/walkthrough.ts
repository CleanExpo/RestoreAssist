/**
 * Hard Floor add-on — the 10-step guided testing walkthrough.
 *
 * One client record runs intake → inspect → test → report → scope →
 * estimate → quote → job → handover → maintain. A maintenance visit loops
 * back to "inspect" on the same record, carrying every earlier visit
 * forward, so readings and photos build a history rather than resetting.
 */

import { getFloorSop } from "./sop-library";
import type { FloorFamily, FloorType, TrafficLevel, WalkthroughStepId } from "./types";

export interface WalkthroughStep {
  id: WalkthroughStepId;
  order: number;
  title: string;
  /** What must be captured before the step can be completed. */
  requiredCaptures: readonly string[];
}

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  { id: "intake", order: 1, title: "Intake", requiredCaptures: ["client", "site", "rooms_m2", "building_age", "asbestos_register"] },
  { id: "inspect", order: 2, title: "Inspect", requiredCaptures: ["floor_type_per_room", "condition_per_room", "photos_min_3_per_room", "traffic_level"] },
  { id: "test", order: 3, title: "Test", requiredCaptures: ["guided_tests_complete", "asbestos_gate_result"] },
  { id: "report", order: 4, title: "Report", requiredCaptures: ["findings_per_room"] },
  { id: "scope", order: 5, title: "Scope", requiredCaptures: ["method_per_room"] },
  { id: "estimate", order: 6, title: "Estimate", requiredCaptures: ["estimate"] },
  { id: "quote", order: 7, title: "Quote", requiredCaptures: ["three_options_sent", "client_signature"] },
  { id: "job", order: 8, title: "Do the job", requiredCaptures: ["sop_steps_signed", "ph_log"] },
  { id: "handover", order: 9, title: "Handover", requiredCaptures: ["before_after_photos", "care_sheet_sent", "next_service_date"] },
  { id: "maintain", order: 10, title: "Maintain", requiredCaptures: ["plan_frequency", "reminder_set"] },
];

export interface GuidedTest {
  id: string;
  label: string;
  /** Applies to these families; omitted = every family. */
  families?: readonly FloorFamily[];
  /** Applies only to these floor types (narrower than families). */
  floorTypes?: readonly FloorType[];
  optional?: boolean;
}

/** Guided tests for step 3 (investigation), from SOP 1–3. */
export const GUIDED_TESTS: readonly GuidedTest[] = [
  { id: "surface_ph", label: "Surface pH reading" },
  { id: "coating_water_bead", label: "Water-bead coating test", families: ["resilient", "timber"] },
  { id: "acid_drop", label: "Hidden-spot acid drop (fizz = calcium stone)", families: ["tile_stone"] },
  { id: "grout_tap", label: "Grout and tile tap test (loose, drummy, cracked)", families: ["tile_stone"] },
  { id: "lifting_check", label: "Lifting, broken or curling tiles", families: ["resilient"] },
  { id: "timber_moisture", label: "Timber moisture reading", families: ["timber"] },
  { id: "existing_finish", label: "Existing finish test (stripper on a hidden spot)", families: ["resilient", "tile_stone"] },
  { id: "asbestos_gate", label: "Asbestos gate", floorTypes: ["linoleum", "sheet_vinyl_pur", "vct"] },
  { id: "slip_as4586", label: "AS 4586 slip result (if in scope)", optional: true },
];

export function guidedTestsFor(floorType: FloorType): GuidedTest[] {
  const family = getFloorSop(floorType).family;
  return GUIDED_TESTS.filter((t) => {
    if (t.floorTypes) return t.floorTypes.includes(floorType);
    if (t.families) return t.families.includes(family);
    return true;
  });
}

export interface VisitRecord {
  visitNumber: number;
  startedAt: string;
  completedSteps: WalkthroughStepId[];
  captures: Record<string, unknown>;
}

export interface HardFloorClientRecord {
  clientId: string;
  siteId: string;
  traffic: TrafficLevel;
  /** Every visit, oldest first. Never rewritten. */
  visits: readonly VisitRecord[];
}

export function currentVisit(record: HardFloorClientRecord): VisitRecord {
  const visit = record.visits.at(-1);
  if (!visit) throw new Error("Client record has no visits");
  return visit;
}

/** The next step still to complete on the current visit, or null when the visit is done. */
export function nextStep(record: HardFloorClientRecord): WalkthroughStep | null {
  const done = new Set(currentVisit(record).completedSteps);
  return WALKTHROUGH_STEPS.find((s) => !done.has(s.id)) ?? null;
}

/** Captures still missing for a step on the current visit. */
export function missingCaptures(record: HardFloorClientRecord, stepId: WalkthroughStepId): string[] {
  const step = WALKTHROUGH_STEPS.find((s) => s.id === stepId);
  if (!step) throw new Error(`Unknown step: ${stepId}`);
  const captures = currentVisit(record).captures;
  return step.requiredCaptures.filter((c) => captures[c] === undefined || captures[c] === null);
}

/**
 * Complete a step. Steps must be completed in order, and every required
 * capture must be present. Returns a new record; the input is not mutated.
 */
export function completeStep(
  record: HardFloorClientRecord,
  stepId: WalkthroughStepId,
): HardFloorClientRecord {
  const next = nextStep(record);
  if (!next) throw new Error("This visit is already complete");
  if (next.id !== stepId) throw new Error(`Complete "${next.id}" before "${stepId}"`);
  const missing = missingCaptures(record, stepId);
  if (missing.length > 0) throw new Error(`Missing captures for ${stepId}: ${missing.join(", ")}`);
  const visit = currentVisit(record);
  const updated: VisitRecord = { ...visit, completedSteps: [...visit.completedSteps, stepId] };
  return { ...record, visits: [...record.visits.slice(0, -1), updated] };
}

/**
 * Start a maintenance visit: the loop from step 10 back to step 2. Intake is
 * carried over (same client and site), so the new visit opens at "inspect".
 * Earlier visits are kept untouched.
 */
export function startMaintenanceVisit(record: HardFloorClientRecord, startedAt: string): HardFloorClientRecord {
  const last = currentVisit(record);
  if (!last.completedSteps.includes("maintain")) {
    throw new Error("Finish the current visit (through Maintain) before starting the next one");
  }
  const intake = Object.fromEntries(
    WALKTHROUGH_STEPS[0].requiredCaptures.map((c) => [c, last.captures[c]]),
  );
  const visit: VisitRecord = {
    visitNumber: last.visitNumber + 1,
    startedAt,
    completedSteps: ["intake"],
    captures: intake,
  };
  return { ...record, visits: [...record.visits, visit] };
}
