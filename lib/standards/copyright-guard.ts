/**
 * Copyright output-filter (RA-7000 Knowledge Wiki).
 *
 * IICRC standard text is copyrighted and legitimately available only via
 * IICRC/CARSI membership. RestoreAssist's grounding model:
 *
 *   - Store the verbatim standard text INTERNALLY (private Wiki/Supabase) for
 *     retrieval + grounding — never in this repo (enforced separately by
 *     scripts/check-no-verbatim-standards.ts).
 *   - Customer OUTPUT (inspection reports) may cite a clause and apply it in
 *     RestoreAssist's own words, but must NOT paste the copyrighted passage
 *     beyond incidental fair-use overlap.
 *   - MARKETING output carries zero verbatim tolerance: reference the framework
 *     and cite the clause number, never reproduce the standard's wording.
 *
 * This module is the OUTPUT-side check: given generated text and the source
 * standard chunks it was grounded on, it detects contiguous verbatim
 * reproduction and returns the offending spans so the caller can redact,
 * paraphrase, or block.
 *
 * IMPORTANT — this is a HEURISTIC, not a legal guarantee. It measures the
 * longest contiguous run of words reproduced verbatim from a source chunk
 * (an n-gram / longest-common-verbatim-span approach). It does NOT understand
 * paraphrase, translation, or reordering, and it cannot rule on fair use. It
 * exists to stop the obvious redistribution-bypass failure mode (the model
 * pasting a chapter of copyrighted prose into a customer report or an ad),
 * not to replace legal review. See docs/rag/copyright-output-filter.md.
 *
 * Pure string/n-gram logic — no dependencies, no I/O.
 */

export type CopyrightGuardMode = "report" | "marketing";

/**
 * Tunable thresholds. Defaults are documented + justified in
 * docs/rag/copyright-output-filter.md. All run lengths are counted in
 * NORMALISED WORDS (lowercased alphanumeric tokens), so punctuation and
 * whitespace differences do not defeat the match.
 */
export interface CopyrightGuardConfig {
  /**
   * Report mode: a contiguous verbatim run of at least this many words,
   * matching a source chunk, is treated as reproduction (flag + redact).
   * Default 12 — short factual phrases and citations naturally overlap with
   * the standards; a dozen consecutive words reproduced from copyrighted
   * prose is reproduction, not incidental.
   */
  reportMinRunWords: number;
  /**
   * Marketing mode: near-zero tolerance. A contiguous verbatim run of at
   * least this many words is blocked. Default 6 — low enough to catch a
   * copied clause, high enough to avoid false-positiving on trivial
   * stopword sequences ("the water damage restoration industry") that are
   * not the copyrighted expression.
   */
  marketingMinRunWords: number;
  /**
   * Secondary trigger for BOTH modes: if a single contiguous verbatim run
   * reproduces at least this fraction of the source chunk it came from, flag
   * it regardless of absolute length. Catches a short-but-whole clause being
   * lifted verbatim. Default 0.5 (half the source chunk reproduced contiguously).
   */
  maxChunkCoverageRatio: number;
}

export const DEFAULT_COPYRIGHT_GUARD_CONFIG: CopyrightGuardConfig = {
  reportMinRunWords: 12,
  marketingMinRunWords: 6,
  maxChunkCoverageRatio: 0.5,
};

/**
 * The seed length is the absolute detection floor: runs shorter than this are
 * never reported, no matter how the thresholds are configured. Four consecutive
 * words is already specific enough to be a deliberate copy rather than
 * incidental overlap, and it keeps the detector near-linear (a 4-gram index
 * avoids the stopword explosion a 1-gram seed would cause). A configured
 * threshold below the floor is clamped up to it.
 */
export const SEED_LEN = 4;

/** Placeholder that replaces a redacted verbatim span in report mode. */
export const REDACTION_PLACEHOLDER =
  "[[REDACTED: reproduced standard text — paraphrase in your own words and keep the clause citation]]";

export interface VerbatimSpan {
  /** The offending text, sliced from the ORIGINAL output (original casing/punctuation). */
  readonly text: string;
  /** Character offset (inclusive) into the original output string. */
  readonly startIndex: number;
  /** Character offset (exclusive) into the original output string. */
  readonly endIndex: number;
  /** Number of contiguous normalised words in the run. */
  readonly wordCount: number;
  /** Index of the source chunk this run was reproduced from. */
  readonly sourceChunkIndex: number;
  /** Fraction of that source chunk (in words) reproduced by this contiguous run (0..1). */
  readonly sourceCoverageRatio: number;
}

export interface CopyrightGuardResult {
  readonly mode: CopyrightGuardMode;
  /** True when the output is safe to publish as-is under this mode. */
  readonly ok: boolean;
  /** Spans that breached the mode's threshold — empty when ok. */
  readonly violations: readonly VerbatimSpan[];
  /**
   * ALL detected verbatim runs at/above the absolute detection floor, whether
   * or not they breached the mode threshold. Diagnostic — lets a caller show
   * "closest verbatim overlap" even on a passing check.
   */
  readonly detectedRuns: readonly VerbatimSpan[];
  /** Word length of the longest contiguous verbatim run found (0 if none). */
  readonly longestRunWords: number;
  /**
   * Output text with each VIOLATING span replaced by REDACTION_PLACEHOLDER.
   * In report mode this is a safe-to-store draft the caller can hand back for
   * paraphrasing. In marketing mode the caller should REWRITE rather than ship
   * the placeholder version.
   */
  readonly redactedText: string;
  /** Caller-facing, human-readable guidance for what to do next. */
  readonly guidance: string;
}

interface OutputToken {
  readonly norm: string;
  readonly start: number;
  readonly end: number;
}

interface CandidateRun {
  startTok: number;
  endTok: number; // exclusive
  wordCount: number;
  sourceChunkIndex: number;
  sourceCoverageRatio: number;
}

const WORD_RE = /[A-Za-z0-9]+/g;

/** Tokenise into normalised alphanumeric words, keeping char offsets. */
function tokenizeOutput(text: string): OutputToken[] {
  const toks: OutputToken[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    toks.push({
      norm: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return toks;
}

function normWords(text: string): string[] {
  WORD_RE.lastIndex = 0;
  return (text.match(WORD_RE) ?? []).map((w) => w.toLowerCase());
}

/**
 * Build a seed index over the source chunks: a SEED_LEN-gram (joined) → every
 * (chunkIndex, position) where it occurs. This lets us find candidate match
 * starts in near-linear time before extending them to their maximal run.
 */
function buildSeedIndex(
  sourceTokens: readonly string[][],
): Map<string, Array<[number, number]>> {
  const index = new Map<string, Array<[number, number]>>();
  sourceTokens.forEach((toks, chunkIdx) => {
    for (let j = 0; j + SEED_LEN <= toks.length; j++) {
      const key = toks.slice(j, j + SEED_LEN).join(" ");
      const bucket = index.get(key);
      if (bucket) bucket.push([chunkIdx, j]);
      else index.set(key, [[chunkIdx, j]]);
    }
  });
  return index;
}

/**
 * Find every maximal contiguous verbatim run (in output tokens) that also
 * appears contiguously in some source chunk. "Maximal" = extended as far left
 * and right as the match holds. Runs fully contained within a longer run are
 * dropped so each reproduced passage is reported once.
 */
function findMaximalRuns(
  outNorm: string[],
  sourceTokens: readonly string[][],
): CandidateRun[] {
  if (outNorm.length < SEED_LEN || sourceTokens.length === 0) return [];
  const index = buildSeedIndex(sourceTokens);
  const raw: CandidateRun[] = [];

  for (let i = 0; i + SEED_LEN <= outNorm.length; i++) {
    const key = outNorm.slice(i, i + SEED_LEN).join(" ");
    const cands = index.get(key);
    if (!cands) continue;

    let best: CandidateRun | null = null;
    for (const [chunkIdx, j] of cands) {
      const src = sourceTokens[chunkIdx];
      let len = SEED_LEN;
      while (
        i + len < outNorm.length &&
        j + len < src.length &&
        outNorm[i + len] === src[j + len]
      ) {
        len++;
      }
      let back = 0;
      while (
        i - back - 1 >= 0 &&
        j - back - 1 >= 0 &&
        outNorm[i - back - 1] === src[j - back - 1]
      ) {
        back++;
      }
      const startTok = i - back;
      const endTok = i + len;
      const wordCount = endTok - startTok;
      const coverage = src.length > 0 ? wordCount / src.length : 0;
      // Prefer the longest run; tie-break on the run that covers more of its
      // (shorter) source chunk, since that is the stronger reproduction signal.
      if (
        !best ||
        wordCount > best.wordCount ||
        (wordCount === best.wordCount && coverage > best.sourceCoverageRatio)
      ) {
        best = {
          startTok,
          endTok,
          wordCount,
          sourceChunkIndex: chunkIdx,
          sourceCoverageRatio: coverage,
        };
      }
    }
    if (best) raw.push(best);
  }

  // Drop runs whose output-token interval is contained in a longer accepted run.
  raw.sort((a, b) => b.wordCount - a.wordCount);
  const accepted: CandidateRun[] = [];
  for (const run of raw) {
    const contained = accepted.some(
      (acc) => acc.startTok <= run.startTok && acc.endTok >= run.endTok,
    );
    if (!contained) accepted.push(run);
  }
  return accepted;
}

function toSpan(run: CandidateRun, outToks: OutputToken[], output: string): VerbatimSpan {
  const startIndex = outToks[run.startTok].start;
  const endIndex = outToks[run.endTok - 1].end;
  return {
    text: output.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    wordCount: run.wordCount,
    sourceChunkIndex: run.sourceChunkIndex,
    sourceCoverageRatio: run.sourceCoverageRatio,
  };
}

function clampThreshold(value: number): number {
  return Math.max(SEED_LEN, Math.floor(value));
}

/** Replace violating character spans with the redaction placeholder. */
function redact(output: string, violations: readonly VerbatimSpan[]): string {
  if (violations.length === 0) return output;
  // Merge overlapping intervals (distinct violations can partially overlap when
  // they map to different source chunks) before splicing.
  const sorted = [...violations].sort((a, b) => a.startIndex - b.startIndex);
  const merged: Array<{ start: number; end: number }> = [];
  for (const v of sorted) {
    const last = merged[merged.length - 1];
    if (last && v.startIndex <= last.end) {
      last.end = Math.max(last.end, v.endIndex);
    } else {
      merged.push({ start: v.startIndex, end: v.endIndex });
    }
  }
  let result = "";
  let cursor = 0;
  for (const { start, end } of merged) {
    result += output.slice(cursor, start) + REDACTION_PLACEHOLDER;
    cursor = end;
  }
  result += output.slice(cursor);
  return result;
}

/**
 * Core enforcement entry point. Detects verbatim reproduction of the source
 * standard chunks in `text` and applies the mode's tolerance.
 *
 * @param text          Generated output to check (report body, ad copy, etc.).
 * @param sourceChunks  The copyrighted standard passages the output was grounded
 *                      on. Only reproduction of THESE is flagged.
 * @param mode          "report" (fair-use threshold, redact + paraphrase) or
 *                      "marketing" (near-zero tolerance, block).
 * @param config        Optional threshold overrides.
 */
export function guardStandardOutput(
  text: string,
  sourceChunks: readonly string[],
  mode: CopyrightGuardMode,
  config: Partial<CopyrightGuardConfig> = {},
): CopyrightGuardResult {
  const cfg: CopyrightGuardConfig = { ...DEFAULT_COPYRIGHT_GUARD_CONFIG, ...config };
  const minRun = clampThreshold(
    mode === "marketing" ? cfg.marketingMinRunWords : cfg.reportMinRunWords,
  );

  const outToks = tokenizeOutput(text);
  const outNorm = outToks.map((t) => t.norm);
  const sourceTokens = sourceChunks.map(normWords).filter((t) => t.length >= SEED_LEN);

  const runs = findMaximalRuns(outNorm, sourceTokens);
  const detectedRuns = runs.map((r) => toSpan(r, outToks, text));
  const longestRunWords = detectedRuns.reduce((max, s) => Math.max(max, s.wordCount), 0);

  const violations = detectedRuns.filter(
    (s) =>
      s.wordCount >= minRun || s.sourceCoverageRatio >= cfg.maxChunkCoverageRatio,
  );
  const ok = violations.length === 0;
  const redactedText = redact(text, violations);

  return {
    mode,
    ok,
    violations,
    detectedRuns,
    longestRunWords,
    redactedText,
    guidance: buildGuidance(mode, ok, violations, minRun),
  };
}

function buildGuidance(
  mode: CopyrightGuardMode,
  ok: boolean,
  violations: readonly VerbatimSpan[],
  minRun: number,
): string {
  if (ok) {
    return mode === "marketing"
      ? "No verbatim standard text detected. Safe to publish — keep referencing the framework and citing clause numbers only."
      : "No verbatim reproduction above the fair-use threshold. Safe to store — the report cites and applies the standards in its own words.";
  }
  if (mode === "marketing") {
    return `Blocked: ${violations.length} verbatim standard span(s) detected. Marketing carries zero verbatim tolerance — reference the IICRC framework and cite the clause number, but rewrite the wording entirely. IICRC standard text is available only via IICRC/CARSI membership.`;
  }
  return `Reproduction detected: ${violations.length} span(s) reproduce standard prose beyond the fair-use threshold (${minRun}+ contiguous words). Redact the flagged prose and paraphrase it in RestoreAssist's own words. KEEP the clause citation — only the copyrighted wording is the problem.`;
}

/**
 * Prompt-side guard. Include this in the report and Margot generation prompts
 * so the model is instructed up front to ground on the standard text without
 * reproducing it. The output-side guardStandardOutput remains the enforcement
 * backstop — the instruction reduces violations, it does not replace the check.
 */
export const COPYRIGHT_GROUNDING_INSTRUCTION = [
  "COPYRIGHT — IICRC standard text is copyrighted and licensed only via IICRC/CARSI membership.",
  "Ground your answer on the provided standard text, but express every requirement in your OWN words.",
  "Cite the clause (edition + section, e.g. S500:2021 §12.5), never reproduce the standard's wording verbatim.",
  "Do not paste sentences or passages from the standard into the output.",
  "If a user needs the exact source text, direct them to IICRC/CARSI membership — do not redistribute it.",
].join("\n");

/**
 * Append the copyright-grounding instruction to an existing prompt. Idempotent:
 * will not double-append if the instruction is already present.
 */
export function appendCopyrightGroundingInstruction(prompt: string): string {
  if (prompt.includes(COPYRIGHT_GROUNDING_INSTRUCTION)) return prompt;
  const separator = prompt.endsWith("\n") ? "\n" : "\n\n";
  return `${prompt}${separator}${COPYRIGHT_GROUNDING_INSTRUCTION}\n`;
}
