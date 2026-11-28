// @vitest-environment jsdom
/**
 * RA-8665 — the packs near the top of the dashboard home. Fails if the home
 * page stops showing them, or shows them below its first panel. The placement
 * test renders the real dashboard page, so a section that is in the source but
 * never rendered still fails.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRef } = vi.hoisted(() => ({
  sessionRef: { current: { data: null, status: "authenticated" } as unknown },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionRef.current }));
// Only for the dashboard page render below. Each panel is tagged so the test
// can find the first one; everything else on the page is the real code.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/dashboard/TechLicenceBanner", () => ({ TechLicenceBanner: () => null }));
vi.mock("@/components/dashboard/InboundJobAlert", () => ({ InboundJobAlert: () => null }));
vi.mock("@/components/onboarding/BasicReportWithoutKeyCta", () => ({ BasicReportWithoutKeyCta: () => null }));
vi.mock("@/components/SessionMetadataCard", () => ({ EvaluatorScoreBadge: () => null }));
vi.mock("@/app/dashboard/components/DashboardPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/dashboard/components/DashboardPanel")>();
  return {
    ...real,
    DashboardPanel: (props: Parameters<typeof real.DashboardPanel>[0]) => (
      <div data-testid="dashboard-panel">{real.DashboardPanel(props)}</div>
    ),
  };
});

import {
  HOME_ADDONS_OWNER_INTRO,
  HOME_ADDONS_STAFF_INTRO,
  HomeAddons,
} from "../HomeAddons";
import { ADDON_PRICE_TERMS, NO_VERDICT_REASON } from "../AddonCardDeck";
import {
  NO_BUSINESS_VIEWER,
  OWNER_VIEWER,
  STAFF_VIEWER,
  withServerVerdicts,
} from "./server-verdicts";
import DashboardPage from "@/app/dashboard/page";
import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { NO_BUSINESS_REASON, OWNER_ONLY_REASON } from "@/lib/billing/addon-access";

const pack = (sku: string, name: string) => ({
  sku,
  name,
  description: `${name} benefit.`,
  amount: 11,
  currency: "AUD",
  interval: "month" as const,
  perSeat: false,
});

const catalog = {
  addons: [pack("PAYMENTS", "Payments Collection"), pack("VOICE", "ElevenLabs Voice")],
  owned: ["VOICE"],
};
const ownerReply = withServerVerdicts(catalog, OWNER_VIEWER);
const staffReply = withServerVerdicts(catalog, STAFF_VIEWER);

function serve(reply: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => reply }) as never,
  );
}

function signIn(role: string) {
  sessionRef.current = {
    data: { user: { id: `user-${role}`, role } },
    status: "authenticated",
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  serve(ownerReply);
});

describe("Dashboard home add-ons", () => {
  it("RA-8665: shows each pack with its benefit, price and an Add button; an owned pack shows as on", async () => {
    signIn("ADMIN");
    render(<HomeAddons />);
    expect(screen.getByRole("heading", { name: "Add-Ons" })).toBeInTheDocument();
    const payments = await screen.findByTestId("addon-card-PAYMENTS");
    expect(within(payments).getByText("Payments Collection benefit.")).toBeInTheDocument();
    expect(within(payments).getByText("$11.00 a month")).toBeInTheDocument();
    expect(within(payments).getByRole("button", { name: /add pack/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("addon-card-VOICE")).getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ADDON_PRICE_TERMS.replace(/\./g, "\\.")))).toBeInTheDocument();
  });

  it("RA-8665: the owner gets a link to every pack; staff, who cannot open that page, do not", async () => {
    signIn("ADMIN");
    const { unmount } = render(<HomeAddons />);
    expect(screen.getByRole("link", { name: "See all add-ons" })).toHaveAttribute(
      "href",
      "/dashboard/addons",
    );
    await screen.findByTestId("addon-card-PAYMENTS");
    unmount();
    signIn("USER");
    render(<HomeAddons />);
    await screen.findByTestId("addon-card-PAYMENTS");
    expect(screen.queryByRole("link", { name: "See all add-ons" })).toBeNull();
  });

  it("RA-8665: staff never get a buy or manage control, with or without a verdict from the server", async () => {
    signIn("USER");
    for (const [served, reason] of [
      [catalog, NO_VERDICT_REASON],
      [staffReply, OWNER_ONLY_REASON],
    ] as const) {
      serve(served);
      const { unmount } = render(<HomeAddons />);
      await screen.findByTestId("addon-card-PAYMENTS");
      expect(screen.queryAllByRole("button")).toEqual([]);
      for (const sku of ["PAYMENTS", "VOICE"]) {
        expect(
          within(screen.getByTestId(`addon-card-${sku}`)).getByText(reason),
        ).toBeInTheDocument();
      }
      unmount();
    }
  });

  it("RA-8665: the intro follows the card verdicts, not the session role", async () => {
    // The server says this account manages billing: the owner offer shows.
    signIn("USER");
    serve(ownerReply);
    const first = render(<HomeAddons />);
    expect(await screen.findByText(HOME_ADDONS_OWNER_INTRO)).toBeInTheDocument();
    expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
    first.unmount();
    // The server says it does not: staff read who can add packs.
    signIn("ADMIN");
    serve(staffReply);
    render(<HomeAddons />);
    expect(await screen.findByText(HOME_ADDONS_STAFF_INTRO)).toBeInTheDocument();
    expect(screen.queryByText(/Switch on extra features/)).toBeNull();
  });

  it("RA-8665: an account in no business reads, on each card, that it is not part of one, and no intro offers it anything", async () => {
    // No business owner over this account (so it counts as billing owner),
    // but /dashboard/subscription refuses role USER, and there is no owner.
    signIn("USER");
    serve(withServerVerdicts(catalog, NO_BUSINESS_VIEWER));
    render(<HomeAddons />);
    const card = await screen.findByTestId("addon-card-PAYMENTS");
    expect(within(card).getByText(NO_BUSINESS_REASON)).toBeInTheDocument();
    expect(screen.queryByText(HOME_ADDONS_OWNER_INTRO)).toBeNull();
    expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
    expect(screen.queryByText(OWNER_ONLY_REASON)).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("RA-8665: a reply that does not name the audience shows no intro, even one that says canManageBilling", async () => {
    // An older server sent canManageBilling without audience. The screen makes
    // no claim the server did not make: no owner offer, no owner to ask.
    signIn("USER");
    for (const served of [
      { ...catalog, canManageBilling: true },
      { ...catalog, audience: "admin", canManageBilling: true },
    ]) {
      serve(served);
      const { unmount } = render(<HomeAddons />);
      await screen.findByTestId("addon-card-PAYMENTS");
      expect(screen.queryByText(/Switch on extra features/)).toBeNull();
      expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
      expect(screen.queryAllByRole("button")).toEqual([]);
      unmount();
    }
  });

  it("RA-8665: a reply without card verdicts shows no intro, even one that names the owner audience", async () => {
    // Review round 8: the reply says owner, but there are no verdicts (or
    // only for a pack not drawn), so every card offers nothing.
    signIn("ADMIN");
    for (const served of [
      { ...ownerReply, access: undefined, audience: "owner" },
      { ...ownerReply, access: { HIDDEN: ownerReply.access.PAYMENTS }, audience: "owner" },
    ]) {
      serve(served);
      const { unmount } = render(<HomeAddons />);
      const card = await screen.findByTestId("addon-card-PAYMENTS");
      expect(within(card).getByText(NO_VERDICT_REASON)).toBeInTheDocument();
      expect(screen.queryByText(HOME_ADDONS_OWNER_INTRO)).toBeNull();
      expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
      expect(screen.queryAllByRole("button")).toEqual([]);
      unmount();
    }
  });

  it("RA-8665: a stale ADMIN session in no business and with no workspace reads no owner offer", async () => {
    // Round 7: the session says ADMIN, so the billing pages open, but the
    // database says USER and there is no business and no workspace.
    signIn("ADMIN");
    // No pack held, as in the review's case: then no card offers anything.
    serve(
      withServerVerdicts({ ...catalog, owned: [] }, {
        ...NO_BUSINESS_VIEWER,
        canOpenBillingPages: true,
        hasWorkspace: { pack: false, seat: false },
      }),
    );
    render(<HomeAddons />);
    await screen.findByTestId("addon-card-PAYMENTS");
    expect(screen.queryByText(/Switch on extra features/)).toBeNull();
    expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    for (const sku of ["PAYMENTS", "VOICE"]) {
      expect(within(screen.getByTestId(`addon-card-${sku}`)).queryAllByRole("link")).toEqual([]);
    }
  });

  it("RA-8665: in the iOS app the home section shows nothing and loads nothing", () => {
    signIn("ADMIN");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    const { container } = render(
      <ShellPlatformProvider isIosShell>
        <HomeAddons />
      </ShellPlatformProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading", { name: "Add-Ons" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RA-8665: the rendered dashboard home shows the add-ons above its first panel", async () => {
    sessionRef.current = {
      data: {
        user: { id: "user-ADMIN", role: "ADMIN", organizationId: "org-a", name: "Owner" },
        expires: "2099-01-01",
      },
      status: "authenticated",
      update: vi.fn(),
    };
    const replies: Record<string, unknown> = {
      "/api/addons/catalog": ownerReply,
      "/api/workspace/status": { hasWorkspace: true, status: "READY", ready: true, workspaceId: "w" },
      "/api/reports": { reports: [] },
      "/api/clients": { clients: [] },
      "/api/inspections": { inspections: [] },
      "/api/invoices": { invoices: [] },
      "/api/operations/completeness-inbox": { data: [] },
      "/api/dashboard/home-counts": { activeJobs: 0, openReports: 0, awaitingPayment: 0, clients: 0 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(Response.json(replies[String(url).split("?")[0]] ?? {})),
      ) as never,
    );
    render(<DashboardPage />);
    const addons = await screen.findByRole("region", { name: "Add-Ons" });
    await within(addons).findByTestId("addon-card-PAYMENTS");
    const panels = await screen.findAllByTestId("dashboard-panel");
    expect(
      addons.compareDocumentPosition(panels[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
