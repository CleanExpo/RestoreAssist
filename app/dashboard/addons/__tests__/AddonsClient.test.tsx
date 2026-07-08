// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddonsClient from "../AddonsClient";

const catalog = {
  addons: [
    {
      sku: "VOICE",
      name: "Voice Notes",
      description: "Dictate field notes.",
      amount: 11,
      currency: "AUD",
      interval: "month" as const,
      perSeat: false,
    },
    {
      sku: "TECHNICIAN_SEATS",
      name: "Technician Seats",
      description: "Extra field seats.",
      amount: 9,
      currency: "AUD",
      interval: "month" as const,
      perSeat: true,
    },
  ],
  owned: ["VOICE"],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AddonsClient", () => {
  it("renders each pack with a formatted price and an owned/active badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }) as never,
    );

    render(<AddonsClient />);

    await waitFor(() =>
      expect(screen.getByText("Voice Notes")).toBeInTheDocument(),
    );
    // Owned pack shows Active, not an Add button.
    expect(screen.getByText("Active")).toBeInTheDocument();
    // Per-seat pricing formatted with the seat suffix.
    expect(screen.getByText(/\$9\.00\/mo per seat/)).toBeInTheDocument();
    // Unowned pack shows an Add button.
    expect(
      screen.getByRole("button", { name: /add pack/i }),
    ).toBeInTheDocument();
  });

  it("posts the sku to the checkout endpoint when Add pack is clicked", async () => {
    const fetchMock = vi
      .fn()
      // first call: catalog
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      // second call: checkout
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "/pay" }) });
    vi.stubGlobal("fetch", fetchMock as never);
    // Prevent jsdom navigation noise.
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    render(<AddonsClient />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add pack/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /add pack/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/addons/checkout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ addonKey: "TECHNICIAN_SEATS" }),
        }),
      ),
    );
  });

  it("shows an error state when the catalog fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never,
    );
    render(<AddonsClient />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );
  });
});
