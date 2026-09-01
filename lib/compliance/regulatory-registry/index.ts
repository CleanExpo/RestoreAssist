/**
 * The regulatory registry — every legal claim RestoreAssist makes, with the
 * instrument behind it and the date it was checked.
 *
 * Read `docs/superpowers/specs/2026-09-01-regulatory-registry-spec.md` before
 * adding a domain. Two rules matter more than the rest:
 *
 *  1. Requirements are written in OUR words. AS/NZS, ISO and IICRC text is
 *     copyrighted; `lib/standards/copyright-guard.ts` exists because of it.
 *  2. An entry with no source or no `verifiedAt` fails the build. Correctness
 *     here is a cadence, not a snapshot -- silica changed twice in 2024, lead
 *     blood-level triggers in 2025, and exposure standards become limits in
 *     December 2026.
 */
import { ASBESTOS_ENTRIES } from "./asbestos";
import { SILICA_ENTRIES } from "./silica";
import type {
  RegulatoryDomain,
  RegulatoryEntry,
  RegulatoryJurisdiction,
} from "./types";

export * from "./types";

/** Every entry, in one place, so the gate can see all of them. */
export const REGULATORY_ENTRIES: readonly RegulatoryEntry[] = [
  ...ASBESTOS_ENTRIES,
  ...SILICA_ENTRIES,
];

const BY_ID = new Map(REGULATORY_ENTRIES.map((e) => [e.id, e]));

/**
 * Look an entry up by id.
 *
 * Throws rather than returning undefined: a document citing a regulation that
 * does not exist must not render with a blank where the law should be. The gate
 * catches this at build time; this is the runtime backstop.
 */
export function regulation(id: string): RegulatoryEntry {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(
      `Unknown regulatory entry "${id}". Add it to lib/compliance/regulatory-registry/ with its instrument, source and verifiedAt.`,
    );
  }
  return entry;
}

/** Every id, for the gate and for coverage tests. */
export function regulatoryIds(): string[] {
  return [...BY_ID.keys()];
}

/**
 * The entry governing a domain in a jurisdiction, preferring a state-specific
 * rule over the national one, and returning undefined when neither exists.
 *
 * Undefined is deliberate and must be surfaced, not defaulted: serving an
 * Australian rule on a New Zealand job is how a product tells a technician the
 * wrong law with total confidence.
 */
export function regulationFor(
  domain: RegulatoryDomain,
  jurisdiction: RegulatoryJurisdiction,
  idSuffix?: string,
): RegulatoryEntry | undefined {
  const candidates = REGULATORY_ENTRIES.filter(
    (e) => e.domain === domain && !e.supersededBy,
  );
  const matching = idSuffix
    ? candidates.filter((e) => e.id.includes(idSuffix))
    : candidates;

  return (
    matching.find((e) => e.jurisdiction === jurisdiction) ??
    matching.find(
      (e) =>
        e.jurisdiction === (jurisdiction === "NZ" ? "NZ" : "AU") &&
        e.jurisdiction !== jurisdiction,
    )
  );
}
