/**
 * RA-7573 Critic/Scout bar — a check that can go red.
 *
 * Portal shows N affected areas when the job has N rows. Empty only when
 * none. Dropping a blank `roomZoneId` is a silent omit: a 1-row job looks
 * empty and the walkthrough heading "Affected Areas" never appears.
 *
 * An absence of the heading is not "no areas" unless `dbCount` is 0.
 * Prefer-hide-over-invent still applies to *names* — never invent "Kitchen"
 * — but it does not authorise dropping the row.
 */

export function portalMustShowEveryAffectedArea(input: {
  dbCount: number;
  renderedCount: number;
  headingShown: boolean;
}): void {
  if (input.dbCount < 0 || input.renderedCount < 0) {
    throw new Error("affected-area counts must be >= 0");
  }
  if (input.renderedCount !== input.dbCount) {
    throw new Error(
      `silent omit: DB has ${input.dbCount} affected area(s), portal rendered ${input.renderedCount}`,
    );
  }
  const headingShouldShow = input.dbCount > 0;
  if (input.headingShown !== headingShouldShow) {
    throw new Error(
      input.dbCount === 0
        ? "portal showed Affected Areas when the job has none"
        : "portal omitted the Affected Areas heading while the job has areas",
    );
  }
}
