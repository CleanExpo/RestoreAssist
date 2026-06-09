/**
 * S500 drying validation for moisture pins (spec §5.2).
 *
 * Each moisture-pin material carries its own dry target (`dryTargetWme`); this
 * reuses the shared `evaluateDrying` to report dry / not-yet-dry for a pin.
 */
import { getMaterialType, type MaterialTypeId } from "./iicrc-utils";
import { evaluateDrying, type DryEvaluation } from "@/lib/anz/dry-standard";

const FALLBACK_TARGET_WME = 16;

export function pinDryingStatus(pin: {
  wme: number;
  material: MaterialTypeId;
}): DryEvaluation {
  const target =
    getMaterialType(pin.material)?.dryTargetWme ?? FALLBACK_TARGET_WME;
  return evaluateDrying({ currentMc: pin.wme, targetMc: target });
}
