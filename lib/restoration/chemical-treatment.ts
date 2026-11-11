/**
 * RA-8281 (B2): how the scope of works reads the chemical treatment text to
 * choose the rate field of its RW_7 line.
 *
 * The text comes from a tick list ("Enhanced mould remediation (...)",
 * "Biohazard treatment (...)"), from a default ("Mould remediation
 * treatment") or from analysis text, so it is compared without regard to
 * capitals. A case-sensitive match once priced a mould treatment from the
 * antimicrobial rate while the mould rate was not set.
 *
 * This is the scope of works' existing rule, made to work for any capitals.
 * The cost estimate chooses its chemical lines from the hazards ticked and
 * does not read this text; whether the two documents should share one rule
 * is a pricing decision recorded in RA-8309, not made here.
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
