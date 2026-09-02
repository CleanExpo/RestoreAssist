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
import {
  ASBESTOS_PRESUMPTION_YEAR,
  presumeAsbestosFromEra,
  type AsbestosJurisdiction,
} from "@/lib/compliance/asbestos-era";

/**
 * Work after the national ban is treated as ACM-free.
 *
 * Re-exported from the registry rather than declared. The VALUE here was always
 * right for Australia, so nothing was broken -- but a regulatory year living in
 * a second place is how this class regenerates. The same asbestos question was
 * answered differently in nine files before lib/compliance/asbestos-era.ts was
 * built, and the safety-critical copies had the wrong answer.
 */
export const ASBESTOS_BAN_YEAR = ASBESTOS_PRESUMPTION_YEAR.AU;

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
  /**
   * Country whose presumption year applies. Defaults to Australia.
   *
   * New Zealand's threshold is 1 January 2000 against Australia's 2004, so a
   * 2002 building is inside the Australian window and outside the New Zealand
   * one. The default is deliberate rather than lazy: the only caller today
   * (components/sketch/SketchSelectionPanel.tsx) receives propertyYearBuilt and
   * NO country or postcode, so it genuinely cannot resolve one. Defaulting to
   * Australia over-blocks a New Zealand job from 2000-2003 rather than
   * under-warning it, which is the safe direction for a gate that stops
   * destructive work.
   */
  jurisdiction?: AsbestosJurisdiction;
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
    presumeAsbestosFromEra(
      input.propertyYearBuilt,
      input.jurisdiction ?? "AU",
    );

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
