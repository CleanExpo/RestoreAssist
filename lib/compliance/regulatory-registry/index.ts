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
import { BUILDING_CODE_ENTRIES } from "./building-code";
import { CHEMICALS_ENTRIES } from "./chemicals";
import { ELECTRICAL_ENTRIES } from "./electrical";
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
  ...ELECTRICAL_ENTRIES,
  ...CHEMICALS_ENTRIES,
  ...BUILDING_CODE_ENTRIES,
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

/** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
const EFFECTIVE_FROM = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export type DatePrecision = "day" | "month" | "year";

export interface EffectiveFromRange {
  precision: DatePrecision;
  /** Earliest day the rule could have commenced (inclusive), `YYYY-MM-DD`. */
  earliest: string;
  /** Latest day the rule could have commenced (inclusive), `YYYY-MM-DD`. */
  latest: string;
}

/**
 * Resolve `effectiveFrom` into the interval it actually denotes.
 *
 * A partial value is a range, not a point, and the two ends answer opposite
 * questions. Asking "was this rule certainly in force on D?" use `latest`;
 * asking "could it have been?" use `earliest`. Callers that compare
 * `effectiveFrom` as a raw string get the earliest end by accident and will
 * over-claim on a partial entry.
 */
export function effectiveFromRange(entry: RegulatoryEntry): EffectiveFromRange {
  const m = EFFECTIVE_FROM.exec(entry.effectiveFrom);
  if (!m) {
    throw new Error(
      `Entry "${entry.id}" has an unparseable effectiveFrom "${entry.effectiveFrom}". Use YYYY-MM-DD, YYYY-MM or YYYY.`,
    );
  }
  const [, year, month, day] = m;
  if (day) {
    return { precision: "day", earliest: entry.effectiveFrom, latest: entry.effectiveFrom };
  }
  if (month) {
    // Day 0 of the next month is the last day of this one, leap years included.
    const end = new Date(Date.UTC(Number(year), Number(month), 0));
    return {
      precision: "month",
      earliest: `${year}-${month}-01`,
      latest: `${year}-${month}-${String(end.getUTCDate()).padStart(2, "0")}`,
    };
  }
  return { precision: "year", earliest: `${year}-01-01`, latest: `${year}-12-31` };
}
