import { afterEach, describe, expect, it } from "vitest";
import { validateBudgetSnapshot } from "../runner/orchestrator.js";

const originalDefault = process.env.AI_DEFAULT_DAILY_BUDGET_USD;

afterEach(() => {
  if (originalDefault === undefined) delete process.env.AI_DEFAULT_DAILY_BUDGET_USD;
  else process.env.AI_DEFAULT_DAILY_BUDGET_USD = originalDefault;
});

describe("pilot daily spend ceiling", () => {
  it("accepts a configured workspace below the $5 ceiling", () => {
    expect(() =>
      validateBudgetSnapshot({ configuredBudgetUsd: 5, spentTodayUsd: 4.99 }, 5),
    ).not.toThrow();
  });

  it("rejects a workspace configured above $5", () => {
    expect(() =>
      validateBudgetSnapshot({ configuredBudgetUsd: 50, spentTodayUsd: 0 }, 5),
    ).toThrow(/over \$5\.00/);
  });

  it("rejects an exhausted workspace", () => {
    expect(() =>
      validateBudgetSnapshot({ configuredBudgetUsd: 5, spentTodayUsd: 5 }, 5),
    ).toThrow(/exhausted/);
  });

  it("rejects a missing persisted workspace budget even when a local default is set", () => {
    process.env.AI_DEFAULT_DAILY_BUDGET_USD = "5";
    expect(() =>
      validateBudgetSnapshot({ configuredBudgetUsd: null, spentTodayUsd: 0 }, 5),
    ).toThrow(/over \$5\.00/);
  });
});
