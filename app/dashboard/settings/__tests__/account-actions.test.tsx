// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: {
    user: {
      id: "settings-user",
      name: "Settings Tester",
      email: "settings@test.local",
      role: "ADMIN",
    },
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session, status: "authenticated" }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/settings/AppearanceSetting", () => ({
  AppearanceSetting: () => null,
}));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import SettingsPage from "../page";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/organization/review-link") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { googleReviewUrl: null } }),
        });
      }
      if (url === "/api/user/profile") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            profile: {
              id: "settings-user",
              name: "Settings Tester",
              email: "settings@test.local",
              createdAt: "2026-08-10T00:00:00.000Z",
              subscriptionStatus: "ACTIVE",
              creditsRemaining: 10,
              totalCreditsUsed: 2,
            },
          }),
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});

describe("Settings account actions", () => {
  it("links notification preferences to the notifications page", async () => {
    render(<SettingsPage />);

    expect(
      await screen.findByRole("link", { name: "Notification Preferences" }),
    ).toHaveAttribute("href", "/dashboard/notifications");
  });

  it("uses the canonical authenticated user-data export download", async () => {
    render(<SettingsPage />);

    const exportLink = await screen.findByRole("link", { name: "Export Data" });
    expect(exportLink).toHaveAttribute("href", "/api/user/export");
    expect(exportLink).toHaveAttribute("download");
  });
});
