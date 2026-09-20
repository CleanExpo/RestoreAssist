/**
 * RA-7550 — wording that falsely makes photos or an IN_PROGRESS status a
 * prerequisite for a Basic AI draft. Shared by the unit, component, article
 * and E2E honesty tests so every surface rejects the same claims.
 *
 * Backticks are optional because rendered MDX drops them. Patterns target the
 * affirmative form ("requires photos"), so the true negative copy ("does not
 * require photos") stays allowed.
 */
export const FORBIDDEN_PREREQUISITE_CLAIMS: readonly RegExp[] = [
  /photos? (?:are|is) (?:required|mandatory)/i,
  /\brequires (?:at least \d+ )?photos/i,
  /at least \d+ photos|≥\s*\d+ photos/i,
  /stays disabled until/i,
  /inspection in `?IN_PROGRESS`?/i,
  /(?:must be|requires|needs) (?:an? )?(?:inspection (?:in|with) )?(?:an? )?`?IN_PROGRESS`?/i,
  /(?:must|needs to) be in[- ]progress/i,
];

/** Every forbidden claim found in `text`, for a readable failure message. */
export function findPrerequisiteClaims(text: string): string[] {
  // JSX and MDX wrap sentences across lines ("Photos\n    are required"), so
  // collapse whitespace before matching or a wrapped claim slips through.
  const flat = text.replace(/\s+/g, " ");
  return FORBIDDEN_PREREQUISITE_CLAIMS.filter((re) => re.test(flat)).map(
    (re) => String(re),
  );
}
