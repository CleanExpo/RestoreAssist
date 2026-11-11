/**
 * RA-8281 step 1: the price-list save's out-of-range refusal shows no range
 * figure.
 *
 * The route still refuses a rate outside its NRPG range with a 400 (that
 * behaviour is unchanged here; B3 replaces it). What changed is the answer:
 * it names the rate and keeps `field` so the screen can mark the input, and
 * it holds no min and no max, in the message or anywhere else in the body.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writes = vi.hoisted(() => ({
  company: vi.fn(),
  organization: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "owner-a", role: "ADMIN" },
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({
  hasConfiguredAi: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        id: "owner-a",
        role: "ADMIN",
        organizationId: "org-a",
        organization: { ownerId: "owner-a" },
        subscriptionStatus: "ACTIVE",
        creditsRemaining: null,
        subscriptionPlan: null,
        monthlyReportsUsed: 0,
        monthlyResetDate: null,
        trialEndsAt: null,
        addonReports: 0,
        lifetimeAccess: false,
      }),
    },
    organization: {
      findUnique: async () => ({ ownerId: "owner-a" }),
    },
    companyPricingConfig: { upsert: writes.company },
    organizationPricingConfig: { upsert: writes.organization },
  },
}));

import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { BASE_RATE_FIELDS } from "@/lib/pricing/rate-not-set";
import { expectNoRangeFigure } from "@/lib/pricing/__tests__/no-range-figure";
import { PUT } from "../route";

/** Every required rate at a value inside its own range, none a range figure. */
function inRangePriceList(): Record<string, number> {
  return Object.fromEntries(
    BASE_RATE_FIELDS.map((field) => {
      const { min, max } = NRPG_RATE_RANGES[field];
      return [field, min + (max - min) / 4 + 0.13];
    }),
  );
}

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest("http://localhost/api/pricing-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  writes.company.mockReset();
  writes.organization.mockReset();
});

describe("PUT /api/pricing-config: a rate outside its national range", () => {
  it.each(BASE_RATE_FIELDS.flatMap((f) => [[f, "below"], [f, "above"]]))(
    "%s %s its range is refused with no range figure in the answer",
    async (field, side) => {
      const { min, max } = NRPG_RATE_RANGES[field];
      const value = side === "below" ? min / 2 : max * 3 + 0.37;

      const res = await put({ ...inRangePriceList(), [field]: value });
      const text = await res.text();
      const body = JSON.parse(text);

      // Still refused, and nothing saved.
      expect(res.status).toBe(400);
      expect(writes.company).not.toHaveBeenCalled();
      expect(writes.organization).not.toHaveBeenCalled();

      // The screen can still mark the input and say what is wrong.
      expect(body.field).toBe(field);
      expect(body.error).toBe(
        `${NRPG_RATE_RANGES[field].label} rate $${value.toFixed(2)} is outside the national price range`,
      );

      // No figure: not in the message, not as a key, not anywhere.
      expect(Object.keys(body).sort()).toEqual(["error", "field"]);
      expectNoRangeFigure(text, field);
    },
  );
});
