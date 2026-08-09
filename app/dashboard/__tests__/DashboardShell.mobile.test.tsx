// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { router, session } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  session: {
    user: {
      id: "mobile-shell-user",
      name: "Mobile Tester",
      email: "mobile@test.local",
      role: "USER",
    },
  },
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => router,
}));
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: session, status: "authenticated" }),
}));
vi.mock("@/components/capacitor/ShellPlatformProvider", () => ({
  useServerIosShell: () => false,
}));
vi.mock("@/lib/capacitor", () => ({ shouldHideBillingUI: () => false }));

vi.mock("@/components/notifications", () => ({
  NotificationBell: () => null,
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
vi.mock("@/components/GlobalSearch", () => ({ default: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/AutoBreadcrumbs", () => ({
  AutoBreadcrumbs: () => null,
}));
vi.mock("@/components/help/HowToDropdown", () => ({ default: () => null }));
vi.mock("@/components/help/HelpSearchModal", () => ({ default: () => null }));

import DashboardShell from "../DashboardShell";

beforeEach(() => {
  router.push.mockReset();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 393,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(new Promise(() => undefined)),
  );
});

describe("DashboardShell mobile navigation", () => {
  it("closes the mobile drawer without changing desktop collapse state", () => {
    const { container } = render(
      <DashboardShell>
        <p>Dashboard content</p>
      </DashboardShell>,
    );
    const sidebar = container.querySelector("aside");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(sidebar).toHaveClass("translate-x-0", "w-64");
    expect(container.querySelector("div.fixed.inset-0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(sidebar).toHaveClass("-translate-x-full", "w-64");
    expect(container.querySelector("div.fixed.inset-0")).not.toBeInTheDocument();
  });

  it("keeps desktop sidebar collapse on its own control", () => {
    const { container } = render(
      <DashboardShell>
        <p>Dashboard content</p>
      </DashboardShell>,
    );
    const sidebar = container.querySelector("aside");

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );

    expect(sidebar).toHaveClass("md:w-20");
    expect(sidebar).toHaveClass("-translate-x-full");
  });
});
