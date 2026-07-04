// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FloorPlanUnderlayLoader } from "../FloorPlanUnderlayLoader";

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
    // And it is priced as the recurring add-on.
    expect(screen.getByText(/\$11\/month/i)).toBeInTheDocument();
  });
});
