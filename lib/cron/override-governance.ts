/**
 * Override governance — RA-1390 / Motion M-15.
 *
 * Monthly roll-up of SOFT-gap override rates per gate. Cron-driven: runs
 * on the 1st of each month covering the prior month. The 5% safeguard
 * threshold from UX paper §5 surfaces breaches to the board for re-
 * classification or upstream workflow fixes.
 *
 * Reads ProgressTransition.softGaps[] (M-14) — one transition can record
 * many gates, so the same transition counts toward multiple gate
 * override-rates. transitionCount is the denominator (committed
 * transitions in the month); overrideCount is the count of those that
 * recorded the gate as a SOFT gap.
 *
 * Pure data work (no external IO besides Prisma) so the function is
 * unit-testable via DI of a query delegate.
 */

import { prisma } from "@/lib/prisma";

export interface OverrideRow {
  reportMonth: Date;
  gateKey: string;
  transitionCount: number;
  overrideCount: number;
  overrideRate: number;
  isBreached: boolean;
}

const BREACH_THRESHOLD = 0.05;

/**
 * Compute and upsert the override-governance report for the given month.
 * Defaults to the prior calendar month when called with no argument
 * (typical cron path: run on the 1st, report on the month-just-ended).
 */
export async function runOverrideGovernance(
  month?: Date,
): Promise<{ rows: OverrideRow[] }> {
  const target = month ?? priorMonthStart();
  const monthStart = startOfMonthUTC(target);
  const monthEnd = endOfMonthUTC(target);

  const transitions = await prisma.progressTransition.findMany({
    where: {
      transitionedAt: { gte: monthStart, lt: monthEnd },
    },
    select: { id: true, softGaps: true },
  });

  const transitionCount = transitions.length;

  // Aggregate SOFT-gap counts per gate across the month.
  const counts = new Map<string, number>();
  for (const t of transitions) {
    const gaps = parseGapArray(t.softGaps);
    for (const k of gaps) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  // Materialise + upsert one row per gate seen this month.
  const rows: OverrideRow[] = [];
  for (const [gateKey, overrideCount] of counts) {
    const overrideRate =
      transitionCount === 0 ? 0 : overrideCount / transitionCount;
    const isBreached = overrideRate > BREACH_THRESHOLD;
    rows.push({
      reportMonth: monthStart,
      gateKey,
      transitionCount,
      overrideCount,
      overrideRate,
      isBreached,
    });
  }

  // Persist via upsert keyed on (reportMonth, gateKey).
  for (const r of rows) {
    await prisma.overrideGovernanceReport.upsert({
      where: {
        reportMonth_gateKey: {
          reportMonth: r.reportMonth,
          gateKey: r.gateKey,
        },
      },
      create: r,
      update: {
        transitionCount: r.transitionCount,
        overrideCount: r.overrideCount,
        overrideRate: r.overrideRate,
        isBreached: r.isBreached,
        computedAt: new Date(),
      },
    });
  }

  return { rows };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function priorMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

/**
 * The schema stores softGaps as Json. In practice we always write
 * `string[]`, but defensively unwrap so a stored `null` or malformed
 * value yields an empty list rather than throwing.
 */
export function parseGapArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

export const __M15_INTERNAL = {
  startOfMonthUTC,
  endOfMonthUTC,
  priorMonthStart,
  BREACH_THRESHOLD,
};
