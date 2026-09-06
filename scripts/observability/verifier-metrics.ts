/**
 * Metrics from the Stop-hook verifier, and the control bands over them.
 *
 * WHY THE VERIFIER IS THE FIRST METRIC. It is the only signal this repository
 * already produces about its own agent sessions: 379 reports recording, per
 * turn, whether a completion claim was backed by something that actually ran.
 * That is the failure `.claude/rules/verification-gate.md` exists to prevent,
 * measured rather than asserted.
 *
 * DETECTION IS DETERMINISTIC. No model is involved in deciding whether a band
 * is breached. A model in the detector would make the alarm fail in the same
 * ways as the thing it is watching, which is the one correlation you cannot
 * afford in a control.
 *
 * WHAT THIS MODULE REFUSES TO DO. It will not emit a sigma verdict on thin
 * data. The existing corpus spans 116 days but contains only SIX active days
 * across FOUR sessions, with 225 of the 379 reports on a single day. A rolling
 * 30-day mean and standard deviation over that is arithmetic, not evidence:
 * most windows are empty, and sigma computed across them says more about when
 * somebody happened to be working than about the agent. So `detect` returns
 * `insufficient-data` until it has enough populated windows, and says how many
 * it has. Reporting a confident band breach off six days would be the exact
 * defect the verifier itself catches.
 */

/** A verification as the Stop hook recorded it. */
export interface VerifierReport {
  sessionId: string;
  /** Unix seconds, from the filename. */
  timestamp: number;
  /** e.g. "claim-truthfulness-static", "ios-app-review". */
  domain: string;
  status: string;
  /** Present on the full report shape; absent on the terse `{status, reason}` one. */
  claimsTotal?: number;
  claimsFailed?: number;
  claimsWarned?: number;
}

export interface MetricWindow {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  total: number;
  /** Turns stopped because a claim was not backed by anything that ran. */
  failed: number;
  /** Turns where the verifier raised a warning without blocking. */
  warned: number;
  /**
   * Turns where the verifier could not run at all.
   *
   * This is the one that matters most and is the easiest to miss: an
   * unavailable verifier is a control that is OFF, and it looks identical to a
   * clean run in any summary that only counts failures.
   */
  unavailable: number;
}

export interface MetricSummary {
  windows: MetricWindow[];
  totalReports: number;
  /** Days that actually contain at least one report. */
  populatedWindows: number;
  distinctSessions: number;
  /** failed / total across the whole corpus. */
  unbackedClaimRate: number;
  /** unavailable / total across the whole corpus. */
  unavailableRate: number;
  spanDays: number;
}

/**
 * Below this many populated windows, no sigma verdict is offered.
 *
 * Western Electric rules need a baseline whose spread means something. Eight is
 * the smallest number at which the run rules this detector would use have any
 * discriminating power at all, and the existing corpus has six.
 */
export const MIN_POPULATED_WINDOWS = 8;

/**
 * An unavailable verifier is judged against a fixed threshold, not a band.
 *
 * A control that is off is not an anomaly to be detected relative to how often
 * it is usually off. There is no acceptable background rate, so this needs no
 * baseline and fires from the first window — which is the whole reason it is
 * the signal worth wiring first.
 */
export const UNAVAILABLE_THRESHOLD = 0.02;

/**
 * A deviation must also be a real change, not just a large sigma count.
 *
 * Sigma is a ratio, so a baseline that barely moves makes any movement enormous
 * in sigma terms: 0.0% to 0.4% against a very tight baseline reads as a
 * six-sigma excursion. Escalation beyond `log` therefore also requires the
 * absolute rate to have moved by at least this much.
 */
export const MIN_ABSOLUTE_MOVEMENT = 0.02;

/**
 * The `propose` tier lets an agent open a pull request with no person having
 * started it (see bands.yaml). One failing turn must not be enough to authorise
 * that, however extreme it looks against a clean baseline, so a window needs at
 * least this many failures before the ladder goes past `diagnose`.
 */
export const MIN_EVENTS_FOR_PROPOSE = 3;

const FAILING_STATUSES = new Set(["failed"]);
const WARNING_STATUSES = new Set(["partial"]);
const UNAVAILABLE_STATUSES = new Set([
  "verifier-unavailable",
  "verifier-error",
]);

/** Parse `<session-uuid>-<epoch>-<domain>.json` into its parts. */
export function parseReportFilename(
  filename: string,
): { sessionId: string; timestamp: number; domain: string } | null {
  const base = filename.replace(/^.*\//, "").replace(/\.json$/, "");
  const m = /^([0-9a-f-]{36})-(\d{10})-(.+)$/.exec(base);
  if (!m) return null;
  return { sessionId: m[1], timestamp: Number(m[2]), domain: m[3] };
}

function dayOf(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/**
 * Roll reports up per day.
 *
 * Days with no reports are NOT filled in as zeros. A day nobody worked is
 * missing data, not a day with a perfect score, and padding it would drag any
 * later mean toward zero and make a genuine spike look ordinary.
 */
export function summarise(reports: VerifierReport[]): MetricSummary {
  const byDay = new Map<string, MetricWindow>();
  const sessions = new Set<string>();
  let failed = 0;
  let unavailable = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const r of reports) {
    sessions.add(r.sessionId);
    min = Math.min(min, r.timestamp);
    max = Math.max(max, r.timestamp);

    const day = dayOf(r.timestamp);
    const w =
      byDay.get(day) ?? { day, total: 0, failed: 0, warned: 0, unavailable: 0 };
    w.total += 1;
    if (FAILING_STATUSES.has(r.status) || (r.claimsFailed ?? 0) > 0) {
      w.failed += 1;
      failed += 1;
    } else if (WARNING_STATUSES.has(r.status) || (r.claimsWarned ?? 0) > 0) {
      w.warned += 1;
    }
    if (UNAVAILABLE_STATUSES.has(r.status)) {
      w.unavailable += 1;
      unavailable += 1;
    }
    byDay.set(day, w);
  }

  const windows = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const total = reports.length;

  return {
    windows,
    totalReports: total,
    populatedWindows: windows.length,
    distinctSessions: sessions.size,
    unbackedClaimRate: total === 0 ? 0 : failed / total,
    unavailableRate: total === 0 ? 0 : unavailable / total,
    spanDays:
      total === 0 ? 0 : Math.round(((max - min) / 86400) * 10) / 10,
  };
}

export type Tier = "ok" | "log" | "diagnose" | "propose" | "insufficient-data";

export interface Detection {
  metric: string;
  tier: Tier;
  /** One sentence a person can act on, or that explains why nothing is claimed. */
  reason: string;
  /** The observed value, where one is meaningful. */
  value?: number;
}

/**
 * Judge the current position against the bands.
 *
 * Two metrics, judged differently on purpose:
 *
 *   verifier_unavailable_rate  a fixed threshold, no baseline needed, because a
 *                              control that is off has no acceptable background
 *                              rate to be measured against.
 *   unbacked_claim_rate        a control band, which needs a baseline, which
 *                              this corpus does not yet have.
 */
export function detect(summary: MetricSummary): Detection[] {
  const out: Detection[] = [];

  // --- Fixed threshold: is the gate even running? ---
  if (summary.totalReports === 0) {
    out.push({
      metric: "verifier_unavailable_rate",
      tier: "insufficient-data",
      reason: "No verifier reports found. That is not a clean result — it means nothing was measured.",
    });
  } else if (summary.unavailableRate > UNAVAILABLE_THRESHOLD) {
    out.push({
      metric: "verifier_unavailable_rate",
      tier: "diagnose",
      value: summary.unavailableRate,
      reason:
        `The verifier could not run on ${(summary.unavailableRate * 100).toFixed(1)}% of turns ` +
        `(threshold ${(UNAVAILABLE_THRESHOLD * 100).toFixed(0)}%). On those turns the LLM stage of the ` +
        `gate was OFF, which reads identically to a clean pass in any summary that only counts failures. ` +
        `Usual cause is a missing API key: check the resolution order in .claude/hooks/lib/openrouter-call.sh.`,
    });
  } else {
    out.push({
      metric: "verifier_unavailable_rate",
      tier: "ok",
      value: summary.unavailableRate,
      reason: `The verifier ran on ${((1 - summary.unavailableRate) * 100).toFixed(1)}% of turns.`,
    });
  }

  // --- Control band: how often is a claim caught unbacked? ---
  if (summary.populatedWindows < MIN_POPULATED_WINDOWS) {
    out.push({
      metric: "unbacked_claim_rate",
      tier: "insufficient-data",
      value: summary.unbackedClaimRate,
      reason:
        `${summary.populatedWindows} populated day(s) across ${summary.distinctSessions} session(s), ` +
        `below the ${MIN_POPULATED_WINDOWS} needed for a baseline. The rate so far is ` +
        `${(summary.unbackedClaimRate * 100).toFixed(2)}%, reported as an observation and NOT as a band ` +
        `position — a mean and sigma over this many windows would describe when somebody happened to be ` +
        `working, not how the agent behaves.`,
    });
    return out;
  }

  const rates = summary.windows.map((w) => (w.total === 0 ? 0 : w.failed / w.total));
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance =
    rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
  const sigma = Math.sqrt(variance);
  const latest = rates[rates.length - 1];

  // Every window identical. Sigma is 0 and so is the deviation; there is
  // nothing to escalate. Note this can only happen when the latest window
  // equals the mean too -- a differing latest value would itself create spread
  // -- so there is no "flat baseline that moved" case to handle here. An
  // earlier version of this function had one, and it was unreachable code.
  if (sigma === 0) {
    out.push({
      metric: "unbacked_claim_rate",
      tier: "ok",
      value: latest,
      reason: `Flat at ${(mean * 100).toFixed(2)}% across ${rates.length} windows.`,
    });
    return out;
  }

  const deviations = (latest - mean) / sigma;
  const movement = Math.abs(latest - mean);
  const latestWindow = summary.windows[summary.windows.length - 1];

  let tier: Tier =
    deviations >= 3 ? "propose" : deviations >= 2 ? "diagnose" : deviations >= 1 ? "log" : "ok";
  const caps: string[] = [];

  // A nearly-flat baseline has a tiny sigma, so a trivial movement is arbitrarily
  // many sigmas out. Without a floor on the absolute change, a rate going from
  // 0.0% to 0.4% reads as a 6-sigma excursion and escalates.
  if (tier !== "ok" && movement < MIN_ABSOLUTE_MOVEMENT) {
    tier = "log";
    caps.push(
      `held at log: the absolute move of ${(movement * 100).toFixed(2)}pp is below the ` +
        `${(MIN_ABSOLUTE_MOVEMENT * 100).toFixed(0)}pp floor, and a tight baseline makes a small ` +
        `change look like a large sigma count`,
    );
  }

  // `propose` authorises an agent to open a pull request with nobody having
  // started it. One bad turn must not be enough to buy that, however extreme it
  // looks against a clean baseline.
  if (tier === "propose" && latestWindow.failed < MIN_EVENTS_FOR_PROPOSE) {
    tier = "diagnose";
    caps.push(
      `held at diagnose: ${latestWindow.failed} failing turn(s) in the window is below the ` +
        `${MIN_EVENTS_FOR_PROPOSE} needed before an agent may open a pull request unprompted`,
    );
  }

  out.push({
    metric: "unbacked_claim_rate",
    tier,
    value: latest,
    reason:
      `Latest window ${(latest * 100).toFixed(2)}% against a ${rates.length}-window mean of ` +
      `${(mean * 100).toFixed(2)}% (sigma ${(sigma * 100).toFixed(2)}pp), ` +
      `${deviations.toFixed(1)} sigma out` +
      (caps.length > 0 ? `; ${caps.join("; ")}` : "") +
      ".",
  });

  return out;
}
