/**
 * One rule for which MoistureReading units express moisture content and can be
 * compared with a drying goal (RA-8508). RH and CELSIUS are environmental, not
 * material moisture content. No unit recorded means a moisture-content reading:
 * the manual entry paths do not write a unit.
 */
const MC_UNITS = new Set(["PERCENT_MC", "WME", "PERCENT", "%MC", "MC"]);

export function isMoistureContentUnit(unit: string | null | undefined): boolean {
  if (!unit) return true;
  return MC_UNITS.has(unit.trim().toUpperCase());
}
