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
import type { DamageCause } from "@/lib/nz/nhcover";

export const SCOPE_SCHEMA_VERSION = "1.0";

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

  return {
    schemaVersion: SCOPE_SCHEMA_VERSION,
    jurisdiction: input.country ?? "AU",
    property: {
      address: input.propertyAddress ?? "",
      reportNumber: input.reportNumber ?? "",
    },
    floors,
    totalFloorAreaM2: round2(
      floors.reduce((s, f) => s + f.totalFloorAreaM2, 0),
    ),
    compliance,
  };
}
