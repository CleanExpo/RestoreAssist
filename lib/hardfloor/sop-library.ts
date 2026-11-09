/**
 * Hard Floor add-on — SOP library (per floor type).
 *
 * Values mirror the CARSI Hard Floor Care SOP Cards v1 and the manufacturer
 * guidance they cite (Forbo Marmoleum/Surestep care sheets, ATFA Information
 * Sheet #12). Change a limit here and in the SOP card together.
 */

import type { FloorFamily, FloorType, PhWindow, ServiceType } from "./types";

export interface FloorSop {
  family: FloorFamily;
  /** Safe pH window for routine cleaning solutions. */
  cleanPh: PhWindow;
  /** Highest pH allowed for a stripping solution; null = never strip. */
  stripPhMax: number | null;
  /** Services a technician may scope on this floor type. */
  services: readonly ServiceType[];
  /** Pad colours that must never touch this floor. */
  forbiddenPads: readonly ("black" | "brown" | "blue" | "green")[];
  /** Vinyl/lino-type floors that may contain asbestos (era from lib/compliance/asbestos-era). */
  asbestosRisk: boolean;
  /** Plain-English warning shown on the scope screen. */
  warning?: string;
}

export const FLOOR_SOPS: Readonly<Record<FloorType, FloorSop>> = {
  glazed_ceramic: {
    family: "tile_stone",
    cleanPh: { min: 7, max: 12 },
    stripPhMax: 14,
    services: ["tile_grout_clean", "tile_wax_removal"],
    forbiddenPads: [],
    asbestosRisk: false,
    warning: "Do not wax glazed tile: wax does not bond and becomes slippery.",
  },
  porcelain: {
    family: "tile_stone",
    cleanPh: { min: 7, max: 12 },
    stripPhMax: 14,
    services: ["tile_grout_clean", "tile_wax_removal"],
    forbiddenPads: [],
    asbestosRisk: false,
  },
  quarry_terracotta: {
    family: "tile_stone",
    cleanPh: { min: 7, max: 12 },
    stripPhMax: 14,
    services: ["tile_grout_clean", "tile_wax_removal"],
    forbiddenPads: [],
    asbestosRisk: false,
  },
  calcium_stone: {
    family: "tile_stone",
    cleanPh: { min: 7, max: 10 },
    stripPhMax: 10,
    services: ["tile_grout_clean", "tile_wax_removal"],
    forbiddenPads: ["black", "brown"],
    asbestosRisk: false,
    warning: "Acid etches calcium stone permanently. Neutral chemistry only.",
  },
  silicate_stone: {
    family: "tile_stone",
    cleanPh: { min: 7, max: 12 },
    stripPhMax: 14,
    services: ["tile_grout_clean", "tile_wax_removal"],
    forbiddenPads: [],
    asbestosRisk: false,
  },
  linoleum: {
    family: "resilient",
    cleanPh: { min: 7, max: 8.5 },
    stripPhMax: 10,
    services: ["lino_safe", "scrub_recoat"],
    forbiddenPads: ["black", "brown", "blue", "green"],
    asbestosRisk: true,
    warning: "Never above pH 10. Leave the factory finish in place. Red pad only.",
  },
  sheet_vinyl_pur: {
    family: "resilient",
    cleanPh: { min: 5, max: 10 },
    stripPhMax: null,
    services: ["scrub_recoat"],
    forbiddenPads: ["black", "brown"],
    asbestosRisk: true,
    warning: "PUR factory finish: maintain, do not strip.",
  },
  vct: {
    family: "resilient",
    cleanPh: { min: 7, max: 9 },
    stripPhMax: 14,
    services: ["strip_and_seal", "scrub_recoat"],
    forbiddenPads: [],
    asbestosRisk: true,
  },
  lvt: {
    family: "resilient",
    cleanPh: { min: 7, max: 9 },
    stripPhMax: null,
    services: ["scrub_recoat"],
    forbiddenPads: ["black", "brown"],
    asbestosRisk: false,
    warning: "Factory wear layer: follow the manufacturer's care sheet.",
  },
  rubber: {
    family: "resilient",
    cleanPh: { min: 7, max: 9 },
    stripPhMax: 14,
    services: ["strip_and_seal", "scrub_recoat"],
    forbiddenPads: [],
    asbestosRisk: false,
  },
  timber_coated: {
    family: "timber",
    cleanPh: { min: 6.5, max: 7.5 },
    stripPhMax: null,
    services: ["timber_clean"],
    forbiddenPads: ["black", "brown", "blue", "green"],
    asbestosRisk: false,
    warning:
      "No steam, flooding, rotary scrubbing or extraction. Refer recoats to a timber floor finisher.",
  },
};

export function getFloorSop(floorType: FloorType): FloorSop {
  const sop = FLOOR_SOPS[floorType];
  if (!sop) throw new Error(`Unknown floor type: ${String(floorType)}`);
  return sop;
}

/** True when the service is a valid scope choice for the floor type. */
export function isServiceAllowed(floorType: FloorType, service: ServiceType): boolean {
  return getFloorSop(floorType).services.includes(service);
}
