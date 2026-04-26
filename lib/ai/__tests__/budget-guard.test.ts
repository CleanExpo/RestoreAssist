import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      workspace: { findUnique: vi.fn() },
      aiUsageLog: { aggregate: vi.fn() },
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  __BUDGET_GUARD_INTERNAL,
  checkWorkspaceBudget,
} from "../budget-guard";

const wsFind = (prisma as unknown as {
  workspace: { findUnique: ReturnType<typeof vi.fn> };
}).workspace.findUnique;

const aggregate = (prisma as unknown as {
  aiUsageLog: { aggregate: ReturnType<typeof vi.fn> };
}).aiUsageLog.aggregate;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // mockReset clears queued mockResolvedValueOnce values (clearAllMocks
  // only resets .mock.calls). Without this, a test that short-circuits
  // before consuming its mocks bleeds into the next test.
  wsFind.mockReset();
  aggregate.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("budget-guard constants", () => {
  it("default daily budget is 50 USD", () => {
    expect(__BUDGET_GUARD_INTERNAL.DEFAULT_DAILY_BUDGET_USD).toBe(50);
  });

  it("startOfTodayUTC returns a midnight Date", () => {
    const d = __BUDGET_GUARD_INTERNAL.startOfTodayUTC();
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it("parseEnvBudget falls back to 50 on missing env", () => {
    delete process.env.AI_DEFAULT_DAILY_BUDGET_USD;
    expect(__BUDGET_GUARD_INTERNAL.parseEnvBudget()).toBe(50);
  });

  it("parseEnvBudget falls back to 50 on non-numeric env", () => {
    process.env.AI_DEFAULT_DAILY_BUDGET_USD = "free";
    expect(__BUDGET_GUARD_INTERNAL.parseEnvBudget()).toBe(50);
  });

  it("parseEnvBudget honours a valid env override", () => {
    process.env.AI_DEFAULT_DAILY_BUDGET_USD = "12.5";
    expect(__BUDGET_GUARD_INTERNAL.parseEnvBudget()).toBe(12.5);
  });
});

describe("checkWorkspaceBudget — happy paths", () => {
  it("allows when spent + projected stays under budget", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 50 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 12 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 0.5,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.budgetUsd).toBe(50);
    expect(r.spentTodayUsd).toBe(12);
    expect(r.remainingUsd).toBe(38);
  });

  it("uses env default when workspace has no per-org override", async () => {
    process.env.AI_DEFAULT_DAILY_BUDGET_USD = "25";
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: null });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 0 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.budgetUsd).toBe(25);
  });

  it("caller override wins over both workspace and env", async () => {
    process.env.AI_DEFAULT_DAILY_BUDGET_USD = "100";
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 200 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 0 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
      budgetOverrideUsd: 5,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.budgetUsd).toBe(5);
  });

  it("treats null aggregate sum as zero spent", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 10 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: null } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.spentTodayUsd).toBe(0);
    expect(r.remainingUsd).toBe(10);
  });
});

describe("checkWorkspaceBudget — rejection paths", () => {
  it("rejects when this call would tip the workspace over budget", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 5 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 4.6 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 0.5,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/budget exceeded/i);
    expect(r.spentTodayUsd).toBeCloseTo(4.6);
    expect(r.budgetUsd).toBe(5);
  });

  it("rejects when already at the cap", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 10 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 10 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 0.01,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.remainingUsd).toBe(0);
  });

  it("includes the human-readable reset hint in the error", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 1 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 1 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/00:00 UTC/);
  });
});

describe("checkWorkspaceBudget — multi-tenancy", () => {
  it("scopes the aggregate query by workspaceId (no cross-tenant leak)", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 50 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 0 } });

    await checkWorkspaceBudget({
      workspaceId: "ws_alpha",
      estimatedCostUsd: 1,
    });

    expect(aggregate).toHaveBeenCalledTimes(1);
    const call = aggregate.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws_alpha");
    // Tenancy contract: must filter by today's start, must require success.
    expect(call.where.success).toBe(true);
    expect(call.where.createdAt).toBeDefined();
  });
});

describe("checkWorkspaceBudget — defensive paths", () => {
  it("allows the call when the workspace lookup throws (never blocks pilots)", async () => {
    wsFind.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
    });

    expect(r.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("allows the call when the aggregate query throws", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 5 });
    aggregate.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: 1,
    });

    expect(r.ok).toBe(true);
    errSpy.mockRestore();
  });

  it("treats negative pre-call estimates as zero", async () => {
    wsFind.mockResolvedValueOnce({ aiDailyBudgetUsd: 1 });
    aggregate.mockResolvedValueOnce({ _sum: { estimatedCostUsd: 0.5 } });

    const r = await checkWorkspaceBudget({
      workspaceId: "ws_1",
      estimatedCostUsd: -10,
    });

    expect(r.ok).toBe(true);
  });
});
