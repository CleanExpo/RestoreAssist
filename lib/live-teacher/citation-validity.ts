/**
 * RA-7053 — citation-error classification for Live Teacher answers (pure).
 *
 * Assistant utterances persist their clause references in
 * `TeacherUtterance.clauseRefs` as bracketed tokens, e.g. "[S500:2021 §10.3.2]"
 * — the shape produced by lib/live-teacher/claude-cloud.ts:165 and asserted by
 * lib/live-teacher/__tests__/claude-cloud.test.ts:272. Trust those over the
 * schema comment (which shows an un-bracketed form and is stale).
 *
 * This module performs no I/O: it parses a stored ref, then classifies it
 * against an in-memory index built from the StandardsChunk corpus.
 */

export type CitationVerdict =
  | "valid"
  | "invalid_no_such_clause" // parseable but absent from the corpus — THE gate error
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

  const left = inner.slice(0, sectionIdx).trim();
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
}

export function buildCorpusIndex(
  rows: { standard: string; edition: string; clause: string }[],
): CorpusIndex {
  const clauseKeys = new Set<string>();
  const editionKeys = new Set<string>();
  for (const r of rows) {
    clauseKeys.add(`${r.standard}|${r.clause}`);
    editionKeys.add(`${r.standard}|${r.clause}|${r.edition}`);
  }
  return { clauseKeys, editionKeys };
}

export function classifyClauseRef(
  raw: string,
  corpus: CorpusIndex,
): CitationVerdict {
  const parsed = parseClauseRef(raw);
  if (!parsed) return "unparseable";

  const clauseKey = `${parsed.standard}|${parsed.clause}`;
  if (!corpus.clauseKeys.has(clauseKey)) return "invalid_no_such_clause";

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
