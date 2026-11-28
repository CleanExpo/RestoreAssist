// @vitest-environment jsdom
/**
 * RA-8665 — the packs near the top of the dashboard home. Fails if the home
 * page stops showing them, or shows them below its first panel.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRef } = vi.hoisted(() => ({
  sessionRef: { current: { data: null, status: "authenticated" } as unknown },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionRef.current }));

import { HOME_ADDONS_STAFF_INTRO, HomeAddons } from "../HomeAddons";
import { ADDON_PRICE_TERMS } from "../AddonCardDeck";
import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { OWNER_ONLY_REASON } from "@/lib/billing/addon-access";

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

function signIn(role: string) {
  sessionRef.current = {
    data: { user: { id: `user-${role}`, role } },
    status: "authenticated",
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }) as never,
  );
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

  it("RA-8665: staff never get a buy or manage control, with or without access from the server", async () => {
    const askOwner = { label: "optional_paid", action: "ask_owner", reason: OWNER_ONLY_REASON };
    const withAccess = {
      ...catalog,
      access: {
        PAYMENTS: { ...askOwner, holding: "none" },
        VOICE: { ...askOwner, holding: "paid" },
      },
    };
    signIn("USER");
    for (const served of [catalog, withAccess]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => served }) as never,
      );
      const { unmount } = render(<HomeAddons />);
      await screen.findByTestId("addon-card-PAYMENTS");
      expect(screen.queryAllByRole("button", { name: /add|manage|seat/i })).toEqual([]);
      for (const sku of ["PAYMENTS", "VOICE"]) {
        expect(
          within(screen.getByTestId(`addon-card-${sku}`)).getByText(OWNER_ONLY_REASON),
        ).toBeInTheDocument();
      }
      unmount();
    }
  });

  it("RA-8665: the owner is offered the packs; staff are told who can add them", async () => {
    signIn("ADMIN");
    const { unmount } = render(<HomeAddons />);
    expect(screen.getByText(/Switch on extra features for your business\./)).toBeInTheDocument();
    expect(screen.queryByText(HOME_ADDONS_STAFF_INTRO)).toBeNull();
    await screen.findByTestId("addon-card-PAYMENTS");
    unmount();
    signIn("USER");
    render(<HomeAddons />);
    expect(screen.getByText(HOME_ADDONS_STAFF_INTRO)).toBeInTheDocument();
    expect(screen.queryByText(/Switch on extra features/)).toBeNull();
    await screen.findByTestId("addon-card-PAYMENTS");
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

  it("RA-8665: the dashboard home renders the add-ons above its first panel", () => {
    const src = readFileSync(join(process.cwd(), "app/dashboard/page.tsx"), "utf8");
    const addons = src.indexOf("<HomeAddons />");
    const firstPanel = src.indexOf("<DashboardPanel");
    expect(addons).toBeGreaterThan(-1);
    expect(firstPanel).toBeGreaterThan(-1);
    expect(addons).toBeLessThan(firstPanel);
  });
});
