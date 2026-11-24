// @vitest-environment jsdom
// RA-8082 — the Settings Security box must show the account's real two-factor
// state, link to the 2FA setup page, and carry no hard-coded session values.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// One stable object: the page refetches the profile whenever `session` changes
// identity, so a fresh object per render would loop.
const { sessionValue } = vi.hoisted(() => ({
  sessionValue: {
    data: { user: { id: "u1", name: "Test User", email: "test@example.com" } },
    status: "authenticated",
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionValue }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));
vi.mock("@/components/settings/AppearanceSetting", () => ({
  AppearanceSetting: () => null,
}));
vi.mock("@/components/settings/OrganizationLocaleSetting", () => ({
  OrganizationLocaleSetting: () => null,
}));
vi.mock("@/components/settings/OrganizationProfileSetting", () => ({
  OrganizationProfileSetting: () => null,
}));
vi.mock("@/components/settings/BusinessDetailsSetting", () => ({
  BusinessDetailsSetting: () => null,
}));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/dashboard/components/DashboardListPageHeader", () => ({
  DashboardListPageHeader: () => null,
}));
vi.mock("@/app/dashboard/components/DashboardPageFrame", () => ({
  DashboardPageFrame: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import SettingsPage from "../page";

function profile(twoFactorEnabled: boolean) {
  return {
    id: "u1",
    name: "Test User",
    email: "test@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    subscriptionStatus: "ACTIVE",
    creditsRemaining: 10,
    totalCreditsUsed: 0,
    twoFactorEnabled,
  };
}

function mockFetch(profileResponse: { ok: boolean; body?: unknown }) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/user/profile")) {
        return {
          ok: profileResponse.ok,
          status: profileResponse.ok ? 200 : 500,
          json: async () => profileResponse.body,
        };
      }
      return { ok: false, status: 404, json: async () => null };
    }),
  );
}

async function securityBox() {
  const heading = await screen.findByRole("heading", { name: "Security" });
  return heading.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings Security box (RA-8082)", () => {
  it("shows 2FA as On with a Manage link when the profile has it enabled", async () => {
    mockFetch({ ok: true, body: { profile: profile(true) } });
    render(<SettingsPage />);
    const box = await securityBox();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/user/profile"));
    await waitFor(() => expect(box).not.toHaveTextContent("Not enabled"));
    await waitFor(() =>
      expect(within(box).getByTestId("two-factor-status")).toHaveTextContent(
        /^On$/,
      ),
    );
    const link = within(box).getByRole("link", { name: /manage/i });
    expect(link).toHaveAttribute("href", "/dashboard/security");
  });

  it("shows 2FA as Off with a Set up link when the profile has it disabled", async () => {
    mockFetch({ ok: true, body: { profile: profile(false) } });
    render(<SettingsPage />);
    const box = await securityBox();
    await waitFor(() =>
      expect(within(box).getByTestId("two-factor-status")).toHaveTextContent(
        /^Off$/,
      ),
    );
    const link = within(box).getByRole("link", { name: /set up/i });
    expect(link).toHaveAttribute("href", "/dashboard/security");
  });

  it("does not report 2FA as Off when the profile cannot be loaded", async () => {
    mockFetch({ ok: false });
    render(<SettingsPage />);
    const box = await securityBox();
    await waitFor(() =>
      expect(within(box).getByTestId("two-factor-status")).toHaveTextContent(
        "Unavailable",
      ),
    );
    expect(
      within(box).getByRole("link", { name: /two-factor/i }),
    ).toHaveAttribute("href", "/dashboard/security");
  });

  it("does not report 2FA as Off when the profile omits the field", async () => {
    const { twoFactorEnabled: _omit, ...withoutField } = profile(true);
    mockFetch({ ok: true, body: { profile: withoutField } });
    render(<SettingsPage />);
    const box = await securityBox();
    await waitFor(() =>
      expect(within(box).getByTestId("two-factor-status")).toHaveTextContent(
        "Unavailable",
      ),
    );
    expect(
      within(box).getByRole("link", { name: /two-factor/i }),
    ).toHaveAttribute("href", "/dashboard/security");
  });

  it("shows no placeholder session count or last-login value", async () => {
    mockFetch({ ok: true, body: { profile: profile(true) } });
    render(<SettingsPage />);
    const box = await securityBox();
    await waitFor(() =>
      expect(within(box).getByTestId("two-factor-status")).toHaveTextContent(
        /^On$/,
      ),
    );
    expect(box).not.toHaveTextContent("1 active");
    expect(box).not.toHaveTextContent("Last Login");
    expect(box).not.toHaveTextContent("Login Sessions");
  });
});
