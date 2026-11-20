/**
 * Where the fire and smoke walkthrough applies. Its checklist cites Victorian
 * sources only, so it is required for inspections located in Victoria,
 * Australia, and for nobody else. One owner: the loader and the submit gate
 * both call this, never their own copy of the rule.
 *
 * Fails closed. A location that cannot be read (missing or odd country,
 * missing or unmapped postcode) keeps the walkthrough required: a wrong
 * "not applicable" skips a safety record, a wrong "required" only asks for it.
 */

import { stateFromPostcode } from "@/lib/anz/postcode-state";

export interface InspectionLocation {
  propertyCountry?: string | null;
  propertyPostcode?: string | null;
}

/** False only when the inspection is positively known to be outside Victoria. */
export function walkthroughAppliesAtLocation(location: InspectionLocation): boolean {
  const country = location.propertyCountry?.trim().toUpperCase();
  if (country === "NZ") return false;
  if (country !== "AU") return true;
  // stateFromPostcode strips non-digits, so "abc2000" would read as NSW. Only
  // a clean four-digit postcode is read; anything else is unreadable.
  const postcode = location.propertyPostcode?.trim() ?? "";
  if (!/^\d{4}$/.test(postcode)) return true;
  const state = stateFromPostcode(postcode);
  if (state === null) return true;
  return state === "VIC";
}
