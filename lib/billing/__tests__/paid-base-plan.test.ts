import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(),
}));

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureEntitlement: {
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

import { getEffectiveSubscription } from "@/lib/organization-credits";
import { COMPLIMENTARY_PRICE_ID } from "../founding-trial-grant";
import {
  hasPaidBasePlan,
  isPaidReportDepth,
  PAID_BASE_PLAN_MESSAGE,
} from "../paid-base-plan";

const effective = getEffectiveSubscription as unknown as ReturnType<typeof vi.fn>;

const DAY = 24 * 60 * 60 * 1000;

function seedEffective(
  status: string,
  trialEndsAt: Date | null,
  opts: { founding?: boolean } = {},
) {
  effective.mockResolvedValue({
    id: "owner-1",
    subscriptionStatus: status,
    trialEndsAt,
  });
  findFirst.mockImplementation(async (args: { where?: { stripePriceId?: string } } = {}) =>
    opts.founding && args.where?.stripePriceId === COMPLIMENTARY_PRICE_ID
      ? { id: "fe_1" }
      : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("hasPaidBasePlan", () => {
  it("is true only for ACTIVE effective subscription", async () => {
    effective.mockResolvedValue({ id: "u1", subscriptionStatus: "ACTIVE" });
    await expect(hasPaidBasePlan("u1")).resolves.toBe(true);
  });

  it("is false during trial", async () => {
    seedEffective("TRIAL", new Date(Date.now() + 7 * DAY));
    await expect(hasPaidBasePlan("u1")).resolves.toBe(false);
  });

  it("is true for an unexpired founding-trial grant (complimentary marker + trialEndsAt)", async () => {
    seedEffective("TRIAL", new Date(Date.now() + 40 * DAY), { founding: true });
    await expect(hasPaidBasePlan("u1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stripePriceId: COMPLIMENTARY_PRICE_ID,
          active: true,
          workspace: { ownerId: "owner-1" },
        }),
      }),
    );
  });

  it("is false when the founding-trial grant's trialEndsAt has passed", async () => {
    seedEffective("TRIAL", new Date(Date.now() - DAY), { founding: true });
    await expect(hasPaidBasePlan("u1")).resolves.toBe(false);
  });

  it("is false for PAST_DUE even with a complimentary entitlement leftover", async () => {
    seedEffective("PAST_DUE", new Date(Date.now() + 40 * DAY), { founding: true });
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
