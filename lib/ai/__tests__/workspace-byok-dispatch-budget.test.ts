import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Collaborator mocks ──────────────────────────────────────────────────────
const getProviderApiKey = vi.fn();
vi.mock("../../workspace/provider-connections", () => ({
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
}));

const byokDispatch = vi.fn();
vi.mock("../byok-client", () => ({
  byokDispatch: (...args: unknown[]) => byokDispatch(...args),
}));

const checkWorkspaceBudget = vi.fn();
vi.mock("../budget-guard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../budget-guard")>();
  return {
    ...actual,
    checkWorkspaceBudget: (...args: unknown[]) =>
      checkWorkspaceBudget(...args),
  };
});

const logAiUsage = vi.fn();
vi.mock("../../usage/log-usage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../usage/log-usage")>();
  return {
    ...actual,
    logAiUsage: (...args: unknown[]) => logAiUsage(...args),
  };
});

import { workspaceByokDispatch } from "../workspace-byok-dispatch";
import { BudgetExceededError } from "../budget-guard";

beforeEach(() => {
  getProviderApiKey.mockReset();
  byokDispatch.mockReset();
  checkWorkspaceBudget.mockReset();
  logAiUsage.mockReset();
});

const BASE_REQ = {
  workspaceId: "ws_1",
  model: "claude-sonnet-4-6" as const,
  systemPrompt: "sys",
  userPrompt: "hello",
};

describe("workspaceByokDispatch — central budget enforcement", () => {
  it("throws BudgetExceededError (per_call_cap) and does NOT dispatch or log", async () => {
    getProviderApiKey.mockResolvedValue("sk-live");
    // report_drafting cap is $2.0; force estimate over cap with a huge prompt.
    const hugePrompt = "x".repeat(4_000_000); // ~1M input tokens → well over $2

    await expect(
      workspaceByokDispatch({
        ...BASE_REQ,
        userPrompt: hugePrompt,
        taskType: "report_drafting",
      }),
    ).rejects.toMatchObject({
      name: "BudgetExceededError",
      reason: "per_call_cap",
    });

    expect(byokDispatch).not.toHaveBeenCalled();
    expect(logAiUsage).not.toHaveBeenCalled();
    // per_call_cap short-circuits before the daily check runs.
    expect(checkWorkspaceBudget).not.toHaveBeenCalled();
  });

  it("throws BudgetExceededError (over_budget) when the daily check rejects", async () => {
    getProviderApiKey.mockResolvedValue("sk-live");
    checkWorkspaceBudget.mockResolvedValue({
      ok: false,
      error: "Workspace AI budget exceeded: ... Resets at 00:00 UTC.",
      budgetUsd: 50,
      spentTodayUsd: 50,
      remainingUsd: 0,
    });

    await expect(
      workspaceByokDispatch({ ...BASE_REQ, taskType: "fast_classification" }),
    ).rejects.toMatchObject({
      name: "BudgetExceededError",
      reason: "over_budget",
    });

    expect(byokDispatch).not.toHaveBeenCalled();
    expect(logAiUsage).not.toHaveBeenCalled();
  });

  it("throws BudgetExceededError (check_unavailable) when the guard fails closed", async () => {
    getProviderApiKey.mockResolvedValue("sk-live");
    checkWorkspaceBudget.mockResolvedValue({
      ok: false,
      error:
        "AI budget check unavailable (datastore error); request blocked to prevent uncapped spend",
      budgetUsd: 50,
      spentTodayUsd: 50,
      remainingUsd: 0,
    });

    await expect(
      workspaceByokDispatch({ ...BASE_REQ, taskType: "fast_classification" }),
    ).rejects.toMatchObject({
      name: "BudgetExceededError",
      reason: "check_unavailable",
    });
    expect(byokDispatch).not.toHaveBeenCalled();
  });

  it("skips the daily check when the policy opts out (requiresBudgetCheck false)", async () => {
    getProviderApiKey.mockResolvedValue("sk-live");
    byokDispatch.mockResolvedValue({
      text: "ok",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    // support_response_draft: requiresBudgetCheck === false.
    const res = await workspaceByokDispatch({
      ...BASE_REQ,
      taskType: "support_response_draft",
    });

    expect(res.text).toBe("ok");
    expect(checkWorkspaceBudget).not.toHaveBeenCalled();
    expect(byokDispatch).toHaveBeenCalledTimes(1);
    expect(logAiUsage).toHaveBeenCalledTimes(1);
  });

  it("runs the daily check and dispatches when under budget", async () => {
    getProviderApiKey.mockResolvedValue("sk-live");
    checkWorkspaceBudget.mockResolvedValue({
      ok: true,
      budgetUsd: 50,
      spentTodayUsd: 1,
      remainingUsd: 49,
    });
    byokDispatch.mockResolvedValue({
      text: "ok",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await workspaceByokDispatch({
      ...BASE_REQ,
      taskType: "fast_classification",
    });

    expect(res.text).toBe("ok");
    expect(checkWorkspaceBudget).toHaveBeenCalledTimes(1);
    expect(byokDispatch).toHaveBeenCalledTimes(1);
    expect(logAiUsage).toHaveBeenCalledTimes(1);
  });
});
