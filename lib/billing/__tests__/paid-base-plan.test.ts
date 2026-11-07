import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(),
}));

import { getEffectiveSubscription } from "@/lib/organization-credits";
import {
  hasPaidBasePlan,
  isPaidReportDepth,
  PAID_BASE_PLAN_MESSAGE,
} from "../paid-base-plan";

const effective = getEffectiveSubscription as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasPaidBasePlan", () => {
  it("is true only for ACTIVE effective subscription", async () => {
    effective.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
    await expect(hasPaidBasePlan("u1")).resolves.toBe(true);
  });

  it("is false during trial", async () => {
    effective.mockResolvedValue({ subscriptionStatus: "TRIAL", trialEndsAt: new Date() });
    await expect(hasPaidBasePlan("u1")).resolves.toBe(false);
  });
});

describe("isPaidReportDepth", () => {
  it("flags enhanced and optimised", () => {
    expect(isPaidReportDepth("Basic")).toBe(false);
    expect(isPaidReportDepth("Enhanced")).toBe(true);
    expect(isPaidReportDepth("Optimised")).toBe(true);
  });
});

describe("copy", () => {
  it("mentions upgrade path", () => {
    expect(PAID_BASE_PLAN_MESSAGE.toLowerCase()).toContain("trial");
  });
});
