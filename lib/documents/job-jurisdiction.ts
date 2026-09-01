import type { RegulatoryJurisdiction } from "@/lib/compliance/regulatory-registry";

/**
 * Which country's law governs a job, and ON WHAT BASIS.
 *
 * The basis matters as much as the answer, because the honest answer is
 * sometimes "we do not know" and a document must be able to say so.
 *
 * WHY THIS IS NOT A ONE-LINER.
 *
 * `Report` has no country field at all. `Inspection.propertyCountry` exists but
 * is `@default("AU")`, and so is `Organization.country` -- which means a stored
 * "AU" is INDISTINGUISHABLE from "nobody recorded one". That is the same defect
 * as a commencement date padded to the first of the month: a value that looks
 * verified because the shape demanded one.
 *
 * Postcode cannot rescue it. Australian and New Zealand postcodes are both four
 * digits and overlap -- 1010 is Auckland and also a valid NSW range -- and the
 * existing detectJurisdiction() in safework-notification-gate.ts covers AU
 * states only, falling back to "NSW" for anything it does not recognise. It can
 * never return NZ. Deriving country from a postcode would therefore label every
 * New Zealand job Australian, which is precisely the failure the provenance
 * block exists to prevent.
 *
 * So: a positive "NZ" is trustworthy, because nobody sets it by accident. A
 * plain "AU" is weaker, and where there is no source for the country at all we
 * return null and let the document say the jurisdiction was not recorded --
 * rather than assuming Australia and printing an APVMA duty as though it were
 * local law.
 */
export interface JobJurisdictionResult {
  /** null when no source recorded one. Callers must handle it, not default it. */
  jurisdiction: RegulatoryJurisdiction | null;
  /** Where the answer came from, for the audit trail and for the document. */
  basis:
    | "inspection.propertyCountry"
    | "organisation.country"
    | "not-recorded";
  /**
   * True when the value came from a column whose schema default is "AU", so an
   * "AU" answer may be a default rather than a confirmation. Disclosed rather
   * than hidden: the alternative is a document that looks certain and is not.
   */
  mayBeSchemaDefault: boolean;
}

export interface JobJurisdictionInput {
  /** Inspection.propertyCountry, when the job has an inspection. */
  inspectionPropertyCountry?: string | null;
  /** Organization.country for the owning organisation, when resolvable. */
  organisationCountry?: string | null;
}

function normalise(value: string | null | undefined): "AU" | "NZ" | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "NZ" || v === "NEW ZEALAND") return "NZ";
  if (v === "AU" || v === "AUS" || v === "AUSTRALIA") return "AU";
  return null;
}

export function resolveJobJurisdiction(
  input: JobJurisdictionInput,
): JobJurisdictionResult {
  const fromInspection = normalise(input.inspectionPropertyCountry);
  if (fromInspection) {
    return {
      jurisdiction: fromInspection,
      basis: "inspection.propertyCountry",
      // The column defaults to "AU", so only a NZ answer is unambiguous.
      mayBeSchemaDefault: fromInspection === "AU",
    };
  }

  const fromOrg = normalise(input.organisationCountry);
  if (fromOrg) {
    return {
      jurisdiction: fromOrg,
      basis: "organisation.country",
      mayBeSchemaDefault: fromOrg === "AU",
    };
  }

  return {
    jurisdiction: null,
    basis: "not-recorded",
    mayBeSchemaDefault: false,
  };
}
