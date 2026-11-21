// @vitest-environment jsdom
/**
 * RA-8337 — the claim readiness banner shows plain labels, each linking to
 * the place on the job that fixes it, instead of raw blocker ids.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClaimContextBanner } from "../ClaimContextBanner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubClaimContext(blocking: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          context: { stage: "DRAFT", missingFields: [], wetReadingCount: 0 },
          completeness: { completionPercent: 0, blocking },
        },
      }),
    })),
  );
}

describe("ClaimContextBanner (RA-8337)", () => {
  it("shows labels linked to the fixing tab, not raw ids", async () => {
    stubClaimContext(["client", "s500", "loss_date", "baseline"]);
    render(<ClaimContextBanner inspectionId="insp-1" />);

    const client = await screen.findByRole("link", {
      name: "Customer linked to job",
    });
    expect(client).toHaveAttribute(
      "href",
      "/dashboard/inspections/insp-1?tab=insurer",
    );
    expect(
      screen.getByRole("link", { name: "Water category and class" }),
    ).toHaveAttribute("href", "/dashboard/inspections/insp-1?tab=classification");
    expect(
      screen.getByRole("link", { name: "Baseline moisture" }),
    ).toHaveAttribute("href", "/dashboard/inspections/insp-1?tab=moisture");
    expect(screen.queryByText(/client, s500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bloss_date\b/)).not.toBeInTheDocument();
  });

  it("does not link date of loss to a tab that cannot set it", async () => {
    stubClaimContext(["loss_date"]);
    render(<ClaimContextBanner inspectionId="insp-1" />);
    expect(await screen.findByText(/Date of loss/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
