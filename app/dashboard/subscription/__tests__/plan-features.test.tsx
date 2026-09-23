// @vitest-environment jsdom
/**
 * RA-7714 — the Subscription page's "Plan Features" must state the same
 * report allowance as /pricing and the trial (PRICING_CONFIG), never
 * "Unlimited reports".
 *
 * The allowance figure also appears in the no-subscription upsell cards
 * further down the page, so this mounts an ACTIVE subscription and asserts
 * inside the Plan Features block only.
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

const ACTIVE = {
  id: "sub_test",
  status: "active",
  currentPeriodStart: 1_780_000_000,
  currentPeriodEnd: 1_782_592_000,
  cancelAtPeriodEnd: false,
  plan: { name: "Monthly Plan", amount: 9900, currency: "aud", interval: "month" },
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/subscription")) {
        return { ok: true, json: async () => ({ subscription: ACTIVE }) };
      }
      if (url === "/api/user/profile") {
        return {
          ok: true,
          json: async () => ({ profile: { subscriptionStatus: "ACTIVE" } }),
        };
      }
      if (url === "/api/addons/catalog") {
        return { ok: true, json: async () => ({ addons: [], owned: [] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});

describe("Subscription page — Plan Features", () => {
  it("states the plan's report allowance, not unlimited reports", async () => {
    render(<SubscriptionPage />);

    const heading = await screen.findByRole("heading", {
      name: "Plan Features",
    });
    const block = heading.parentElement as HTMLElement;
    const allowance = PRICING_CONFIG.pricing.monthly.reportLimit;

    expect(allowance).toBe(50);
    expect(
      within(block).getByText(`${allowance} inspection reports per month`),
    ).toBeInTheDocument();
    expect(block.textContent ?? "").not.toMatch(/unlimited reports/i);
    expect(document.body.textContent ?? "").not.toMatch(/Unlimited reports/);
  });
});
