// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FloorPlanUnderlayLoader } from "../FloorPlanUnderlayLoader";

beforeEach(() => vi.restoreAllMocks());

describe("FloorPlanUnderlayLoader — PR5 Premium gate", () => {
  it("shows an 'Upgrade to unlock' CTA when the scrape returns 402", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ error: { code: "PAYMENT_REQUIRED" } }),
      }),
    );

    render(
      <FloorPlanUnderlayLoader
        defaultAddress="12 Smith St"
        inspectionId="i1"
        onApply={() => {}}
        onClear={() => {}}
        autoFetch
      />,
    );

    const cta = await screen.findByRole("link", { name: /upgrade to unlock/i });
    expect(cta).toHaveAttribute("href", "/billing/upgrade");
  });
});
