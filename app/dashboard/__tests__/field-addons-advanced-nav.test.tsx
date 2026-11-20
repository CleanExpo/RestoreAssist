// @vitest-environment jsdom
/**
 * RA-8271 review round 5: the Field Add-Ons tab in the Advanced sidebar uses
 * the same fail-closed rule as Simple mode. Rendered with the real
 * DashboardShell in Advanced mode (experienceMode EXPERIENCED).
 *
 * Positive control: "Cost Libraries" is only in the Advanced list, so seeing
 * it proves the Advanced sidebar rendered; an ADMIN then sees the tab.
 * Mocks copied from platform-nav.test.tsx.
 */
import type { ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRef, getServerSession } = vi.hoisted(() => ({
  sessionRef: {
    current: { data: null as unknown, status: "loading" as string },
  },
  getServerSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: () => sessionRef.current }));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/capacitor/ShellPlatformProvider", () => ({
  useServerIosShell: () => false,
  ShellPlatformProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/account/AccountMenu", () => ({
  AccountMenu: () => null,
}));
vi.mock("@/components/nir-offline-provider", () => ({
  NirSyncStatusBadge: () => null,
}));
vi.mock("@/components/releases/WhatsNewModal", () => ({
  WhatsNewModal: () => null,
}));
vi.mock("@/components/onboarding/ProductTour", () => ({
  ProductTour: () => null,
}));
vi.mock("@/components/TrialBanner", () => ({ TrialBanner: () => null }));
vi.mock("@/components/billing/PastDueBanner", () => ({
  PastDueBanner: () => null,
}));
vi.mock("@/components/billing/CancellationCountdownBanner", () => ({
  CancellationCountdownBanner: () => null,
}));
vi.mock("@/components/billing/TrialCountdownBanner", () => ({
  default: () => null,
}));
vi.mock("@/components/billing/CreditExhaustModal", () => ({
  default: () => null,
}));
vi.mock("@/components/dashboard/AiProviderBanner", () => ({
  AiProviderBanner: () => null,
}));
vi.mock("@/components/dashboard/SimpleModeExploreBanner", () => ({
  SimpleModeExploreBanner: () => null,
}));
vi.mock("@/components/GlobalSearch", () => ({ default: () => null }));
vi.mock("@/components/AutoBreadcrumbs", () => ({
  AutoBreadcrumbs: () => null,
}));
vi.mock("@/components/mobile/MobilePullToRefresh", () => ({
  MobilePullToRefresh: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/help/HelpSearchModal", () => ({ default: () => null }));

import DashboardShell from "@/app/dashboard/DashboardShell";

function signIn(role: string | undefined) {
  sessionRef.current = {
    data: { user: { id: "owner-1", role, organizationId: "org-1" } },
    status: "authenticated",
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/user/experience-mode"
        ? new Response(JSON.stringify({ experienceMode: "EXPERIENCED" }), {
            status: 200,
          })
        : new Response("{}", { status: 404 }),
    ),
  );
  sessionRef.current = { data: null, status: "loading" };
  getServerSession.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderAdvanced(role: string | undefined) {
  signIn(role);
  render(
    <DashboardShell>
      <p>page body</p>
    </DashboardShell>,
  );
  await waitFor(() =>
    expect(
      document.querySelector('a[href="/dashboard/cost-libraries"]'),
    ).not.toBeNull(),
  );
}

describe("Field Add-Ons tab in the Advanced sidebar", () => {
  it("shows for the business owner (ADMIN)", async () => {
    await renderAdvanced("ADMIN");
    expect(
      document.querySelector('a[href="/dashboard/addons"]'),
    ).not.toBeNull();
  });

  it.each([
    ["no role on the session", undefined],
    ["an unknown role", "SOMETHING_ELSE"],
    ["a manager", "MANAGER"],
  ])("is hidden for %s", async (_label, role) => {
    await renderAdvanced(role);
    expect(document.querySelector('a[href="/dashboard/addons"]')).toBeNull();
  });
});
