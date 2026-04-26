/**
 * AI org-spend budget guard — RA-1707 / P0-2.
 *
 * Workspace-scoped daily ceiling for AI spend. Sums today's
 * AiUsageLog.estimatedCostUsd (records written by lib/usage/log-usage.ts
 * after every successful AI call) and rejects requests that would tip
 * the workspace over its budget.
 *
 * Without this, one bad workflow loop in a pilot org = $500/day bleed
 * across the AI surface (Vision import, forensic PDF, synopsis,
 * client-summary). Per-endpoint rate-limits already exist; this is the
 * cross-endpoint cap.
 *
 * Pricing: caller supplies a pre-call cost estimate. Use
 * `estimateCostUsd()` from lib/usage/log-usage.ts for token-based costs,
 * or pass a flat per-call estimate for image / vision routes (Vision
 * runs ~$0.005-0.01 per image at sonnet-4-x pricing).
 *
 * Defaults: AI_DEFAULT_DAILY_BUDGET_USD env (fallback 50.0) when the
 * workspace row has no per-org override. checkWorkspaceBudget never
 * throws; on any internal error it returns ok:true to keep pilots
 * unblocked (telemetry will log the issue separately).
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_DAILY_BUDGET_USD = 50;

export interface CheckWorkspaceBudgetArgs {
  workspaceId: string;
  /** Pre-call cost estimate in USD for the request the caller is about to make. */
  estimatedCostUsd: number;
  /** Optional override: explicit daily ceiling. Falls back to workspace row → env default. */
  budgetOverrideUsd?: number;
}

export type BudgetCheckResult =
  | {
      ok: true;
      budgetUsd: number;
      spentTodayUsd: number;
      remainingUsd: number;
    }
  | {
      ok: false;
      error: string;
      budgetUsd: number;
      spentTodayUsd: number;
      remainingUsd: number;
    };

export async function checkWorkspaceBudget(
  args: CheckWorkspaceBudgetArgs,
): Promise<BudgetCheckResult> {
  // Read budget — caller override wins, then per-workspace, then env default.
  let budgetUsd: number;
  if (typeof args.budgetOverrideUsd === "number" && args.budgetOverrideUsd >= 0) {
    budgetUsd = args.budgetOverrideUsd;
  } else {
    let workspaceBudget: number | null = null;
    try {
      const ws = await prisma.workspace.findUnique({
        where: { id: args.workspaceId },
        select: { aiDailyBudgetUsd: true },
      });
      workspaceBudget = ws?.aiDailyBudgetUsd ?? null;
    } catch (err) {
      console.error("[ai.budget-guard] workspace lookup failed", err);
      // Defensive: if we can't read the budget, allow the call. The pilot
      // path stays unblocked; the underlying error gets surfaced via
      // existing observability (Sentry once configured).
      return {
        ok: true,
        budgetUsd: parseEnvBudget(),
        spentTodayUsd: 0,
        remainingUsd: parseEnvBudget(),
      };
    }
    budgetUsd = workspaceBudget ?? parseEnvBudget();
  }

  // Sum today's logged costs scoped to this workspace.
  const startOfDay = startOfTodayUTC();
  let spentTodayUsd = 0;
  try {
    const aggregate = await prisma.aiUsageLog.aggregate({
      _sum: { estimatedCostUsd: true },
      where: {
        workspaceId: args.workspaceId,
        createdAt: { gte: startOfDay },
        success: true,
      },
    });
    spentTodayUsd = aggregate._sum.estimatedCostUsd ?? 0;
  } catch (err) {
    console.error("[ai.budget-guard] usage aggregate failed", err);
    // Same defensive policy — never block on observability failures.
    return {
      ok: true,
      budgetUsd,
      spentTodayUsd: 0,
      remainingUsd: budgetUsd,
    };
  }

  const projectedSpend = spentTodayUsd + Math.max(0, args.estimatedCostUsd);
  const remainingUsd = Math.max(0, budgetUsd - spentTodayUsd);

  if (projectedSpend > budgetUsd) {
    return {
      ok: false,
      error: `Workspace AI budget exceeded: spent $${spentTodayUsd.toFixed(2)} today, this request adds $${args.estimatedCostUsd.toFixed(2)}, daily cap is $${budgetUsd.toFixed(2)}. Resets at 00:00 UTC.`,
      budgetUsd,
      spentTodayUsd,
      remainingUsd,
    };
  }

  return {
    ok: true,
    budgetUsd,
    spentTodayUsd,
    remainingUsd,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseEnvBudget(): number {
  const raw = process.env.AI_DEFAULT_DAILY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_DAILY_BUDGET_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_USD;
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

// Exposed for tests + admin tooling.
export const __BUDGET_GUARD_INTERNAL = {
  parseEnvBudget,
  startOfTodayUTC,
  DEFAULT_DAILY_BUDGET_USD,
};
