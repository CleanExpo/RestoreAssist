/**
 * RA-7361 Critic/Scout bar — a scan that can go red.
 *
 * An absence of Australian or Queensland law on a New Zealand artefact is not
 * a measurement unless the same scan finds that law on an Australian control.
 * An empty pattern list, or a scanner that never matches, would make every NZ
 * assertion pass for a reason unrelated to the content.
 */

/** Statute citations that belong to Australia or Queensland, never New Zealand. */
export const AU_QLD_STATUTE_PATTERNS: readonly RegExp[] = [
  /Work Health and Safety Act 2011/,
  /Work Health and Safety Regulation/,
  /Occupational Health and Safety Act 2004/,
  /Environmental Protection Act 1994/,
  /Queensland Development Code/,
  /QDC 4\.5/,
  /National Construction Code/,
  /Building Code of Australia/,
  /WorkSafe QLD/,
  /QBCC/,
  /Safe ?Work Australia/,
  /SafeWork NSW/,
];

/** Regulator / legislation hosts that must not appear on an NZ artefact. */
export const AU_QLD_LINK_PATTERNS: readonly RegExp[] = [
  /safeworkaustralia\.gov\.au/i,
  /worksafe\.qld\.gov\.au/i,
  /legislation\.gov\.au/i,
  /legislation\.qld\.gov\.au/i,
  /safework\.nsw\.gov\.au/i,
  /worksafe\.vic\.gov\.au/i,
  /worksafe\.wa\.gov\.au/i,
  /safework\.sa\.gov\.au/i,
  /worksafe\.tas\.gov\.au/i,
  /worksafe\.act\.gov\.au/i,
  /worksafe\.nt\.gov\.au/i,
];

export function flattenStrings(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(flattenStrings).join("\n");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(flattenStrings)
      .join("\n");
  }
  return "";
}

function hits(text: string, patterns: readonly RegExp[]): string[] {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

export function auQldStatuteHits(value: unknown): string[] {
  return hits(flattenStrings(value), AU_QLD_STATUTE_PATTERNS);
}

export function auQldLinkHits(value: unknown): string[] {
  return hits(flattenStrings(value), AU_QLD_LINK_PATTERNS);
}
