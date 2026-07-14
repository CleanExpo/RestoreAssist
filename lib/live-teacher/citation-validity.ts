/**
 * RA-7053 — citation-error classification for Live Teacher answers (pure).
 *
 * Assistant utterances persist their clause references in
 * `TeacherUtterance.clauseRefs` as bracketed tokens, e.g. "[S500:2021 §10.3.2]"
 * — the shape produced by lib/live-teacher/claude-cloud.ts:165 and asserted by
 * lib/live-teacher/__tests__/claude-cloud.test.ts:272. Trust those over the
 * schema comment (which shows an un-bracketed form and is stale).
 *
 * This module performs no I/O. It parses a stored ref, then classifies it:
 *   - S500 refs validate at SECTION granularity against the in-repo, facts-only
 *     `S500_SECTIONS` map (always available, even when StandardsChunk is empty on
 *     production — that map is the same source the check:standards gate uses).
 *   - Every other standard validates against an in-memory index built from the
 *     StandardsChunk corpus; with no in-repo section source it stays `unknown`.
 */

import { S500_SECTIONS } from "../standards/s500-sections";

export type CitationVerdict =
  | "valid"
  | "invalid_no_such_clause" // parseable, standard IS in the corpus, clause absent — THE gate error
  | "unknown" // parseable, but the corpus carries no clauses for this ref's standard (or is empty) — "collecting", NOT an error
  | "edition_mismatch" // clause exists, edition differs — SOFT (single-edition corpus)
  | "unparseable"; // matched the stored-ref shape but the parser could not split it

export interface ParsedClauseRef {
  standard: string; // StandardsChunk.standard value, e.g. "IICRC_S500"
  clause: string; // e.g. "10.3.2"
  edition: string | null; // e.g. "2021" — optional in the stored token
}

export interface StandardClausePair {
  standard: string;
  clause: string;
}

export interface RefVerdict {
  ref: string;
  verdict: CitationVerdict;
}

// Token (left of §, before any ":edition") → StandardsChunk.standard value.
const TOKEN_TO_STANDARD: Record<string, string> = {
  S500: "IICRC_S500",
  "AS/NZS 4360": "AS_NZS_4360",
  "AS/NZS 4849.1": "AS_NZS_4849_1",
  "NZBS E2": "NZBS_E2",
  "NZBS E3": "NZBS_E3",
};

/**
 * Parse the bracketed stored form "[S500:2021 §10.3.2]".
 * Returns null when the shape is malformed or the token is unrecognised.
 */
export function parseClauseRef(raw: string): ParsedClauseRef | null {
  if (!raw) return null;
  let inner = raw.trim();
  // Strip a single surrounding bracket pair if present.
  if (inner.startsWith("[")) inner = inner.slice(1);
  if (inner.endsWith("]")) inner = inner.slice(0, -1);

  const sectionIdx = inner.indexOf("§");
  if (sectionIdx === -1) return null;

  // Tolerate the natural "[IICRC S500:2021 §10.5]" phrasing the extractor now
  // keeps: strip an optional leading "IICRC " so it parses identically to the
  // un-prefixed "[S500:2021 §10.5]".
  const left = inner
    .slice(0, sectionIdx)
    .trim()
    .replace(/^IICRC\s+/i, "");
  const clause = inner.slice(sectionIdx + 1).trim();
  if (!left || !clause) return null;

  // Split the standard token from an optional ":edition".
  const colonIdx = left.indexOf(":");
  const token = (colonIdx === -1 ? left : left.slice(0, colonIdx)).trim();
  const edition =
    colonIdx === -1 ? null : left.slice(colonIdx + 1).trim() || null;

  const standard = TOKEN_TO_STANDARD[token];
  if (!standard) return null;

  return { standard, clause, edition };
}

export interface CorpusIndex {
  /** `${standard}|${clause}` for every corpus row (edition-agnostic). */
  clauseKeys: Set<string>;
  /** `${standard}|${clause}|${edition}` for every corpus row. */
  editionKeys: Set<string>;
  /**
   * Every distinct `standard` present in the corpus. A parseable ref whose
   * standard is NOT here cannot be validated (the corpus carries none of that
   * standard's clauses), so it is classified `unknown`, never fabricated.
   */
  standards: Set<string>;
}

export function buildCorpusIndex(
  rows: { standard: string; edition: string; clause: string }[],
): CorpusIndex {
  const clauseKeys = new Set<string>();
  const editionKeys = new Set<string>();
  const standards = new Set<string>();
  for (const r of rows) {
    clauseKeys.add(`${r.standard}|${r.clause}`);
    editionKeys.add(`${r.standard}|${r.clause}|${r.edition}`);
    standards.add(r.standard);
  }
  return { clauseKeys, editionKeys, standards };
}

// StandardsChunk.standard value for S500, and the single edition the in-repo
// S500_SECTIONS map transcribes (ANSI/IICRC S500-2021, 5th ed.).
const S500_STANDARD = "IICRC_S500";
const S500_EDITION = "2021";

/**
 * Validate an S500 ref at SECTION (chapter) granularity against the in-repo
 * `S500_SECTIONS` map. The map is always present (facts-only, no corpus needed),
 * so S500 citations are genuinely validatable even when StandardsChunk is empty.
 * Extracts the top-level chapter (`§10.3.2` → "10", `§7` → "7") and checks it
 * exists. A real chapter cited under a non-2021 edition is a SOFT
 * `edition_mismatch` (the map is single-edition), not a fabrication.
 */
function classifyS500Ref(parsed: ParsedClauseRef): CitationVerdict {
  const chapter = parsed.clause.split(".")[0];
  if (S500_SECTIONS[chapter] === undefined) return "invalid_no_such_clause";
  if (parsed.edition !== null && parsed.edition !== S500_EDITION) {
    return "edition_mismatch";
  }
  return "valid";
}

export function classifyClauseRef(
  raw: string,
  corpus: CorpusIndex,
): CitationVerdict {
  const parsed = parseClauseRef(raw);
  if (!parsed) return "unparseable";

  // S500 validates against the in-repo section map, independent of the
  // (production-empty) StandardsChunk corpus. Standards with no in-repo section
  // source fall through to the corpus logic below and stay `unknown`.
  if (parsed.standard === S500_STANDARD) return classifyS500Ref(parsed);

  const clauseKey = `${parsed.standard}|${parsed.clause}`;
  if (!corpus.clauseKeys.has(clauseKey)) {
    // The clause is not in the corpus. Only call this a fabrication when the
    // corpus actually CARRIES this standard's clauses (so a genuine absence is
    // provable). When the corpus is empty, or holds no clauses for this ref's
    // standard, there is nothing to validate against — classify `unknown`
    // ("collecting"), NOT `invalid_no_such_clause`. This is what keeps the
    // citation gate honest when the S500-clause corpus is unconfigured
    // (StandardsChunk has 0 rows on production).
    if (!corpus.standards.has(parsed.standard)) return "unknown";
    return "invalid_no_such_clause";
  }

  // The clause exists. If the ref pins an edition the corpus does not carry,
  // that is a SOFT mismatch (the in-house corpus is single-edition), not a
  // gate error.
  if (parsed.edition !== null) {
    if (!corpus.editionKeys.has(`${clauseKey}|${parsed.edition}`)) {
      return "edition_mismatch";
    }
  }
  return "valid";
}

/**
 * Distinct (standard, clause) pairs across all parseable refs — feeds the
 * single `standardsChunk.findMany({ where: { OR: pairs } })` corpus lookup.
 */
export function collectDistinctPairs(rawRefs: string[]): StandardClausePair[] {
  const seen = new Set<string>();
  const out: StandardClausePair[] = [];
  for (const raw of rawRefs) {
    const parsed = parseClauseRef(raw);
    if (!parsed) continue;
    const key = `${parsed.standard}|${parsed.clause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ standard: parsed.standard, clause: parsed.clause });
  }
  return out;
}

/** Classify every ref on one utterance (for the per-utterance audit trail). */
export function classifyRefs(
  rawRefs: string[],
  corpus: CorpusIndex,
): RefVerdict[] {
  return rawRefs.map((ref) => ({ ref, verdict: classifyClauseRef(ref, corpus) }));
}
