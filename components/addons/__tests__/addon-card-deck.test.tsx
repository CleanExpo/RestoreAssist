// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  AddonCardDeck,
  IOS_ADDONS_MESSAGE,
  PLAN_REQUIRED_MESSAGE,
  PURCHASE_UNCONFIRMED_MESSAGE,
  cardMark,
} from "../AddonCardDeck";
import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";

const catalog = {
  addons: [
    {
      sku: "VOICE",
      name: "ElevenLabs Voice",
      description: "Voiceovers with your own key.",
      amount: 11,
      currency: "AUD",
      interval: "month" as const,
      perSeat: false,
    },
    {
      sku: "BOOKKEEPING",
      name: "Bookkeeping",
      description: "Sync invoices to your books.",
      amount: 11,
      currency: "AUD",
      interval: "month" as const,
      perSeat: false,
    },
    {
      sku: "AI_COPILOT",
      name: "Margot AI Co-pilot",
      description: "An assistant inside the CRM.",
      amount: 11,
      currency: "AUD",
      interval: "month" as const,
      perSeat: false,
    },
  ],
  owned: ["VOICE"],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AddonCardDeck (RA-8271)", () => {
  it("shows every pack as its own card with price, and an owned pack as Active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }) as never,
    );
    render(<AddonCardDeck />);

    const voice = await screen.findByTestId("addon-card-VOICE");
    expect(within(voice).getByText("Active")).toBeInTheDocument();
    expect(within(voice).queryByRole("button", { name: /add pack/i })).toBeNull();

    const books = screen.getByTestId("addon-card-BOOKKEEPING");
    expect(within(books).getByRole("heading", { name: "Bookkeeping" })).toBeInTheDocument();
    expect(within(books).getByText("$11.00 a month")).toBeInTheDocument();
    expect(within(books).getByRole("button", { name: /add pack/i })).toBeInTheDocument();

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("tells a trial owner plainly that packs start with the plan, on the card they pressed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => catalog })
        // The checkout route's real refusal for an inactive plan.
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({
            error: "Active subscription required to purchase add-ons",
            upgradeRequired: true,
          }),
        }) as never,
    );
    render(<AddonCardDeck />);

    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    const status = await within(books).findByRole("status");
    expect(status).toHaveTextContent(PLAN_REQUIRED_MESSAGE);
    expect(status).not.toHaveTextContent(/seat/i);
    expect(within(status).getByRole("link", { name: "Choose a plan" })).toHaveAttribute(
      "href",
      "/dashboard/subscription",
    );
    // The message stays on the card that was pressed.
    expect(
      within(screen.getByTestId("addon-card-AI_COPILOT")).queryByRole("status"),
    ).toBeNull();
  });

  it("shows the server's own reason for any other refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => catalog })
        .mockResolvedValueOnce({
          ok: false,
          status: 402,
          json: async () => ({ error: { code: "UNPAID", message: "Pay the open invoice first." } }),
        }) as never,
    );
    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));
    expect(await within(books).findByRole("status")).toHaveTextContent(
      "Pay the open invoice first.",
    );
  });

  it("goes to Stripe when checkout returns a link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: "https://checkout.example/s1" }) });
    vi.stubGlobal("fetch", fetchMock as never);
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    await waitFor(() => expect(window.location.href).toBe("https://checkout.example/s1"));
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ addonKey: "BOOKKEEPING" });
    expect(init.headers["Idempotency-Key"]).toEqual(expect.any(String));
  });

  it("review r1: a dropped connection never says nothing was bought, and the retry reuses the same key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog })
      // The checkout request may have reached the server; the reply is lost.
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // The deck re-reads the catalog after the drop.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog })
      // The retry: the server replays the first result for the same key.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: "https://checkout.example/s2" }) });
    vi.stubGlobal("fetch", fetchMock as never);
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    const status = await within(books).findByRole("status");
    expect(status).toHaveTextContent(PURCHASE_UNCONFIRMED_MESSAGE);
    expect(status).not.toHaveTextContent(/nothing was bought/i);
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === "/api/addons/catalog")).toHaveLength(2),
    );

    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));
    await waitFor(() => expect(window.location.href).toBe("https://checkout.example/s2"));
    const checkoutCalls = fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout");
    expect(checkoutCalls).toHaveLength(2);
    expect(checkoutCalls[1][1].headers["Idempotency-Key"]).toBe(
      checkoutCalls[0][1].headers["Idempotency-Key"],
    );
  });

  it("review r1: a request still in progress (409) keeps the key; a definite answer releases it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "A request with this Idempotency-Key is already in progress. Retry shortly." }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({ error: { code: "UNPAID", message: "Pay the open invoice first." } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({ error: { code: "UNPAID", message: "Pay the open invoice first." } }),
      });
    vi.stubGlobal("fetch", fetchMock as never);

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    const press = () => fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    press();
    expect(await within(books).findByText(PURCHASE_UNCONFIRMED_MESSAGE)).toBeInTheDocument();
    press();
    expect(await within(books).findByText(/Pay the open invoice first/)).toBeInTheDocument();
    press();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout")).toHaveLength(3),
    );
    const keys = fetchMock.mock.calls
      .filter(([u]) => u === "/api/addons/checkout")
      .map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys[1]).toBe(keys[0]); // 409 was not an answer
    expect(keys[2]).not.toBe(keys[1]); // the 402 was
  });

  it("review r1: in the iOS app the deck shows no prices, buttons or links, and loads nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    render(
      <ShellPlatformProvider isIosShell>
        <AddonCardDeck />
      </ShellPlatformProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(IOS_ADDONS_MESSAGE);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives every pack in the registry its own card mark", async () => {
    const { RECURRING_ADDONS } = await import("@/lib/billing/addon-registry");
    for (const addon of Object.values(RECURRING_ADDONS)) {
      const mark = cardMark(addon.sku, addon.name);
      // A fallback is the first letter of the name; a real mark is a symbol.
      expect(mark, addon.sku).not.toBe(addon.name.trim().charAt(0).toUpperCase());
    }
  });
});
