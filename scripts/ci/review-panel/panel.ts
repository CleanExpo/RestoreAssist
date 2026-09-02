/**
 * Review panel — merging several models' findings into one verdict.
 *
 * WHY A PANEL. A single reviewing model is one opinion with one set of blind
 * spots. Running several and keeping what they agree on turns a guess into
 * evidence, and it costs nothing extra when the seats are OpenRouter `:free`
 * variants (see roster.json).
 *
 * INDEPENDENCE IS THE WHOLE POINT, AND IT IS NOT THE SAME AS SEAT COUNT. Two
 * checkpoints of the same base model make the same mistakes, so their agreement
 * is close to worthless as corroboration. This module therefore counts votes by
 * `family`, not by seat: three Nemotron seats agreeing is ONE vote. That is the
 * difference between a panel and an echo.
 *
 * WHAT IT DOES NOT DO. It never approves, never blocks a merge, never pushes.
 * The output is advisory input to a human code owner, per REVIEW.md.
 */

/** Severity as defined in .claude/rules/review-dimensions.md. */
export type Severity = "critical" | "important" | "suggestion";

/** One finding as a single seat reported it. */
export interface Finding {
  dimension: number;
  severity: Severity;
  /** 0-100. REVIEW.md drops anything below MIN_CONFIDENCE. */
  confidence: number;
  file: string;
  line?: number;
  summary: string;
  failure_scenario: string;
}

/** One seat's whole response. */
export interface SeatResult {
  /** Seat id from roster.json, e.g. "nemotron-super". */
  seat: string;
  /**
   * Model family. Seats sharing a family share their blind spots and are
   * counted as one vote.
   */
  family: string;
  findings: Finding[];
  /** Set when the seat failed. A failed seat is absent, never a silent "no findings". */
  error?: string;
}

/** A finding after merging, carrying who reported it. */
export interface MergedFinding extends Finding {
  /** Seat ids that reported it. */
  seats: string[];
  /** Distinct families that reported it — the actual corroboration count. */
  families: string[];
  /** True when more than one FAMILY reported it. */
  corroborated: boolean;
}

export interface PanelVerdict {
  findings: MergedFinding[];
  /**
   * Critical findings that exactly one family reported. These are the ones worth
   * a tie-break: too consequential to drop, not corroborated enough to assert.
   */
  contestedCritical: MergedFinding[];
  /** Seats that failed, by id. Reported, never silently treated as agreement. */
  failedSeats: string[];
  /** Families that actually returned a result. */
  respondingFamilies: string[];
  /**
   * True when a tie-break is warranted. Consumers decide whether they have an
   * adjudicator available; this module only says whether one is called for.
   */
  needsAdjudication: boolean;
  /**
   * Set when the panel cannot support any conclusion — fewer than two families
   * responded, so nothing can be corroborated by definition.
   */
  degraded: boolean;
}

/** REVIEW.md: findings below this confidence are not reported. */
export const MIN_CONFIDENCE = 75;

/** Below this many responding families, corroboration is not defined. */
export const MIN_FAMILIES_FOR_CORROBORATION = 2;

/**
 * Two seats are talking about the same defect when they name the same dimension
 * and the same file, and their lines are close enough to be the same code.
 *
 * Line numbers are deliberately fuzzy: models routinely differ by a few lines on
 * the same defect, and demanding an exact match would split one finding into
 * several and destroy the corroboration signal the panel exists to produce. A
 * finding with no line at all matches on dimension and file alone.
 */
export const SAME_DEFECT_LINE_WINDOW = 10;

function sameDefect(a: Finding, b: Finding): boolean {
  if (a.dimension !== b.dimension) return false;
  if (normalisePath(a.file) !== normalisePath(b.file)) return false;
  if (a.line === undefined || b.line === undefined) return true;
  return Math.abs(a.line - b.line) <= SAME_DEFECT_LINE_WINDOW;
}

/** Strip a leading ./ or / so the same file from two seats compares equal. */
function normalisePath(file: string): string {
  return file.replace(/^\.?\//, "");
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  important: 2,
  suggestion: 1,
};

/**
 * Merge the panel's results.
 *
 * Severity takes the HIGHEST any seat assigned, not the average or the majority.
 * A panel that downgrades a security finding because two of four seats missed it
 * is worse than no panel: it manufactures reassurance. Disagreement about
 * severity is surfaced, never averaged away.
 */
export function mergePanel(results: SeatResult[]): PanelVerdict {
  const failedSeats = results.filter((r) => r.error).map((r) => r.seat);
  const responded = results.filter((r) => !r.error);
  const respondingFamilies = [...new Set(responded.map((r) => r.family))];

  const merged: MergedFinding[] = [];

  for (const result of responded) {
    for (const finding of result.findings) {
      if (finding.confidence < MIN_CONFIDENCE) continue;

      const existing = merged.find((m) => sameDefect(m, finding));
      if (existing) {
        if (!existing.seats.includes(result.seat)) existing.seats.push(result.seat);
        if (!existing.families.includes(result.family)) existing.families.push(result.family);
        if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
          existing.severity = finding.severity;
        }
        existing.confidence = Math.max(existing.confidence, finding.confidence);
        continue;
      }

      merged.push({
        ...finding,
        seats: [result.seat],
        families: [result.family],
        corroborated: false,
      });
    }
  }

  for (const m of merged) {
    m.corroborated = m.families.length >= MIN_FAMILIES_FOR_CORROBORATION;
  }

  const degraded = respondingFamilies.length < MIN_FAMILIES_FOR_CORROBORATION;

  // A lone family cannot corroborate anything, so "contested" is meaningless
  // there — every finding would be contested by construction. Say the panel is
  // degraded instead of raising a tie-break nobody can settle.
  const contestedCritical = degraded
    ? []
    : merged.filter((m) => m.severity === "critical" && !m.corroborated);

  merged.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.corroborated !== b.corroborated) return a.corroborated ? -1 : 1;
    return b.confidence - a.confidence;
  });

  return {
    findings: merged,
    contestedCritical,
    failedSeats,
    respondingFamilies,
    needsAdjudication: contestedCritical.length > 0,
    degraded,
  };
}

/**
 * Render the verdict as the PR comment body.
 *
 * States the basis, not a verdict: which families responded, which failed, and
 * for each finding how many independent families saw it. A reader must be able
 * to tell a finding three model families agreed on from one that a single seat
 * produced alone.
 */
export function renderVerdict(verdict: PanelVerdict, opts: { adjudicated?: boolean } = {}): string {
  const lines: string[] = ["## Review panel", ""];

  if (verdict.degraded) {
    lines.push(
      verdict.respondingFamilies.length === 0
        ? `> **Degraded run.** No model family responded at all, so this report says nothing whatever about the change. ` +
          `Do not read the absence of findings below as a clean result.`
        : `> **Degraded run.** Only ${verdict.respondingFamilies.length} model family responded, so nothing below is corroborated. ` +
          `Read every finding as one opinion.`,
      "",
    );
  }

  if (verdict.failedSeats.length > 0) {
    lines.push(
      `> Seats that did not return a result: ${verdict.failedSeats.join(", ")}. ` +
        `A seat that failed is absent, not agreement.`,
      "",
    );
  }

  // The footer disclaiming authority is appended on every path, including this
  // one. An early return here previously dropped it from exactly the report a
  // reader is most likely to skim — the all-clear.
  if (verdict.findings.length === 0) {
    lines.push(
      verdict.degraded
        ? "No findings — but from a degraded panel, so this is weak evidence of anything."
        : `No findings above the ${MIN_CONFIDENCE}% confidence threshold, across ${verdict.respondingFamilies.length} independent model families.`,
      "",
    );
    return [...lines, ...footer()].join("\n");
  }

  lines.push(
    `${verdict.findings.length} finding(s) from ${verdict.respondingFamilies.length} independent model families ` +
      `(${verdict.respondingFamilies.join(", ")}).`,
    "",
  );

  for (const f of verdict.findings) {
    const agreement = f.corroborated
      ? `${f.families.length} families agree`
      : `1 family only — not corroborated`;
    lines.push(
      `### ${f.severity.toUpperCase()} · dimension ${f.dimension} · ${f.file}${f.line ? `:${f.line}` : ""}`,
      "",
      f.summary,
      "",
      `*How it fails:* ${f.failure_scenario}`,
      "",
      `*Basis:* ${agreement} (${f.seats.join(", ")}), confidence ${f.confidence}.`,
      "",
    );
  }

  if (verdict.needsAdjudication && !opts.adjudicated) {
    lines.push(
      `> ${verdict.contestedCritical.length} Critical finding(s) came from a single model family and were not adjudicated. ` +
        `Treat them as unconfirmed leads, not as confirmed defects.`,
      "",
    );
  }

  return [...lines, ...footer()].join("\n");
}

/** Appended on every render path. See the empty-findings branch above for why. */
function footer(): string[] {
  return [
    "---",
    "",
    "Findings are advisory. This panel does not approve, block, or push — a code owner approves through branch protection.",
  ];
}
