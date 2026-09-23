// @vitest-environment jsdom
/**
 * RA-7714 review round 3 — the payment-success page states the plan the
 * buyer is actually on, never the catalogue Monthly Plan for everyone.
 *
 * A lifetime buyer returns with ?lifetime=1 and fulfillment writes plan
 * Lifetime (999 reports); an already-ACTIVE Yearly subscriber lands here
 * too. The page reads /api/user/profile (effective plan, and
 * planReportAllowance — see
 * app/api/user/profile/__tests__/plan-report-allowance.test.ts for how the
 * route builds both from the stored row). When the plan cannot be
 * determined, no plan or number is stated.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, update: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

type Profile = Record<string, unknown> | null;

function stubProfile(profile: Profile) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/user/profile") {
        return profile
          ? { ok: true, json: async () => ({ profile }) }
          : { ok: false, json: async () => ({}) };
      }
      if (url === "/api/check-active-subscription") {
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

async function renderSuccess(search: string, profile: Profile) {
  query = search;
  stubProfile(profile);
  vi.resetModules();
  const { default: SuccessPage } = await import("../page");
  render(<SuccessPage />);
  await screen.findByRole("heading", { name: "Payment Successful!" });
  // Let the post-completion profile read settle.
  await new Promise((r) => setTimeout(r, 20));
  return document.body.textContent ?? "";
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("payment success — the plan sentence", () => {
  it.each([
    ["", "Monthly Plan", 50],
    ["", "Yearly Plan", 70],
    ["lifetime=1", "Lifetime", 999],
  ])(
    "?%s with an ACTIVE %s account states that plan and %i reports",
    async (search, plan, allowance) => {
      const text = await renderSuccess(search, {
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: plan,
        planReportAllowance: allowance,
      });
      expect(text).toContain(
        `Your plan: ${plan}, with ${allowance} inspection reports a month.`,
      );
      expect(text.match(/\d+ inspection reports a month/g)).toEqual([
        `${allowance} inspection reports a month`,
      ]);
    },
  );

  it("a team member is told the owner's plan (the profile's effective plan)", async () => {
    const text = await renderSuccess("", {
      role: "USER",
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Lifetime",
      planReportAllowance: 999,
    });
    expect(text).toContain("Your plan: Lifetime, with 999 inspection reports a month.");
  });

  it("a lifetime return whose account does not yet show Lifetime states no plan", async () => {
    const text = await renderSuccess("lifetime=1", {
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      planReportAllowance: 50,
    });
    expect(text).not.toMatch(/Your plan:|inspection reports a month/);
    expect(text).not.toMatch(/Monthly Plan/);
  });

  it.each([
    ["the profile read fails", null],
    ["the account is not active", { subscriptionStatus: "TRIAL", planReportAllowance: null }],
    [
      "no allowance is available",
      { subscriptionStatus: "ACTIVE", subscriptionPlan: "Monthly Plan", planReportAllowance: null },
    ],
  ])("states no plan or number when %s", async (_label, profile) => {
    const text = await renderSuccess("", profile as Profile);
    expect(text).not.toMatch(/Your plan:|inspection reports a month/);
    expect(text).not.toMatch(/Monthly Plan|unlimited/i);
  });
});
