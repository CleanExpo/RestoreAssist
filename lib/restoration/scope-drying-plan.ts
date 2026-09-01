/**
 * The drying-equipment block carried by the scope contract and the sketch PDF.
 *
 * These two exports sized equipment as `area / per-unit coverage` from
 * `recommendedEquipment()` in `lib/sketch/iicrc-utils.ts` — three lines of
 * `Math.ceil`, with no mould gate and no electrical limit. That is precisely
 * what RA-7005's planner exists to replace, and it meant one job could be
 * quoted three different ways:
 *
 *   - the report and the pricing reconciler ran `planDrying` (mould-safe,
 *     power-bounded),
 *   - Margot ran it too after #2149,
 *   - and the scope JSON an insurer reads, plus the PDF a technician works
 *     from, still divided by area.
 *
 * So a mould job could be classified Condition 3 on page one and carry a
 * priced air-mover count on page two. `reconcile-pricing-safety.ts` calls that
 * "remediation negligence (S520)" and flags it critical — the exports were
 * emitting exactly the artefact it flags.
 *
 * This module is the single adapter between `planDrying`'s phased plan and the
 * flat three-count shape both exports render, so neither surface re-derives it.
 */
import {
  planDrying,
  type EquipmentKind,
  type PowerAssessment,
} from "./equipment-planner";
import { resolvePowerAssessment } from "./plan-inputs";
import { standardCite } from "@/lib/nir-standards-mapping";

/** The flat counts both exports render. Keys are the contract's, not the planner's. */
export interface DryingEquipmentCounts {
  dehumidifier: number;
  airMover: number;
  airScrubber: number;
}

export const NO_EQUIPMENT: DryingEquipmentCounts = {
  dehumidifier: 0,
  airMover: 0,
  airScrubber: 0,
};

/**
 * Planner kind to contract key. AFD/HEPA units are what the contract has always
 * called an air scrubber; the planner's name for them is the equipment-matrix
 * one.
 */
const CONTRACT_KEY: Record<EquipmentKind, keyof DryingEquipmentCounts> = {
  dehumidifier: "dehumidifier",
  air_mover: "airMover",
  afd: "airScrubber",
};

export interface ScopeDryingPhase {
  phase: 1 | 2;
  label: string;
  /**
   * False in Phase 1 of a mould job. When false the phase's `equipment.airMover`
   * is 0 and must stay 0 — it is the S520 rule, not a sizing outcome.
   */
  airMoversAllowed: boolean;
  equipment: DryingEquipmentCounts;
  /** Total draw of this phase's set, for the circuit budget below. */
  ampsTotal: number;
}

export interface ScopeDryingPlan {
  mouldActive: boolean;
  power: {
    circuits: number;
    circuitRatingA: number;
    deratePct: number;
    siteUsableA: number;
    /**
     * True when nobody assessed the site and the 2x20A default was used. A plan
     * that drops this reads as though an electrician produced the numbers.
     */
    assumed: boolean;
  };
  /** True when the ideal count could not be powered and was reduced to fit. */
  powerConstrained: boolean;
  phases: ScopeDryingPhase[];
  advisories: string[];
  /** The standard the counts are sized under; S520 once mould is active. */
  citation: string;
}

export interface ScopeDryingPlanInput {
  totalAreaM2: number;
  mouldActive: boolean;
  powerAssessment?: PowerAssessment;
  porosity?: "low" | "medium" | "high";
  furniture?: "light" | "moderate" | "heavy";
  occupied?: boolean;
}

/**
 * Build the phased plan, or null when there is nothing to dry.
 *
 * Null rather than a zero-area plan is deliberate: `idealDehumidifiers` floors
 * at 1, so passing 0 m2 through the planner would put one dehumidifier on the
 * quote for a scope with no rooms in it.
 */
export function buildScopeDryingPlan(
  input: ScopeDryingPlanInput,
): ScopeDryingPlan | null {
  if (!(input.totalAreaM2 > 0)) return null;

  const { assessment, assumed } = resolvePowerAssessment(input.powerAssessment);
  const plan = planDrying(
    {
      affectedAreaM2: input.totalAreaM2,
      mouldActive: input.mouldActive,
      porosity: input.porosity,
      furniture: input.furniture,
      occupied: input.occupied,
    },
    assessment,
  );

  return {
    mouldActive: input.mouldActive,
    power: {
      circuits: plan.budget.circuits,
      circuitRatingA: plan.budget.circuitRatingA,
      deratePct: plan.budget.deratePct,
      siteUsableA: plan.budget.siteUsableA,
      assumed,
    },
    powerConstrained: plan.powerConstrained,
    phases: plan.phases.map((p) => ({
      phase: p.phase,
      label: p.label,
      airMoversAllowed: p.airMoversAllowed,
      equipment: countsFromLines(p.lines),
      ampsTotal: p.packing.totalA,
    })),
    advisories: plan.advisories,
    citation: input.mouldActive
      ? standardCite("S520")
      : standardCite("S500", "6"),
  };
}

function countsFromLines(
  lines: ReadonlyArray<{ kind: EquipmentKind; quantity: number }>,
): DryingEquipmentCounts {
  const counts = { ...NO_EQUIPMENT };
  for (const l of lines) counts[CONTRACT_KEY[l.kind]] += l.quantity;
  return counts;
}

/**
 * What may be on site NOW — Phase 1's set.
 *
 * This is what the flat `dryingEquipment` block reports, and on a mould job it
 * carries zero air movers. Reporting the Phase 2 count there, or a sum across
 * phases, would put the air movers back on the page the S520 sequence exists to
 * keep them off.
 */
export function deployableEquipment(
  plan: ScopeDryingPlan | null,
): DryingEquipmentCounts {
  return plan?.phases[0]?.equipment ?? { ...NO_EQUIPMENT };
}

/** How a renderer should weight a line. Kept renderer-agnostic on purpose. */
export type DryingLineTone = "heading" | "body" | "warn" | "muted";

export interface DryingPlanLine {
  text: string;
  tone: DryingLineTone;
}

/**
 * The drying-equipment block as lines, so the text is testable without decoding
 * a PDF.
 *
 * The sketch PDF used to build these inline in its draw calls, which meant the
 * only thing a test could assert about the page a technician works from was
 * that two PDFs differed byte-for-byte. That is not an assertion about whether
 * "NO air movers this phase" is on the page. It is now, because these lines are
 * a value.
 *
 * `maxChars` wraps advisories; pdf-lib neither wraps nor clips, so an unwrapped
 * advisory runs off the page edge and is simply not there to read.
 */
export function dryingPlanLines(
  plan: ScopeDryingPlan | null,
  maxChars = 150,
): DryingPlanLine[] {
  if (!plan) return [];
  const lines: DryingPlanLine[] = [
    { text: `Drying equipment (${plan.citation})`, tone: "heading" },
  ];
  const phased = plan.phases.length > 1;

  for (const phase of plan.phases) {
    const eq = phase.equipment;
    lines.push({
      text: `${phased ? `Phase ${phase.phase}: ` : ""}Dehumidifiers: ${eq.dehumidifier} - Air movers: ${eq.airMover} - Air scrubbers/AFD: ${eq.airScrubber} - ${phase.ampsTotal}A`,
      tone: "body",
    });
    // The reason a phase has no air movers must travel with the count, or the
    // zero reads as an omission and someone "corrects" it on site.
    if (!phase.airMoversAllowed) {
      lines.push({
        text: "  NO air movers this phase - active mould; they aerosolise spores. Gated behind PRV clearance to Condition 1 (S520).",
        tone: "warn",
      });
    }
  }

  const p = plan.power;
  lines.push({
    text: `Power: ${p.circuits} x ${p.circuitRatingA}A, derated to ${Math.round(p.deratePct * 100)}% = ${p.siteUsableA}A usable${p.assumed ? " (ASSUMED - no site power assessment on file)" : ""}`,
    tone: p.assumed ? "warn" : "muted",
  });

  for (const advisory of plan.advisories) {
    for (const chunk of wrapPlain(advisory, maxChars)) {
      lines.push({ text: `  ${chunk}`, tone: "warn" });
    }
  }

  return lines;
}

/** Greedy word wrap. Exported for the renderer that needs the same width. */
export function wrapPlain(text: string, maxChars: number): string[] {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}
