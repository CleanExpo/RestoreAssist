/**
 * RA-7006 Gap 1 — safety reconciliation for the deterministic pricing
 * generators (scope-of-works, cost-estimation).
 *
 * Those generators price the raw user equipmentSelection × duration with no
 * mould air-mover gate and no power-budget check, so the priced document — the
 * one an insurer pays against — could carry a Phase-1 air-mover line the
 * report's own safety plan forbids, or a spec exceeding site amps. This helper
 * runs the same RA-7005 planner over the pricing inputs and returns the safety
 * plan plus explicit violation advisories, so the priced scope/estimate can
 * never silently contradict the report's safety plan.
 *
 * It reports; it does not mutate pricing. The callers surface the advisories in
 * the document + response so an unsafe configuration is visible, not hidden.
 */
import { planDrying, type EquipmentPlan } from "./equipment-planner";
import {
  requiredPpe,
  type PpeRequirement,
  type WaterCategory,
  type MouldCondition,
} from "./ppe-requirements";
import {
  claimRecommendations,
  type Recommendation,
} from "./claim-recommendations";

export interface PricingSafetyAdvisory {
  severity: "critical" | "warning";
  text: string;
}

export interface PricingSafetyResult {
  equipmentPlan: EquipmentPlan | null;
  advisories: PricingSafetyAdvisory[];
  ppe: PpeRequirement;
  recommendations: Recommendation[];
  airMoverQty: number;
  mouldActive: boolean;
}

function normaliseWaterCategory(v?: string | null): WaterCategory | null {
  if (!v) return null;
  const m = String(v).match(/[123]/);
  return m ? (m[0] as WaterCategory) : null;
}

function isAirMover(sel: any): boolean {
  const s = `${sel?.type ?? ""} ${sel?.category ?? ""} ${sel?.name ?? ""} ${sel?.equipmentType ?? ""}`.toLowerCase();
  return /air.?mover|axial|centrifugal/.test(s);
}

function sumAirMovers(equipmentSelection?: any[]): number {
  if (!Array.isArray(equipmentSelection)) return 0;
  return equipmentSelection
    .filter(isAirMover)
    .reduce((acc, sel) => acc + (Number(sel?.quantity) || 0), 0);
}

/**
 * Reconcile a priced equipment selection against the RA-7005 safety plan.
 * Pure + deterministic; safe to call from the pricing routes.
 */
export function reconcilePricingSafety(input: {
  scopeAreas?: any[];
  equipmentSelection?: any[];
  waterCategory?: string | null;
  mouldActive: boolean;
  hazards?: string[];
  powerAssessment?: {
    circuits: number;
    circuitRatingA: number;
    deratePct?: number;
  };
}): PricingSafetyResult {
  const areaM2 = Array.isArray(input.scopeAreas)
    ? input.scopeAreas.reduce(
        (sum: number, a: any) =>
          sum +
          (Number(a?.length) || 0) *
            (Number(a?.width) || 0) *
            ((Number(a?.wetPercentage) || 0) / 100),
        0,
      )
    : 0;

  const airMoverQty = sumAirMovers(input.equipmentSelection);
  const mouldActive = input.mouldActive;
  const advisories: PricingSafetyAdvisory[] = [];

  const equipmentPlan =
    areaM2 > 0
      ? planDrying(
          {
            affectedAreaM2: Math.round(areaM2 * 10) / 10,
            mouldActive,
          },
          input.powerAssessment ?? { circuits: 2, circuitRatingA: 20 },
        )
      : null;

  // Invariant 1 — no air movers while mould is active. A priced Phase-1 air
  // mover on a mould job is remediation negligence (S520): flag it critical.
  if (mouldActive && airMoverQty > 0) {
    advisories.push({
      severity: "critical",
      text: `${airMoverQty} air mover(s) are in the equipment selection on a job with active mould. Air movers MUST NOT run until post-remediation verification returns the area to Condition 1 (IICRC S520). Price them to Phase 2 (post-clearance) only; Phase 1 is dehumidifiers + AFD/HEPA under containment.`,
    });
  }

  // Invariant 2 — equipment must fit the derated supply.
  if (equipmentPlan?.powerConstrained) {
    advisories.push({
      severity: "warning",
      text: equipmentPlan.advisories.join(" "),
    });
  }

  // PPE + recommendations for the priced document (hazard-derived; do not
  // depend on area, so always computed).
  const wc = normaliseWaterCategory(input.waterCategory);
  const hazardsText = (input.hazards ?? []).map((h) => String(h).toLowerCase());
  const has = (re: RegExp) => hazardsText.some((h) => re.test(h));
  const mouldCondition: MouldCondition = mouldActive ? 3 : 0;
  const hazardProfile = {
    waterCategory: wc,
    mouldCondition,
    asbestos: has(/asbestos/),
    biohazard: has(/bio.?hazard|trauma|sewage/),
    chemical: has(/meth|chemical|clandestine/),
    fireSmoke: has(/fire|smoke|soot/),
  };

  return {
    equipmentPlan,
    advisories,
    ppe: requiredPpe(hazardProfile),
    recommendations: claimRecommendations(hazardProfile),
    airMoverQty,
    mouldActive,
  };
}
