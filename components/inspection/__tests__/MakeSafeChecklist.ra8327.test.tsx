// @vitest-environment jsdom
/**
 * RA-8327 — the checklist draws the list the server names for this job.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const useFetchMock = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (...a: unknown[]) => useFetchMock(...a),
}));

import { MakeSafeChecklist } from "@/components/inspection/MakeSafeChecklist";

afterEach(() => {
  cleanup();
  useFetchMock.mockReset();
});

const FIRE = [
  "power_isolated",
  "gas_isolated",
  "structure_safe",
  "openings_secured",
  "occupant_briefing",
  "asbestos_presumed",
];

function renderWith(payload: unknown) {
  useFetchMock.mockReturnValue({ data: payload, loading: false, error: null });
  render(<MakeSafeChecklist inspectionId="insp-1" />);
}

describe("MakeSafeChecklist list (RA-8327)", () => {
  it("shows the fire list on a fire job and no mould containment line", () => {
    renderWith({
      data: FIRE.map((action) => ({
        action,
        applicable: false,
        completed: false,
        notes: null,
      })),
      actions: FIRE,
    });
    expect(screen.getByText(/structure safe to enter/i)).toBeInTheDocument();
    expect(screen.getByText(/openings secured/i)).toBeInTheDocument();
    expect(screen.getByText(/asbestos presumed/i)).toBeInTheDocument();
    expect(screen.queryByText(/mould containment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/water source stopped/i)).not.toBeInTheDocument();
  });

  it("keeps the standard list when the server names it", () => {
    renderWith({
      data: [],
      actions: [
        "power_isolated",
        "gas_isolated",
        "mould_containment",
        "water_stopped",
        "occupant_briefing",
      ],
    });
    expect(screen.getByText(/mould containment/i)).toBeInTheDocument();
    expect(screen.queryByText(/structure safe to enter/i)).not.toBeInTheDocument();
  });

  it("falls back to the standard list when the response names none", () => {
    renderWith({ data: [] });
    expect(screen.getByText(/mould containment/i)).toBeInTheDocument();
  });
});
