// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FloorPlanUnderlayLoader } from "../FloorPlanUnderlayLoader";
import { FLOORPLAN_UNDERLAY_ADDON } from "@/lib/billing/floorplan-underlay-addon";

beforeEach(() => vi.restoreAllMocks());

/**
 * RA-6922 — when the scrape returns 402 (no active Floor Plan Underlay add-on)
 * the loader now offers the recurring $11/mo add-on upgrade CTA. This supersedes
 * the earlier F2 (RA-6929/6930/6931) "neutral note, no upgrade link" behaviour,
 * which held only while there was no add-on to sell.
 */
describe("FloorPlanUnderlayLoader — 402 handling (RA-6922 add-on)", () => {
  beforeEach(() => {
    // RA-6848 [C2]: the 402 path is the URL scrape, which is legally gated
    // (RA-6850). Enable the flag so auto-fetch exercises that branch.
    vi.stubEnv("NEXT_PUBLIC_UNDERLAY_URL_IMPORT", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ error: { code: "PAYMENT_REQUIRED" } }),
      }),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("offers the recurring $11/mo add-on upgrade CTA on 402", async () => {
    render(
      <FloorPlanUnderlayLoader
        defaultAddress="12 Smith St"
        inspectionId="i1"
        onApply={() => {}}
        onClear={() => {}}
        autoFetch
      />,
    );

    // The upgrade CTA (a button, not a plan link) appears once the scrape 402s.
    expect(
      await screen.findByRole("button", {
        name: /add floor plan underlay/i,
      }),
    ).toBeInTheDocument();
    // And it is priced as the recurring add-on — asserted against the add-on's
    // own SSOT, not a typed figure. This assertion pinned $9.95 and had to be
    // edited when the amount moved to $11; derived, it tracks the price instead
    // of having to be chased.
    const amount = FLOORPLAN_UNDERLAY_ADDON.amount;
    const price = amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
    expect(
      screen.getByText(
        new RegExp(
          `${price.replace(/[$.]/g, (c) => `\\${c}`)}/${FLOORPLAN_UNDERLAY_ADDON.interval}`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
  });
});

/**
 * RA-8272 item 6: the upgrade button starts a paid subscription, so it sends
 * an Idempotency-Key and keeps it until a readable reply names an outcome. A
 * retried press after a lost or unreadable reply replays the first purchase.
 */
describe("FloorPlanUnderlayLoader upgrade checkout key (RA-8272)", () => {
  afterEach(() => vi.unstubAllEnvs());

  type Reply = { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> };
  const reply = (status: number, body: unknown): Reply => ({
    ok: status < 400,
    status,
    headers: new Headers(),
    json: async () => body,
  });
  const unreadable = (status: number): Reply => ({
    ok: status < 400,
    status,
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  });

  function stub(checkoutReplies: Array<() => Reply | Promise<Reply>>) {
    vi.stubEnv("NEXT_PUBLIC_UNDERLAY_URL_IMPORT", "1");
    const keys: Array<string | undefined> = [];
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (String(input) === "/api/addons/checkout") {
          keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
          return checkoutReplies[n++]();
        }
        return reply(402, { error: { code: "PAYMENT_REQUIRED" } });
      }),
    );
    return keys;
  }

  async function pressUpgrade() {
    const button = await screen.findByRole("button", { name: /add floor plan underlay/i });
    await act(async () => {
      fireEvent.click(button);
    });
    return button;
  }

  function renderLoader() {
    render(
      <FloorPlanUnderlayLoader
        defaultAddress="12 Smith St"
        inspectionId="i1"
        onApply={() => {}}
        onClear={() => {}}
        autoFetch
      />,
    );
  }

  it("sends an Idempotency-Key and keeps it after an unreadable reply", async () => {
    const keys = stub([
      () => unreadable(200),
      () => reply(403, { error: { code: "FORBIDDEN", message: "no" } }),
    ]);
    renderLoader();
    await pressUpgrade();
    await pressUpgrade();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toEqual(keys[0]);
  });

  it("keeps the key after a lost connection and after a 5xx", async () => {
    const keys = stub([
      () => Promise.reject(new TypeError("network")),
      () => reply(500, { error: { code: "INTERNAL", message: "boom" } }),
      () => reply(403, { error: { code: "FORBIDDEN", message: "no" } }),
    ]);
    renderLoader();
    await pressUpgrade();
    await pressUpgrade();
    await pressUpgrade();
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
  });

  it("a readable refusal releases the key", async () => {
    const keys = stub([
      () => reply(403, { error: { code: "FORBIDDEN", message: "no" } }),
      () => reply(403, { error: { code: "FORBIDDEN", message: "no" } }),
    ]);
    renderLoader();
    await pressUpgrade();
    expect(await screen.findByText("no")).toBeInTheDocument();
    await pressUpgrade();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toEqual(keys[0]);
  });
});

describe("FloorPlanUnderlayLoader room suggestions (RA-8236)", () => {
  const base = { onApply: vi.fn(), onClear: vi.fn(), hasBackground: true };

  it("offers suggestions only when a bound reference is available", () => {
    const { rerender } = render(<FloorPlanUnderlayLoader {...base} />);
    expect(
      screen.queryByRole("button", { name: /suggest rooms/i }),
    ).not.toBeInTheDocument();

    rerender(
      <FloorPlanUnderlayLoader {...base} onSuggestRooms={async () => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /suggest rooms/i }),
    ).toBeInTheDocument();
  });

  it("states that only page 1 is read and rooms stay unmeasured", () => {
    render(
      <FloorPlanUnderlayLoader {...base} onSuggestRooms={async () => {}} />,
    );
    expect(screen.getByText(/page 1 only/i)).toBeInTheDocument();
    expect(screen.getByText(/measure and confirm/i)).toBeInTheDocument();
  });

  it("blocks a second click while a read is running", async () => {
    let finish: () => void = () => undefined;
    const onSuggestRooms = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(
      <FloorPlanUnderlayLoader {...base} onSuggestRooms={onSuggestRooms} />,
    );
    const button = screen.getByRole("button", { name: /suggest rooms/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSuggestRooms).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button).not.toBeDisabled();
  });
});
