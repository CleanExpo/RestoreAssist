// @vitest-environment jsdom
/**
 * Platform-only sidebar links (Admin, NIR Pilot, Content Gate, Governance,
 * Restoration Insights, Margot) are RestoreAssist staff tools. `role: "ADMIN"`
 * is every self-registered business owner, so ADMIN alone must not show them.
 * Only an ADMIN on the server-side PLATFORM_SUPPORT_USER_IDS allowlist sees
 * them. The layout resolves the allowlist on the server and passes a boolean;
 * the allowlist itself never reaches the client.
 *
 * Positive control: the same ADMIN with the platform flag set does see the
 * links, so their absence is the gate and not a render failure.
 */
import type { ReactElement, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRef, getServerSession } = vi.hoisted(() => ({
  sessionRef: { current: { data: null as unknown, status: "loading" as string } },
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
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
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
vi.mock("@/components/account/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/nir-offline-provider", () => ({ NirSyncStatusBadge: () => null }));
vi.mock("@/components/releases/WhatsNewModal", () => ({ WhatsNewModal: () => null }));
vi.mock("@/components/onboarding/ProductTour", () => ({ ProductTour: () => null }));
vi.mock("@/components/TrialBanner", () => ({ TrialBanner: () => null }));
vi.mock("@/components/billing/PastDueBanner", () => ({ PastDueBanner: () => null }));
vi.mock("@/components/billing/CancellationCountdownBanner", () => ({
  CancellationCountdownBanner: () => null,
}));
vi.mock("@/components/billing/TrialCountdownBanner", () => ({ default: () => null }));
vi.mock("@/components/billing/CreditExhaustModal", () => ({ default: () => null }));
vi.mock("@/components/dashboard/AiProviderBanner", () => ({ AiProviderBanner: () => null }));
vi.mock("@/components/dashboard/SimpleModeExploreBanner", () => ({
  SimpleModeExploreBanner: () => null,
}));
vi.mock("@/components/GlobalSearch", () => ({ default: () => null }));
vi.mock("@/components/AutoBreadcrumbs", () => ({ AutoBreadcrumbs: () => null }));
vi.mock("@/components/mobile/MobilePullToRefresh", () => ({
  MobilePullToRefresh: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/help/HelpSearchModal", () => ({ default: () => null }));

import DashboardShell from "@/app/dashboard/DashboardShell";
import DashboardLayout from "@/app/dashboard/layout";
import { platformNavHrefs } from "@/app/dashboard/nav-config";

const PLATFORM_LABELS = [
  "Admin",
  "NIR Pilot",
  "Content Gate",
  "Governance",
  "Restoration Insights",
  "Margot",
];

function signIn(role: string, id = "owner-1") {
  sessionRef.current = {
    data: { user: { id, role, organizationId: "org-1" } },
    status: "authenticated",
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  sessionRef.current = { data: null, status: "loading" };
  getServerSession.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("platformNavHrefs", () => {
  it("is empty for a business owner (ADMIN) who is not a platform operator", () => {
    expect(platformNavHrefs({ role: "ADMIN", isPlatformOperator: false })).toEqual([]);
  });

  it("is empty for an allowlisted MANAGER or USER (the allowlist widens ADMIN only)", () => {
    expect(platformNavHrefs({ role: "MANAGER", isPlatformOperator: true })).toEqual([]);
    expect(platformNavHrefs({ role: "USER", isPlatformOperator: true })).toEqual([]);
  });

  it("lists the six platform destinations for an ADMIN platform operator", () => {
    expect(
      platformNavHrefs({ role: "ADMIN", isPlatformOperator: true }).map((i) => i.label),
    ).toEqual(PLATFORM_LABELS);
  });
});

describe("DashboardShell sidebar", () => {
  async function renderShell(isPlatformOperator?: boolean) {
    signIn("ADMIN");
    render(
      <DashboardShell isPlatformOperator={isPlatformOperator}>
        <p>page body</p>
      </DashboardShell>,
    );
    // Shell is mounted once the regular nav paints.
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /Clients/ }).length).toBeGreaterThan(0),
    );
  }

  it("hides the platform links from a business owner (ADMIN)", async () => {
    await renderShell(false);
    for (const label of PLATFORM_LABELS) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
    expect(document.querySelector('a[href="/dashboard/admin"]')).toBeNull();
    expect(document.querySelector('a[href="/dashboard/margot/home"]')).toBeNull();
  });

  it("hides them when the flag is omitted (fails closed)", async () => {
    await renderShell(undefined);
    expect(document.querySelector('a[href="/dashboard/admin"]')).toBeNull();
  });

  it("shows them to a platform operator (positive control)", async () => {
    await renderShell(true);
    for (const href of [
      "/dashboard/admin",
      "/dashboard/admin/pilot",
      "/dashboard/admin/content-gate",
      "/dashboard/governance",
      "/dashboard/admin/restoration-insights",
      "/dashboard/margot/home",
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});

describe("DashboardLayout resolves the platform flag on the server", () => {
  function shellProps(tree: ReactElement): Record<string, unknown> {
    // <ShellPlatformProvider><DashboardShell .../></ShellPlatformProvider>
    const shell = (tree.props as { children: ReactElement }).children;
    expect(shell.type).toBe(DashboardShell);
    return shell.props as Record<string, unknown>;
  }

  it("passes false for an ADMIN who is not on the allowlist", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "staff-1");
    getServerSession.mockResolvedValue({ user: { id: "owner-1", role: "ADMIN" } });
    const tree = (await DashboardLayout({ children: null })) as ReactElement;
    expect(shellProps(tree).isPlatformOperator).toBe(false);
  });

  it("passes true for an allowlisted ADMIN, and never the allowlist itself", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "staff-1,staff-2");
    getServerSession.mockResolvedValue({ user: { id: "staff-1", role: "ADMIN" } });
    const tree = (await DashboardLayout({ children: null })) as ReactElement;
    const props = shellProps(tree);
    expect(props.isPlatformOperator).toBe(true);
    expect(JSON.stringify(props)).not.toContain("staff-2");
  });

  it("passes false for an allowlisted non-ADMIN", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "staff-1");
    getServerSession.mockResolvedValue({ user: { id: "staff-1", role: "MANAGER" } });
    const tree = (await DashboardLayout({ children: null })) as ReactElement;
    expect(shellProps(tree).isPlatformOperator).toBe(false);
  });

  it("passes false for an owner in development with PLATFORM_SUPPORT_DEV_OPEN and no allowlist", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLATFORM_SUPPORT_DEV_OPEN", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    getServerSession.mockResolvedValue({ user: { id: "owner-1", role: "ADMIN" } });
    const tree = (await DashboardLayout({ children: null })) as ReactElement;
    expect(shellProps(tree).isPlatformOperator).toBe(false);
  });

  it("passes false with no session", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "staff-1");
    getServerSession.mockResolvedValue(null);
    const tree = (await DashboardLayout({ children: null })) as ReactElement;
    expect(shellProps(tree).isPlatformOperator).toBe(false);
  });
});
