/**
 * RA-8281 (B2): the one reading of which chemical treatment a job is priced
 * for. The scope of works and the cost estimate both ask here, so the two
 * documents for one job read the same price-list rate.
 *
 * The treatment text comes from a tick list ("Enhanced mould remediation
 * (...)", "Biohazard treatment (...)"), from a default ("Mould remediation
 * treatment") or from analysis text, so it is compared without regard to
 * capitals. A case-sensitive match once priced a mould treatment from the
 * antimicrobial rate while the mould rate was not set.
 */
export type ChemicalTreatmentKind = "mould" | "biohazard";

/** The kind the text names, or null when it names neither. */
export function chemicalTreatmentKind(
  text: unknown,
): ChemicalTreatmentKind | null {
  if (typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (lower.includes("mould")) return "mould";
  if (lower.includes("biohazard") || lower.includes("bio-hazard")) {
    return "biohazard";
  }
  return null;
}
