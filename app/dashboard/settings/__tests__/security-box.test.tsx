// @vitest-environment jsdom
/**
 * RA-8082 — the Settings Security box states the account's real two-factor
 * state (profile.twoFactorEnabled from GET /api/user/profile) and links to
 * /dashboard/security, where RA-1260 built setup and disable. It previously
 * rendered "Not enabled", "1 active" and "Today" as fixed text, so a user
 * with 2FA on was told it was off and had no way to reach the setup page.
 * A failed profile read says the state is unavailable, never "Off".
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Test", email: "t@example.com" } },
    status: "authenticated",
  }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/settings/AppearanceSetting", () => ({
  AppearanceSetting: () => null,
}));
vi.mock("@/components/settings/OrganizationLocaleSetting", () => ({
  OrganizationLocaleSetting: () => null,
}));
vi.mock("@/components/settings/BusinessDetailsSetting", () => ({
  BusinessDetailsSetting: () => null,
}));

type Profile = Record<string, unknown> | null;

function stubProfile(profile: Profile) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/user/profile") {
        return profile
          ? { ok: true, status: 200, json: async () => ({ profile }) }
          : { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
}

const baseProfile = {
  id: "u1",
  name: "Test",
  email: "t@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  subscriptionStatus: "ACTIVE",
  creditsRemaining: 10,
  totalCreditsUsed: 0,
};

async function renderSecurityBox(profile: Profile) {
  stubProfile(profile);
  vi.resetModules();
  const { default: SettingsPage } = await import("../page");
  render(<SettingsPage />);
  const heading = await screen.findByRole("heading", { name: "Security" });
  return heading.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings Security box — two-factor state", () => {
  it("says On, never 'Not enabled', when twoFactorEnabled is true", async () => {
    const box = await renderSecurityBox({
      ...baseProfile,
      twoFactorEnabled: true,
    });
    expect(box).not.toHaveTextContent("Not enabled");
    expect(within(box).getByTestId("two-factor-state")).toHaveTextContent(
      /^On$/,
    );
    expect(within(box).getByRole("link", { name: "Manage" })).toHaveAttribute(
      "href",
      "/dashboard/security",
    );
  });

  it("says Off with a Set up link when twoFactorEnabled is false", async () => {
    const box = await renderSecurityBox({
      ...baseProfile,
      twoFactorEnabled: false,
    });
    expect(within(box).getByTestId("two-factor-state")).toHaveTextContent(
      /^Off$/,
    );
    expect(within(box).getByRole("link", { name: "Set up" })).toHaveAttribute(
      "href",
      "/dashboard/security",
    );
  });

  it("says Unavailable, not Off, when the profile read fails", async () => {
    const box = await renderSecurityBox(null);
    expect(within(box).getByTestId("two-factor-state")).toHaveTextContent(
      /^Unavailable$/,
    );
    expect(within(box).getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/security",
    );
  });

  it("shows no placeholder session count or last-login text", async () => {
    const box = await renderSecurityBox({
      ...baseProfile,
      twoFactorEnabled: true,
    });
    expect(box).not.toHaveTextContent("1 active");
    expect(box).not.toHaveTextContent("Last Login");
    expect(box).not.toHaveTextContent("Today");
  });
});
