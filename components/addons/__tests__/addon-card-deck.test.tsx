// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AddonCardDeck, PLAN_REQUIRED_MESSAGE, cardMark } from "../AddonCardDeck";

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

  it("gives every pack in the registry its own card mark", async () => {
    const { RECURRING_ADDONS } = await import("@/lib/billing/addon-registry");
    for (const addon of Object.values(RECURRING_ADDONS)) {
      const mark = cardMark(addon.sku, addon.name);
      // A fallback is the first letter of the name; a real mark is a symbol.
      expect(mark, addon.sku).not.toBe(addon.name.trim().charAt(0).toUpperCase());
    }
  });
});
