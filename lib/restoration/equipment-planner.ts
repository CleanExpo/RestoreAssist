/**
 * RA-7005 Wave 1 — domain-accuracy & safety guardrails for equipment planning.
 *
 * The scope/estimation engine previously sized equipment as `area ÷ per-unit
 * coverage`, with no electrical limit and no mould sequencing. That can emit an
 * UNSAFE, unbuildable plan (air movers over active mould → spore dispersal;
 * more machines than the supply can power). This module is the deterministic
 * safety core: given site conditions + a power assessment, it produces a
 * phased, power-constrained equipment plan that cannot violate the two
 * non-negotiable rules.
 *
 * Rules enforced (founder-confirmed 2026-07-06; see RA-7005):
 *  1. MOULD SEQUENCE — while mould is active, NO air movers. Phase 1 dries with
 *     dehumidifiers + AFD/HEPA scrubbers under containment only; air movers are
 *     gated behind PRV clearance to Condition 1 and only appear in Phase 2.
 *  2. POWER BUDGET — an initial site power assessment is mandatory. Each circuit
 *     is loaded to at most `deratePct` of its rating (AS/NZS 3000 continuous-load
 *     best practice, default 80%). Equipment is packed across circuits; a plan
 *     that cannot fit the derated supply is flagged for sectional mitigation or
 *     alternative power rather than silently over-specified.
 *
 * Amp draws come from lib/equipment-matrix (real per-model specs), so the plan's
 * electrical maths matches the equipment actually deployed. This is the
 * deterministic guardrail; RA-7005 later waves ground the sizing narrative in
 * the S500/S520/RIA RAG corpus.
 */
import { getEquipmentGroupById } from "@/lib/equipment-matrix";

/** Which equipment archetype — drives the mould-sequence gate. */
export type EquipmentKind = "dehumidifier" | "afd" | "air_mover";

/** Default equipment-matrix group ids for each kind. */
export const DEFAULT_GROUP_IDS: Record<EquipmentKind, string> = {
  dehumidifier: "lgr-35", // 3.4 A
  afd: "afd-500", // 1.5 A
  air_mover: "airmover-1500", // 1.2 A
};

/** Per-unit amp draw for a kind, read from the equipment matrix (fallbacks are
 * conservative published averages so the planner is never left without a
 * number if a group id is missing). */
export function ampsFor(kind: EquipmentKind, groupId?: string): number {
  const id = groupId ?? DEFAULT_GROUP_IDS[kind];
  const group = getEquipmentGroupById(id);
  if (group?.amps) return group.amps;
  const fallback: Record<EquipmentKind, number> = {
    dehumidifier: 3.4,
    afd: 1.5,
    air_mover: 1.2,
  };
  return fallback[kind];
}

/** Mandatory initial power assessment for a site. */
export interface PowerAssessment {
  /** Number of circuits made available for restoration equipment. */
  circuits: number;
  /** Rating of each circuit in amps (domestic AU typically 20). */
  circuitRatingA: number;
  /** Continuous-load derate fraction (AS/NZS 3000 best practice, default 0.8). */
  deratePct?: number;
}

export interface PowerBudget {
  circuits: number;
  circuitRatingA: number;
  deratePct: number;
  /** Usable amps per circuit after derating. */
  perCircuitUsableA: number;
  /** Total usable amps across all circuits. */
  siteUsableA: number;
}

/** Resolve a power assessment into a usable budget. */
export function computePowerBudget(a: PowerAssessment): PowerBudget {
  const deratePct = a.deratePct ?? 0.8;
  const perCircuitUsableA = round1(a.circuitRatingA * deratePct);
  return {
    circuits: a.circuits,
    circuitRatingA: a.circuitRatingA,
    deratePct,
    perCircuitUsableA,
    siteUsableA: round1(perCircuitUsableA * a.circuits),
  };
}

/** A quantity of one equipment kind to run. */
export interface EquipmentLine {
  kind: EquipmentKind;
  groupId: string;
  quantity: number;
  ampsEach: number;
  /** Total running amps for this line. */
  ampsTotal: number;
}

/** How a set of equipment lines packs onto the available circuits. */
export interface CircuitPacking {
  /** Amps assigned to each circuit (index = circuit number). */
  perCircuitA: number[];
  /** True if every circuit stays within its derated limit. */
  fits: boolean;
  /** Total running amps. */
  totalA: number;
}

/**
 * First-fit-decreasing packing of equipment onto circuits, each capped at the
 * derated per-circuit limit. Returns whether the load fits and the per-circuit
 * distribution — the same check an electrician does on site.
 */
export function packOntoCircuits(
  lines: EquipmentLine[],
  budget: PowerBudget,
): CircuitPacking {
  // Explode into individual units, largest draw first.
  const units: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) units.push(line.ampsEach);
  }
  units.sort((a, b) => b - a);

  const perCircuitA = new Array(budget.circuits).fill(0);
  let fits = true;
  for (const draw of units) {
    // Place on the circuit with the most remaining headroom.
    let best = -1;
    let bestHeadroom = -Infinity;
    for (let c = 0; c < budget.circuits; c++) {
      const headroom = budget.perCircuitUsableA - perCircuitA[c];
      if (draw <= headroom + 1e-9 && headroom > bestHeadroom) {
        best = c;
        bestHeadroom = headroom;
      }
    }
    if (best === -1) {
      fits = false; // no circuit can take this unit
      // Still record it on the least-loaded circuit so totals are truthful.
      let least = 0;
      for (let c = 1; c < budget.circuits; c++) {
        if (perCircuitA[c] < perCircuitA[least]) least = c;
      }
      perCircuitA[least] = round1(perCircuitA[least] + draw);
    } else {
      perCircuitA[best] = round1(perCircuitA[best] + draw);
    }
  }
  return {
    perCircuitA: perCircuitA.map(round1),
    fits,
    totalA: round1(units.reduce((s, u) => s + u, 0)),
  };
}

/** Site conditions that drive the plan. */
export interface SiteConditions {
  /** Wet floor area in m² (drives baseline unit counts). */
  affectedAreaM2: number;
  /** Active mould present / expected → gates air movers out of Phase 1. */
  mouldActive: boolean;
  /** Predominant material porosity — scales evaporative load. */
  porosity?: "low" | "medium" | "high";
  /** Furniture/contents density in the drying zone — obstructs airflow. */
  furniture?: "light" | "moderate" | "heavy";
  /** Occupied by people/animals during works (affects noise/heat/protocol). */
  occupied?: boolean;
}

export interface DryingPhase {
  phase: 1 | 2;
  label: string;
  /** Air movers allowed in this phase? */
  airMoversAllowed: boolean;
  lines: EquipmentLine[];
  packing: CircuitPacking;
}

export interface EquipmentPlan {
  budget: PowerBudget;
  phases: DryingPhase[];
  /** Human-facing flags an estimator/insurer must see. */
  advisories: string[];
  /** True if any phase's ideal load exceeds the power budget. */
  powerConstrained: boolean;
}

const LOAD = {
  porosity: { low: 0.8, medium: 1.0, high: 1.3 },
  furniture: { light: 1.0, moderate: 1.15, heavy: 1.3 },
};

/** Baseline air-mover count from area + load factors (S500 rule-of-thumb,
 * ~1 per 4–5 m² of wet floor, adjusted for porosity and obstructions). */
export function idealAirMovers(site: SiteConditions): number {
  const base = Math.ceil(site.affectedAreaM2 / 4.5);
  const p = LOAD.porosity[site.porosity ?? "medium"];
  const f = LOAD.furniture[site.furniture ?? "moderate"];
  return Math.max(1, Math.round(base * p * f));
}

/** Baseline dehumidifier count (~1 LGR per 20 m² of wet area, min 1). */
export function idealDehumidifiers(site: SiteConditions): number {
  return Math.max(1, Math.ceil(site.affectedAreaM2 / 20));
}

/** AFD/HEPA count for mould/containment (~1 per 30 m², min 1 when mould). */
export function idealAfds(site: SiteConditions): number {
  return site.mouldActive ? Math.max(1, Math.ceil(site.affectedAreaM2 / 30)) : 0;
}

function line(kind: EquipmentKind, quantity: number): EquipmentLine {
  const groupId = DEFAULT_GROUP_IDS[kind];
  const ampsEach = ampsFor(kind, groupId);
  return {
    kind,
    groupId,
    quantity,
    ampsEach,
    ampsTotal: round1(ampsEach * quantity),
  };
}

/**
 * Reduce an air-mover count until the whole equipment set fits the budget.
 * Dehumidifiers + AFDs are treated as fixed (they're the drying/filtration
 * backbone); air movers are the flexible, power-hungry, stageable load.
 */
function fitAirMovers(
  fixed: EquipmentLine[],
  desiredAirMovers: number,
  budget: PowerBudget,
): { lines: EquipmentLine[]; packing: CircuitPacking; capped: boolean } {
  let n = desiredAirMovers;
  while (n >= 0) {
    const lines = n > 0 ? [...fixed, line("air_mover", n)] : [...fixed];
    const packing = packOntoCircuits(lines, budget);
    if (packing.fits) {
      return { lines, packing, capped: n < desiredAirMovers };
    }
    n--;
  }
  const packing = packOntoCircuits(fixed, budget);
  return { lines: fixed, packing, capped: true };
}

/**
 * Produce a phased, power-constrained, mould-safe equipment plan.
 *
 * - Mould active: Phase 1 = dehumidifiers + AFDs only (NO air movers), Phase 2
 *   (post-PRV) adds air movers + dehumidifiers.
 * - No mould: single phase — air movers + dehumidifiers run together.
 * In every phase the load is packed onto the derated circuits; air movers are
 * reduced to fit, and an advisory names the sectional-mitigation / alt-power
 * trade-off when the ideal count can't be powered.
 */
export function planDrying(
  site: SiteConditions,
  assessment: PowerAssessment,
): EquipmentPlan {
  const budget = computePowerBudget(assessment);
  const advisories: string[] = [];
  const dh = idealDehumidifiers(site);
  const afd = idealAfds(site);
  const airMovers = idealAirMovers(site);
  const phases: DryingPhase[] = [];
  let powerConstrained = false;

  if (site.mouldActive) {
    // Phase 1 — mould active: DH + AFD only, NO air movers.
    const p1Fixed = [line("dehumidifier", dh), line("afd", Math.max(1, afd))];
    const p1Packing = packOntoCircuits(p1Fixed, budget);
    if (!p1Packing.fits) {
      powerConstrained = true;
      advisories.push(
        `Phase 1 dehumidifier + AFD load (${p1Packing.totalA}A) exceeds the ${budget.siteUsableA}A derated supply — bring alternative power or reduce concurrent units.`,
      );
    }
    phases.push({
      phase: 1,
      label:
        "Phase 1 — mould active: dehumidifiers + AFD/HEPA scrubbers under negative-pressure containment. NO air movers (would aerosolise spores). Air movers gated behind PRV clearance to Condition 1 (S520:2024).",
      airMoversAllowed: false,
      lines: p1Fixed,
      packing: p1Packing,
    });

    // Phase 2 — post-clearance: air movers + DH together (+ residual AFD).
    const p2Fixed = [line("dehumidifier", dh), line("afd", 1)];
    const p2 = fitAirMovers(p2Fixed, airMovers, budget);
    if (p2.capped) {
      powerConstrained = true;
      advisories.push(
        `Phase 2 needs ~${airMovers} air movers for the floor area but the ${budget.siteUsableA}A supply only powers fewer alongside the dehumidifiers — run controlled sectional mitigation (stage air movers zone-by-zone as areas dry, extending drying time) or bring alternative power (generator / temp distribution board).`,
      );
    }
    phases.push({
      phase: 2,
      label:
        "Phase 2 — post-PRV (Condition 1): air movers + dehumidifiers run together for structural drying.",
      airMoversAllowed: true,
      lines: p2.lines,
      packing: p2.packing,
    });
  } else {
    // No mould: single phase — air movers + DH together from the start.
    const fixed = [line("dehumidifier", dh)];
    const single = fitAirMovers(fixed, airMovers, budget);
    if (single.capped) {
      powerConstrained = true;
      advisories.push(
        `Ideal ~${airMovers} air movers for the floor area exceed what the ${budget.siteUsableA}A supply powers with the dehumidifiers — run controlled sectional mitigation (stage by zone, longer drying) or bring alternative power.`,
      );
    }
    phases.push({
      phase: 1,
      label:
        "Structural drying — air movers + dehumidifiers together (no mould; S500:2021 §12.5).",
      airMoversAllowed: true,
      lines: single.lines,
      packing: single.packing,
    });
  }

  if (site.occupied) {
    advisories.push(
      "Property occupied during works — apply occupied-home protocols (noise/heat limits, safe egress, containment signage).",
    );
  }

  return { budget, phases, advisories, powerConstrained };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
