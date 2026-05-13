import type { MostRecentAuthorisation } from "./most-recent";

export const AUTHORISATION_MAX_AGE_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ModalState = "fresh" | "prefilled";

/**
 * Decide which state the EngagementLicenceModal should open in for the given
 * most-recent Authorisation. Returns "fresh" when the row is missing or older
 * than AUTHORISATION_MAX_AGE_DAYS; returns "prefilled" otherwise.
 */
export function needsModal(row: MostRecentAuthorisation | null): ModalState {
  if (!row) return "fresh";
  const ageMs = Date.now() - row.verifiedAt.getTime();
  if (ageMs >= AUTHORISATION_MAX_AGE_DAYS * MS_PER_DAY) return "fresh";
  return "prefilled";
}
