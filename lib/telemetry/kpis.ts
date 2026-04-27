/**
 * Progress KPIs — RA-1392 / Motion M-17.
 *
 * 2 board-facing KPIs per UX paper §8:
 *   - timeToInvoice — median wall-clock hours from claim creation
 *     (ClaimProgress row insert) to invoice attestation (issue_invoice
 *     transition success).
 *   - overrideRate — overrides per hard-block attempt.
 *     overrides / (overrides + blocked) over the window.
 */

import { prisma } from "@/lib/prisma";

export interface KpiOptions {
  /** ISO date — only count events at or after this. Default: 30 days ago. */
  since?: Date;
}

export interface TimeToInvoiceKpi {
  kpi: "timeToInvoice";
  /** Median hours, or null when there are fewer than 1 sample. */
  medianHours: number | null;
  sampleCount: number;
}

export interface OverrideRateKpi {
  kpi: "overrideRate";
  overrides: number;
  blocked: number;
  /** overrides / (overrides + blocked). 0 when denominator === 0. */
  rate: number;
}

export async function computeTimeToInvoice(
  opts: KpiOptions = {},
): Promise<TimeToInvoiceKpi> {
  const since = opts.since ?? defaultSince();

  // Pair every issue_invoice success with the createdAt of its claim.
  const successes = await prisma.progressTelemetryEvent.findMany({
    where: {
      eventName: "progress.transition.success",
      transitionKey: "issue_invoice",
      createdAt: { gte: since },
      claimProgressId: { not: null },
    },
    select: { claimProgressId: true, createdAt: true },
  });

  if (successes.length === 0) {
    return { kpi: "timeToInvoice", medianHours: null, sampleCount: 0 };
  }

  const claimIds = Array.from(
    new Set(
      successes
        .map((s) => s.claimProgressId)
        .filter((id): id is string => id !== null),
    ),
  );
  const claims = await prisma.claimProgress.findMany({
    where: { id: { in: claimIds } },
    select: { id: true, createdAt: true },
  });
  const claimCreatedAt = new Map(claims.map((c) => [c.id, c.createdAt]));

  const hours: number[] = [];
  for (const s of successes) {
    if (!s.claimProgressId) continue;
    const created = claimCreatedAt.get(s.claimProgressId);
    if (!created) continue;
    const diffMs = s.createdAt.getTime() - created.getTime();
    if (diffMs < 0) continue; // defensive — clock skew
    hours.push(diffMs / (1000 * 60 * 60));
  }

  if (hours.length === 0) {
    return { kpi: "timeToInvoice", medianHours: null, sampleCount: 0 };
  }

  return {
    kpi: "timeToInvoice",
    medianHours: median(hours),
    sampleCount: hours.length,
  };
}

export async function computeOverrideRate(
  opts: KpiOptions = {},
): Promise<OverrideRateKpi> {
  const since = opts.since ?? defaultSince();

  const [overrides, blocked] = await Promise.all([
    prisma.progressTelemetryEvent.count({
      where: {
        eventName: "progress.transition.override",
        createdAt: { gte: since },
      },
    }),
    prisma.progressTelemetryEvent.count({
      where: {
        eventName: "progress.transition.blocked",
        createdAt: { gte: since },
      },
    }),
  ]);

  const denom = overrides + blocked;
  return {
    kpi: "overrideRate",
    overrides,
    blocked,
    rate: denom === 0 ? 0 : overrides / denom,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function defaultSince(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}
