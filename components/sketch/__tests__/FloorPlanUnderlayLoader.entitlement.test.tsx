// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FloorPlanUnderlayLoader } from "../FloorPlanUnderlayLoader";

beforeEach(() => vi.restoreAllMocks());

/**
 * F2 (RA-6929/6930/6931) — when the scrape returns 402 the loader shows a
 * neutral "not available yet" note and NO longer renders an upgrade CTA that
 * would sell a nonexistent plan. Manual upload stays available.
 */
const UPGRADE_PATH = "/billing/" + "upgrade";
describe("FloorPlanUnderlayLoader — 402 handling (F2)", () => {
  beforeEach(() => {
    // RA-6848 [C2]: the 402 note is on the URL scrape path, which is legally
    // gated (RA-6850). Enable the flag so auto-fetch exercises that branch.
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

  it("shows a neutral unavailable note on 402, with no upgrade link", async () => {
    const { container } = render(
      <FloorPlanUnderlayLoader
        defaultAddress="12 Smith St"
        inspectionId="i1"
        onApply={() => {}}
        onClear={() => {}}
        autoFetch
      />,
    );

    expect(await screen.findByText(/not available yet/i)).toBeInTheDocument();
    // No CTA selling a retired plan.
    expect(
      screen.queryByRole("link", { name: /upgrade to unlock/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(`a[href="${UPGRADE_PATH}"]`)).toBeNull();
  });
});
