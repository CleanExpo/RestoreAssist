// @vitest-environment jsdom
/**
 * RA-7714 — the Subscription page's "Plan Features" must state the same
 * report allowance as /pricing and the trial (PRICING_CONFIG), never
 * "Unlimited reports".
 *
 * The allowance figure also appears in the no-subscription upsell cards
 * further down the page, so this mounts an ACTIVE subscription and asserts
 * inside the Plan Features block only.
 *
 * The number shown is the subscriber's OWN enforced allowance: the page reads
 * profile.reportLimits.baseLimit, which /api/user/profile gets from
 * getUserReportLimits -> resolveBaseReportLimit (lib/report-limits.ts), the
 * function that enforces the limit. Grandfathered plans keep their own
 * number (Yearly Plan 70, Lifetime 999 — see
 * lib/__tests__/report-limits.grandfathering.test.ts), so a Lifetime customer
 * must never be told "50 inspection reports per month".
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/billing/CancelSubscriptionDialog", () => ({
  CancelSubscriptionDialog: () => null,
}));

import SubscriptionPage from "../page";

function activeSubscription(planName: string) {
  return {
    id: "sub_test",
    status: "active",
    currentPeriodStart: 1_780_000_000,
    currentPeriodEnd: 1_782_592_000,
    cancelAtPeriodEnd: false,
    plan: { name: planName, amount: 9900, currency: "aud", interval: "month" },
  };
}

function stubApi(planName: string, reportLimits: { baseLimit: number } | null) {
  const active = activeSubscription(planName);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/subscription")) {
        return { ok: true, json: async () => ({ subscription: active }) };
      }
      if (url === "/api/user/profile") {
        return {
          ok: true,
          json: async () => ({
            profile: {
              subscriptionStatus: "ACTIVE",
              subscriptionPlan: planName,
              reportLimits: reportLimits && {
                ...reportLimits,
                addonReports: 0,
                monthlyReportsUsed: 0,
                availableReports: reportLimits.baseLimit,
                hasUnlimited: false,
              },
            },
          }),
        };
      }
      if (url === "/api/addons/catalog") {
        return { ok: true, json: async () => ({ addons: [], owned: [] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

async function planFeaturesBlock() {
  const heading = await screen.findByRole("heading", {
    name: "Plan Features",
  });
  return heading.parentElement as HTMLElement;
}

describe("Subscription page — Plan Features", () => {
  it("states the plan's report allowance, not unlimited reports", async () => {
    const allowance = PRICING_CONFIG.pricing.monthly.reportLimit;
    stubApi("Monthly Plan", { baseLimit: allowance });
    render(<SubscriptionPage />);

    const block = await planFeaturesBlock();

    expect(allowance).toBe(50);
    expect(
      await within(block).findByText(`${allowance} inspection reports per month`),
    ).toBeInTheDocument();
    expect(block.textContent ?? "").not.toMatch(/unlimited reports/i);
    expect(document.body.textContent ?? "").not.toMatch(/unlimited reports/i);
  });

  it.each([
    ["Monthly Plan", 50],
    ["Yearly Plan", 70],
    ["Lifetime", 999],
  ])(
    "a %s subscriber sees their own enforced allowance (%i)",
    async (planName, baseLimit) => {
      stubApi(planName, { baseLimit });
      render(<SubscriptionPage />);

      const block = await planFeaturesBlock();
      expect(
        await within(block).findByText(
          `${baseLimit} inspection reports per month`,
        ),
      ).toBeInTheDocument();
      const stated = (block.textContent ?? "").match(
        /\d+ inspection reports per month/g,
      );
      expect(stated).toEqual([`${baseLimit} inspection reports per month`]);
    },
  );

  it("states no number when the enforced allowance is unavailable", async () => {
    stubApi("Lifetime", null);
    render(<SubscriptionPage />);

    const block = await planFeaturesBlock();
    await screen.findByText("PDF & Excel export");
    // Let the profile request settle before asserting absence.
    await new Promise((r) => setTimeout(r, 20));
    expect(block.textContent ?? "").not.toMatch(
      /\d+ inspection reports per month/,
    );
  });
});
