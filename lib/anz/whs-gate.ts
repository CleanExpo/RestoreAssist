/**
 * WHS asbestos gate (spec §5.3).
 *
 * Asbestos was banned in Australia in December 2003 but is present throughout
 * pre-2000 housing as fibro / AC sheeting, cladding, vinyl tiles, eaves and flues.
 * On any element flagged as suspected ACM, demolition / strip-out scope must be
 * BLOCKED until a WHS pathway is recorded (friable vs non-friable, licensed
 * removal per the relevant state regulator, or a sampling result).
 */

import { getMaterial } from "./materials";

/** Work after the national ban is treated as ACM-free. */
export const ASBESTOS_BAN_YEAR = 2004;

/** Scope actions that physically disturb material and therefore trigger the gate. */
const DESTRUCTIVE_ACTIONS = new Set([
  "strip_out",
  "strip-out",
  "demolition",
  "demolish",
  "cut_back",
  "cut-back",
  "remove",
  "removal",
]);

export type HazardStatus =
  | "suspected"
  | "sampled"
  | "cleared"
  | "licensed_removal_required";

export interface WhsGateInput {
  /** Material slug — used to look up the default ACM flag. */
  materialId?: string;
  /** Explicit ACM override; takes precedence over the material default. */
  isPotentialAcm?: boolean;
  /** Year the property was built. Unknown is treated conservatively as at-risk. */
  propertyYearBuilt?: number;
  /** The scope action being attempted. */
  action: string;
  /** Recorded hazard pathway state, if any. */
  hazardStatus?: HazardStatus;
  /** Free-text WHS pathway note (presence unblocks the gate). */
  whsPathwayNote?: string;
}

export interface WhsGateResult {
  allowed: boolean;
  blocked: boolean;
  /** True when the element is suspected to contain ACM in this context. */
  suspectedAcm: boolean;
  /** True when a WHS pathway must be recorded before the action may proceed. */
  requiresWhsPathway: boolean;
  reason: string;
}

function isDestructive(action: string): boolean {
  return DESTRUCTIVE_ACTIONS.has(action.trim().toLowerCase());
}

function pathwayRecorded(input: WhsGateInput): boolean {
  if (input.whsPathwayNote && input.whsPathwayNote.trim().length > 0) {
    return true;
  }
  return (
    input.hazardStatus === "cleared" ||
    input.hazardStatus === "sampled" ||
    input.hazardStatus === "licensed_removal_required"
  );
}

export function evaluateWhsGate(input: WhsGateInput): WhsGateResult {
  const materialAcm =
    input.isPotentialAcm ??
    getMaterial(input.materialId ?? "")?.isPotentialAcm ??
    false;

  // Unknown build year => treat as at-risk; post-ban construction => no ACM risk.
  const preBan =
    input.propertyYearBuilt === undefined ||
    input.propertyYearBuilt < ASBESTOS_BAN_YEAR;

  const suspectedAcm = materialAcm && preBan;

  if (!suspectedAcm || !isDestructive(input.action)) {
    return {
      allowed: true,
      blocked: false,
      suspectedAcm,
      requiresWhsPathway: false,
      reason: suspectedAcm
        ? "Suspected ACM, but the action does not disturb material."
        : "No suspected ACM for this element.",
    };
  }

  if (pathwayRecorded(input)) {
    return {
      allowed: true,
      blocked: false,
      suspectedAcm: true,
      requiresWhsPathway: false,
      reason: "Suspected ACM with a recorded WHS pathway — scope may proceed.",
    };
  }

  return {
    allowed: false,
    blocked: true,
    suspectedAcm: true,
    requiresWhsPathway: true,
    reason:
      "Suspected asbestos-containing material on a pre-2004 build. Record a WHS pathway (friable/non-friable, licensed removal, or sampling result) before adding strip-out or demolition scope.",
  };
}
