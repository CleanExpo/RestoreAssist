// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import {
  AddonCardDeck,
  IOS_ADDONS_MESSAGE,
  PLAN_REQUIRED_MESSAGE,
  PURCHASE_UNCONFIRMED_MESSAGE,
  cardMark,
  isFinalCheckoutAnswer,
} from "../AddonCardDeck";
import { parseCheckoutReply } from "@/lib/billing/checkout-return";
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
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => catalog }) as never,
    );
    render(<AddonCardDeck />);

    const voice = await screen.findByTestId("addon-card-VOICE");
    expect(within(voice).getByText("Active")).toBeInTheDocument();
    expect(
      within(voice).queryByRole("button", { name: /add pack/i }),
    ).toBeNull();

    const books = screen.getByTestId("addon-card-BOOKKEEPING");
    expect(
      within(books).getByRole("heading", { name: "Bookkeeping" }),
    ).toBeInTheDocument();
    expect(within(books).getByText("$11.00 a month")).toBeInTheDocument();
    expect(
      within(books).getByRole("button", { name: /add pack/i }),
    ).toBeInTheDocument();

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
    expect(
      within(status).getByRole("link", { name: "Choose a plan" }),
    ).toHaveAttribute("href", "/dashboard/subscription");
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
          json: async () => ({
            error: { code: "UNPAID", message: "Pay the open invoice first." },
          }),
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.example/s1" }),
      });
    vi.stubGlobal("fetch", fetchMock as never);
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.example/s1"),
    );
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ addonKey: "BOOKKEEPING" });
    expect(init.headers["Idempotency-Key"]).toEqual(expect.any(String));
  });

  it("review r1: a dropped connection never says nothing was bought, and the retry reuses the same key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => catalog,
      })
      // The checkout request may have reached the server; the reply is lost.
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // The deck re-reads the catalog after the drop.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => catalog,
      })
      // The retry: the server replays the first result for the same key.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.example/s2" }),
      });
    vi.stubGlobal("fetch", fetchMock as never);
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));

    const status = await within(books).findByRole("status");
    expect(status).toHaveTextContent(PURCHASE_UNCONFIRMED_MESSAGE);
    expect(status).not.toHaveTextContent(/nothing was bought/i);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => u === "/api/addons/catalog"),
      ).toHaveLength(2),
    );

    fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));
    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.example/s2"),
    );
    const checkoutCalls = fetchMock.mock.calls.filter(
      ([u]) => u === "/api/addons/checkout",
    );
    expect(checkoutCalls).toHaveLength(2);
    expect(checkoutCalls[1][1].headers["Idempotency-Key"]).toBe(
      checkoutCalls[0][1].headers["Idempotency-Key"],
    );
  });

  // Review rounds 1 and 2: every reply that does not name an outcome must keep
  // the key. Each case: press -> "couldn't confirm"; press again -> same key;
  // a final 402 -> next press gets a new key.
  const UNKNOWN_OUTCOMES: Array<[string, () => Record<string, unknown>]> = [
    [
      "409 still in progress",
      () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error:
            "A request with this Idempotency-Key is already in progress. Retry shortly.",
        }),
      }),
    ],
    [
      "200 with an unreadable (truncated) body",
      () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }),
    ],
    [
      "500 server error",
      () => ({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: "INTERNAL", message: "Something went wrong." },
        }),
      }),
    ],
    [
      "200 that names no outcome",
      () => ({ ok: true, status: 200, json: async () => ({}) }),
    ],
    [
      "409 completion could not be verified",
      () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error:
            "Request completion could not be verified; check its status before retrying",
        }),
      }),
    ],
    [
      "409 key reused with a different body",
      () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error:
            "Idempotency-Key reused with a different request body. Use a new key for new requests.",
        }),
      }),
    ],
  ];

  // Review round 3: the route's own 409s say nothing was bought. They are
  // final: show the server's reason and release the key, because the
  // idempotency layer caches them and the same key would replay them for ever.
  const ROUTE_CONFLICTS = [
    "Another seat checkout has just started for this business. Please try again.",
    "This add-on is included free in your Founding Trial, so there is nothing to buy.",
  ];

  it.each(ROUTE_CONFLICTS)(
    "review r3: route conflict 409 %s is final",
    async (message) => {
      const checkoutReplies = [
        {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: "CONFLICT", message } }),
        },
        {
          ok: true,
          status: 200,
          json: async () => ({ url: "https://checkout.example/s" }),
        },
      ];
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve(
          url === "/api/addons/catalog"
            ? { ok: true, status: 200, json: async () => catalog }
            : checkoutReplies.shift(),
        ),
      );
      vi.stubGlobal("fetch", fetchMock as never);

      render(<AddonCardDeck />);
      const books = await screen.findByTestId("addon-card-BOOKKEEPING");
      const press = () =>
        fireEvent.click(
          within(books).getByRole("button", { name: /add pack/i }),
        );
      press();
      const status = await within(books).findByRole("status");
      expect(status).toHaveTextContent(message);
      expect(status).not.toHaveTextContent(PURCHASE_UNCONFIRMED_MESSAGE);
      press();
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout"),
        ).toHaveLength(2),
      );
      const keys = fetchMock.mock.calls
        .filter(([u]) => u === "/api/addons/checkout")
        .map(
          ([, init]) =>
            (init as { headers: Record<string, string> }).headers[
              "Idempotency-Key"
            ],
        );
      expect(keys[1]).not.toBe(keys[0]);
    },
  );

  it.each(UNKNOWN_OUTCOMES)(
    "review r2: %s keeps the key and says the result is unknown; a final answer releases it",
    async (_label, unknownReply) => {
      const checkoutReplies = [
        unknownReply(),
        // Round 4: a rate-limit refusal runs before the key is looked up, so
        // it says nothing about the first press and must not settle the key.
        {
          ok: false,
          status: 429,
          json: async () => ({
            error: "Too many requests. Please try again later.",
          }),
        },
        // The server's stored reply for the key settles it (round 4).
        {
          ok: false,
          status: 402,
          headers: new Headers({ "Idempotent-Replayed": "true" }),
          json: async () => ({
            error: { code: "UNPAID", message: "Pay the open invoice first." },
          }),
        },
        {
          ok: false,
          status: 402,
          json: async () => ({
            error: { code: "UNPAID", message: "Pay the open invoice first." },
          }),
        },
      ];
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve(
          url === "/api/addons/catalog"
            ? { ok: true, status: 200, json: async () => catalog }
            : checkoutReplies.shift(),
        ),
      );
      vi.stubGlobal("fetch", fetchMock as never);

      render(<AddonCardDeck />);
      const books = await screen.findByTestId("addon-card-BOOKKEEPING");
      const press = () =>
        fireEvent.click(
          within(books).getByRole("button", { name: /add pack/i }),
        );

      press();
      const status = await within(books).findByRole("status");
      expect(status).toHaveTextContent(PURCHASE_UNCONFIRMED_MESSAGE);
      expect(status).not.toHaveTextContent(/try again\.$/i);
      press();
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout"),
        ).toHaveLength(2),
      );
      expect(
        await within(books).findByText(PURCHASE_UNCONFIRMED_MESSAGE),
      ).toBeInTheDocument();
      press();
      expect(
        await within(books).findByText(/Pay the open invoice first/),
      ).toBeInTheDocument();
      press();
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout"),
        ).toHaveLength(4),
      );
      const keys = fetchMock.mock.calls
        .filter(([u]) => u === "/api/addons/checkout")
        .map(
          ([, init]) =>
            (init as { headers: Record<string, string> }).headers[
              "Idempotency-Key"
            ],
        );
      expect(keys[1]).toBe(keys[0]); // the unknown outcome was not an answer
      expect(keys[2]).toBe(keys[0]); // nor was the fresh 429
      expect(keys[3]).not.toBe(keys[2]); // the stored 402 was
      // The catalog was re-read after the unknown outcome.
      expect(
        fetchMock.mock.calls.filter(([u]) => u === "/api/addons/catalog")
          .length,
      ).toBeGreaterThanOrEqual(2);
    },
  );

  // Review round 4: after an unknown outcome, a refusal from a check the route
  // runs before it looks up the key (rate limit, owner check) says nothing
  // about the earlier press. Only the server's stored reply settles the key.
  it("review r4: after an unknown outcome, fresh refusals keep the key; the stored reply releases it", async () => {
    const replayed = new Headers({ "Idempotent-Replayed": "true" });
    const checkoutReplies: Array<Record<string, unknown> | Error> = [
      new TypeError("Failed to fetch"),
      {
        ok: false,
        status: 429,
        json: async () => ({
          error: "Too many requests. Please try again later.",
        }),
      },
      {
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: "FORBIDDEN",
            message: "Billing is managed by your business owner.",
          },
        }),
      },
      {
        ok: false,
        status: 402,
        headers: replayed,
        json: async () => ({
          error: { code: "UNPAID", message: "Pay the open invoice first." },
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.example/s" }),
      },
    ];
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/addons/catalog") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => catalog,
        });
      }
      const next = checkoutReplies.shift();
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    });
    vi.stubGlobal("fetch", fetchMock as never);

    render(<AddonCardDeck />);
    const books = await screen.findByTestId("addon-card-BOOKKEEPING");
    const press = () =>
      fireEvent.click(within(books).getByRole("button", { name: /add pack/i }));
    const checkoutCalls = () =>
      fetchMock.mock.calls.filter(([u]) => u === "/api/addons/checkout");

    for (let n = 1; n <= 3; n += 1) {
      press();
      await waitFor(() => expect(checkoutCalls()).toHaveLength(n));
      expect(
        await within(books).findByText(PURCHASE_UNCONFIRMED_MESSAGE),
      ).toBeInTheDocument();
    }
    press();
    expect(
      await within(books).findByText(/Pay the open invoice first/),
    ).toBeInTheDocument();
    press();
    await waitFor(() => expect(checkoutCalls()).toHaveLength(5));
    const keys = checkoutCalls().map(
      ([, init]) =>
        (init as { headers: Record<string, string> }).headers[
          "Idempotency-Key"
        ],
    );
    // Lost reply, 429 and owner-check 403 all kept the key; the stored 402 settled it.
    expect(new Set(keys.slice(0, 4)).size).toBe(1);
    expect(keys[4]).not.toBe(keys[0]);
  });

  it("review r2: isFinalCheckoutAnswer releases the key only for a readable reply that names an outcome", () => {
    const final = (status: number, body: unknown) =>
      isFinalCheckoutAnswer(status, body, parseCheckoutReply(status, body));
    // Final
    expect(final(200, { url: "https://checkout.example/s" })).toBe(true);
    expect(final(200, { updated: true, seats: 2 })).toBe(true);
    expect(
      final(403, {
        error: "Active subscription required to purchase add-ons",
        upgradeRequired: true,
      }),
    ).toBe(true);
    expect(final(402, { error: { message: "Pay first." } })).toBe(true);
    expect(
      final(409, { error: "Use the portal.", portalRequired: true, url: null }),
    ).toBe(true);
    expect(final(400, { error: { message: "Invalid add-on" } })).toBe(true);
    // Not final
    expect(final(200, null)).toBe(false);
    expect(final(200, {})).toBe(false);
    expect(final(200, "ok")).toBe(false);
    expect(
      final(409, {
        error: {
          code: "CONFLICT",
          message: "Another seat checkout has just started.",
        },
      }),
    ).toBe(true);
    expect(final(409, { error: "already in progress" })).toBe(false);
    expect(
      final(409, { error: "Request completion could not be verified" }),
    ).toBe(false);
    expect(final(409, { error: { code: "INTERNAL", message: "x" } })).toBe(
      false,
    );
    expect(final(409, { error: null })).toBe(false);
    // Round 4: once a key is unresolved, only a success or the stored reply settles it.
    const settles = (status: number, body: unknown, replayed: boolean) =>
      isFinalCheckoutAnswer(status, body, parseCheckoutReply(status, body), {
        unresolved: true,
        replayed,
      });
    expect(
      settles(
        429,
        { error: "Too many requests. Please try again later." },
        false,
      ),
    ).toBe(false);
    expect(
      settles(403, { error: { code: "FORBIDDEN", message: "x" } }, false),
    ).toBe(false);
    expect(
      settles(
        401,
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        false,
      ),
    ).toBe(false);
    expect(settles(402, { error: { message: "Pay first." } }, true)).toBe(true);
    expect(
      settles(409, { error: { code: "CONFLICT", message: "free" } }, true),
    ).toBe(true);
    expect(settles(200, { url: "https://checkout.example/s" }, false)).toBe(
      true,
    );
    expect(settles(500, { error: { message: "boom" } }, true)).toBe(false);
    expect(settles(409, { error: "already in progress" }, true)).toBe(false);
    // A first press (nothing unresolved) is settled by a fresh refusal.
    expect(
      final(429, { error: "Too many requests. Please try again later." }),
    ).toBe(true);
    expect(final(500, { error: { message: "boom" } })).toBe(false);
    expect(final(502, null)).toBe(false);
    expect(final(403, null)).toBe(false);
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
      expect(mark, addon.sku).not.toBe(
        addon.name.trim().charAt(0).toUpperCase(),
      );
    }
  });
});
