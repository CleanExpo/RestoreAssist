// @vitest-environment jsdom
/**
 * RA-7660 (One CRM, Unit A1) — the NIR Australian Compliance section names
 * NRPG only when NEXT_PUBLIC_NRPG_ENABLED is on. The DR-NRPG Category field
 * is dormant (kept behind the switch), not deleted.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NIRClaimAssessmentPanel from "../NIRClaimAssessmentPanel";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function openCompliance() {
  render(
    <NIRClaimAssessmentPanel inspectionId="insp_1" lockedClaimType="WATER" />,
  );
  fireEvent.click(await screen.findByText("Australian Compliance"));
  // The section is open once its first field renders.
  await screen.findByText("Insurer Name");
}

describe("NIR Australian Compliance and the NRPG switch", () => {
  it("shows no NRPG text with the switch off", async () => {
    vi.stubEnv("NEXT_PUBLIC_NRPG_ENABLED", "");
    await openCompliance();
    expect(document.body.textContent ?? "").not.toMatch(/NRPG/i);
    expect(screen.getByText("Insurer · Technician credentials")).toBeInTheDocument();
  });

  it("brings the DR-NRPG Category field back with the switch on", async () => {
    vi.stubEnv("NEXT_PUBLIC_NRPG_ENABLED", "true");
    await openCompliance();
    expect(screen.getByText("DR-NRPG Category")).toBeInTheDocument();
  });
});
