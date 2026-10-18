// @vitest-environment jsdom
/**
 * The upgrade page's way out. On a hard paywall (trial expired, out of
 * credits, feature-gated, canceled, past due) the only safe exit is to switch
 * account, so the trust strip links to /login; a voluntary visit goes back to
 * the dashboard. This exercises the page's own wiring (31ac1fb58 moved the
 * account link out of UpgradeHeader into UpgradeTrustStrip).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const findUniqueOrThrow = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "owner-1" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: vi.fn(async () => "owner-1"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUniqueOrThrow: (...a: unknown[]) => findUniqueOrThrow(...a) } },
}));
// Everything but the trust strip is out of scope here.
vi.mock("../UpgradeHeader", () => ({ default: () => null }));
vi.mock("../TierGrid", () => ({ default: () => null }));
vi.mock("../UpgradeFaq", () => ({ default: () => null }));
vi.mock("../UpgradeValueBento", () => ({ default: () => null }));
vi.mock("../CancelledCheckoutNotice", () => ({ default: () => null }));
vi.mock("../OwnerOnlyBillingNotice", () => ({ default: () => null }));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/dashboard/components/BillingUpgradeShell", () => ({
  BillingUpgradeShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import UpgradePage from "../page";

async function renderFor(reason: string | undefined) {
  findUniqueOrThrow.mockResolvedValue({ subscriptionStatus: "TRIAL" });
  const ui = await UpgradePage({ searchParams: Promise.resolve({ reason }) });
  render(ui);
}

afterEach(() => cleanup());

describe("upgrade page way out", () => {
  it.each(["trial-expired", "credits", "feature", "canceled", "past-due"])(
    "hard paywall (%s) offers Switch account -> /login, not the dashboard",
    async (reason) => {
      await renderFor(reason);
      expect(screen.getByRole("link", { name: /switch account/i })).toHaveAttribute("href", "/login");
      expect(screen.queryByRole("link", { name: /back to dashboard/i })).not.toBeInTheDocument();
    },
  );

  it("a voluntary visit goes back to the dashboard", async () => {
    await renderFor("voluntary");
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: /switch account/i })).not.toBeInTheDocument();
  });
});
