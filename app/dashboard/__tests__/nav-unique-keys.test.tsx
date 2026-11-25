// @vitest-environment jsdom
/**
 * RA-8523: the sidebar listed "Completeness inbox" twice for managers and
 * owners in Simple mode, so React logged "Encountered two children with the
 * same key" on every dashboard page. Rendered with the real DashboardShell for
 * each role in both modes; any duplicate-key warning fails the test.
 *
 * Positive controls: each case waits for a link that only that sidebar has
 * ("Workspace summary" for a manager or owner in Simple mode, "Cost Libraries"
 * in Advanced mode, "New Job" in the technician field nav), so a pass means
 * that sidebar actually rendered. Mocks copied from
 * field-addons-advanced-nav.test.tsx.
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

const INBOX = "/dashboard/operations/completeness-inbox";

type Mode = "APPRENTICE" | "EXPERIENCED";

let consoleError: ReturnType<typeof vi.spyOn>;

function mockExperienceMode(mode: Mode) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/user/experience-mode"
        ? new Response(JSON.stringify({ experienceMode: mode }), {
            status: 200,
          })
        : new Response("{}", { status: 404 }),
    ),
  );
}

function duplicateKeyWarnings(): string[] {
  return consoleError.mock.calls
    .map((args: unknown[]) => args.map((a) => String(a)).join(" "))
    .filter((line: string) => line.includes("same key"));
}

beforeEach(() => {
  sessionRef.current = { data: null, status: "loading" };
  getServerSession.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderShell(role: string, mode: Mode, controlHref: string) {
  mockExperienceMode(mode);
  sessionRef.current = {
    data: { user: { id: "user-1", role, organizationId: "org-1" } },
    status: "authenticated",
  };
  render(
    <DashboardShell>
      <p>page body</p>
    </DashboardShell>,
  );
  await waitFor(() =>
    expect(document.querySelector(`a[href="${controlHref}"]`)).not.toBeNull(),
  );
}

describe("dashboard sidebar renders each destination once (RA-8523)", () => {
  it.each<[string, string, Mode, string]>([
    ["a manager in Simple mode", "MANAGER", "APPRENTICE", "/dashboard?stay=1"],
    ["an owner in Simple mode", "ADMIN", "APPRENTICE", "/dashboard?stay=1"],
    [
      "a manager in Advanced mode",
      "MANAGER",
      "EXPERIENCED",
      "/dashboard/cost-libraries",
    ],
    [
      "an owner in Advanced mode",
      "ADMIN",
      "EXPERIENCED",
      "/dashboard/cost-libraries",
    ],
    ["a technician", "USER", "APPRENTICE", "/dashboard/inspections/new"],
  ])(
    "logs no duplicate-key warning for %s",
    async (_label, role, mode, controlHref) => {
      await renderShell(role, mode, controlHref);
      expect(duplicateKeyWarnings()).toEqual([]);
    },
  );

  it.each<[string, string, Mode, string]>([
    ["a manager in Simple mode", "MANAGER", "APPRENTICE", "/dashboard?stay=1"],
    [
      "a manager in Advanced mode",
      "MANAGER",
      "EXPERIENCED",
      "/dashboard/cost-libraries",
    ],
  ])(
    "shows one Completeness inbox link for %s",
    async (_label, role, mode, controlHref) => {
      await renderShell(role, mode, controlHref);
      const sidebar = document
        .querySelector(`a[href="${INBOX}"]`)
        ?.closest("nav");
      expect(sidebar).not.toBeNull();
      expect(sidebar!.querySelectorAll(`a[href="${INBOX}"]`)).toHaveLength(1);
    },
  );
});
