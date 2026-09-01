/**
 * RestoreAssist scope export contract (v1) — the machine-readable twin of the
 * PDF scope (spec §9 output contract, ANZ-native).
 *
 * This is OUR contract: it is NOT modelled on, and does not import or reference,
 * any US/foreign estimating format (no ESX/Xactimate, no Cotality/Symbility).
 * It is built off the SAME source as the PDF compliance annex
 * (`buildComplianceAnnex`) and the SAME room extraction (`extractRooms`), so the
 * human PDF and this structured export can never drift.
 *
 * Versioned via `schemaVersion` so any future carrier integration binds to a
 * stable contract, not a moving target.
 *
 * Phase-1 invariant: all geometry is `operator_measured` (underlay import is
 * gated and absent); the provenance guard in lib/sketch/measured-elements is the
 * enforcement point once underlay import lands.
 */
import {
  buildComplianceAnnex,
  type ComplianceAnnex,
  type ScopeMaterialInfo,
  type MoisturePinInput,
} from "@/lib/sketch/pdf-scope";
import { extractRooms, type RoomInfo } from "@/lib/sketch/extract-rooms";
import {
  buildScopeDryingPlan,
  deployableEquipment,
  type DryingEquipmentCounts,
  type ScopeDryingPlan,
} from "@/lib/restoration/scope-drying-plan";
import type { PowerAssessment } from "@/lib/restoration/equipment-planner";
import type { DamageCause } from "@/lib/nz/nhcover";

/**
 * 1.1 replaced the drying-equipment calculator.
 *
 * Through 1.0, `dryingEquipment` was `area / per-unit coverage` with no mould
 * gate and no electrical limit, so a mould job could be quoted air movers that
 * the same job's report forbade. 1.1 sizes it with RA-7005's `planDrying` and
 * adds `dryingPlan` alongside. The three keys and their meaning are unchanged
 * for a consumer — but the NUMBERS move, and on a mould job `airMover` is now 0
 * because the S520 sequence puts air movers in Phase 2, behind clearance.
 */
export const SCOPE_SCHEMA_VERSION = "1.1";

export type { ScopeMaterialInfo };

export interface ScopeExportFloor {
  label: string;
  rooms: RoomInfo[];
  totalFloorAreaM2: number;
}

export interface ScopeExport {
  schemaVersion: string;
  jurisdiction: "AU" | "NZ";
  property: { address: string; reportNumber: string };
  floors: ScopeExportFloor[];
  totalFloorAreaM2: number;
  /**
   * What may be deployed NOW — the plan's Phase 1 set.
   *
   * On a mould job this carries zero air movers by design (S520: they aerosolise
   * spores until the area clears to Condition 1). The Phase 2 count is in
   * `dryingPlan`, where it is labelled as gated behind clearance; putting it
   * here would undo the sequence.
   */
  dryingEquipment: DryingEquipmentCounts;
  /**
   * The full phased, power-bounded plan, or null when there is nothing to dry.
   * Carries the mould gate, the circuit budget, and whether that budget was
   * measured or assumed.
   */
  dryingPlan: ScopeDryingPlan | null;
  /** Same annex object the PDF renders (materials, ACM, drying log, NCC|NHCover). */
  compliance: ComplianceAnnex;
}

export interface ScopeExportInput {
  floors: { label: string; fabricJson?: Record<string, unknown> | null }[];
  materials: ScopeMaterialInfo[];
  propertyAddress?: string;
  reportNumber?: string;
  moisturePins?: MoisturePinInput[];
  country?: "AU" | "NZ";
  nccEdition?: string;
  nhCause?: DamageCause;
  estimatedRepairNzd?: number;
  /**
   * Active mould on the job. Derive it with `deriveMouldActive` from the same
   * signals the report uses (`lib/restoration/fetch-plan-inputs.ts`) — a caller
   * that computes it its own way is how the scope and the report end up
   * contradicting each other on one job.
   */
  mouldActive?: boolean;
  /** On-site power assessment. Omitted means assumed, and the plan says so. */
  powerAssessment?: PowerAssessment;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildScopeExport(input: ScopeExportInput): ScopeExport {
  const floors: ScopeExportFloor[] = input.floors.map((f) => {
    const rooms = extractRooms(f.fabricJson);
    return {
      label: f.label,
      rooms,
      totalFloorAreaM2: round2(rooms.reduce((s, r) => s + r.areaM2, 0)),
    };
  });

  const totalArea = floors.reduce((s, f) => s + f.totalFloorAreaM2, 0);

  const mergedObjects = input.floors.flatMap(
    (f) => (f.fabricJson?.objects as unknown[] | undefined) ?? [],
  );
  const compliance = buildComplianceAnnex(
    { objects: mergedObjects },
    input.materials,
    {
      edition: input.nccEdition,
      pins: input.moisturePins,
      country: input.country,
      nhCause: input.nhCause,
      estimatedRepairNzd: input.estimatedRepairNzd,
    },
  );

  const dryingPlan = buildScopeDryingPlan({
    totalAreaM2: round2(totalArea),
    mouldActive: input.mouldActive ?? false,
    powerAssessment: input.powerAssessment,
  });

  return {
    schemaVersion: SCOPE_SCHEMA_VERSION,
    jurisdiction: input.country ?? "AU",
    property: {
      address: input.propertyAddress ?? "",
      reportNumber: input.reportNumber ?? "",
    },
    floors,
    totalFloorAreaM2: round2(totalArea),
    dryingEquipment: deployableEquipment(dryingPlan),
    dryingPlan,
    compliance,
  };
}
