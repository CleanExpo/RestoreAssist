/**
 * Progress funnels — RA-1392 / Motion M-17.
 *
 * 4 funnels per UX paper §8: stabilisation, scope, drying, invoice. Each
 * funnel measures attempt → success rate per claim against the canonical
 * transition keys for that phase.
 *
 * Computed off ProgressTelemetryEvent (M-17 ship-blocker table). Empty
 * results until events flow — that's the M-17 → M-15 dependency edge.
 */

import { prisma } from "@/lib/prisma";

export type FunnelKey = "stabilisation" | "scope" | "drying" | "invoice";

/**
 * The transition key that defines "success" for each funnel. Attempt is
 * counted by `progress.transition.attempt` for the same key, success by
 * `progress.transition.success`.
 */
export const FUNNEL_TRANSITION_KEY: Record<FunnelKey, string> = {
  stabilisation: "attest_stabilisation",
  scope: "approve_scope",
  drying: "certify_drying",
  invoice: "issue_invoice",
};

export interface FunnelStat {
  funnel: FunnelKey;
  transitionKey: string;
  attempts: number;
  successes: number;
  blocked: number;
  /** successes / attempts. 0 when attempts === 0. */
  successRate: number;
}

export interface FunnelOptions {
  /** ISO date — only count events at or after this. Default: 30 days ago. */
  since?: Date;
}

export async function computeFunnel(
  funnel: FunnelKey,
  opts: FunnelOptions = {},
): Promise<FunnelStat> {
  const transitionKey = FUNNEL_TRANSITION_KEY[funnel];
  const since = opts.since ?? defaultSince();

  const [attempts, successes, blocked] = await Promise.all([
    prisma.progressTelemetryEvent.count({
      where: {
        eventName: "progress.transition.attempt",
        transitionKey,
        createdAt: { gte: since },
      },
    }),
    prisma.progressTelemetryEvent.count({
      where: {
        eventName: "progress.transition.success",
        transitionKey,
        createdAt: { gte: since },
      },
    }),
    prisma.progressTelemetryEvent.count({
      where: {
        eventName: "progress.transition.blocked",
        transitionKey,
        createdAt: { gte: since },
      },
    }),
  ]);

  return {
    funnel,
    transitionKey,
    attempts,
    successes,
    blocked,
    successRate: attempts === 0 ? 0 : successes / attempts,
  };
}

export async function computeAllFunnels(
  opts: FunnelOptions = {},
): Promise<FunnelStat[]> {
  return Promise.all(
    (Object.keys(FUNNEL_TRANSITION_KEY) as FunnelKey[]).map((f) =>
      computeFunnel(f, opts),
    ),
  );
}

function defaultSince(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}
