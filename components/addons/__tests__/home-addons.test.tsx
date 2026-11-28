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

import { HOME_ADDONS_OWNER_INTRO, HOME_ADDONS_STAFF_INTRO, HomeAddons } from "../HomeAddons";
import { ADDON_PRICE_TERMS, NO_VERDICT_REASON } from "../AddonCardDeck";
import { OWNER_VIEWER, STAFF_VIEWER, withServerVerdicts } from "./server-verdicts";
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

  it("RA-8665: the intro follows the server's canManageBilling, not the session role", async () => {
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
