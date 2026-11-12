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

const STANDARD = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];
const SEED_NOTE =
  "Seeded at intake — mark applicable items complete before relying on this for compliance.";

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

  it("shows the other list's recorded rows read-only, outside the compliance count", () => {
    renderWith({
      data: [],
      actions: STANDARD,
      history: [
        { action: "structure_safe", applicable: true, completed: true, notes: "Engineer cleared" },
      ],
    });
    const history = screen.getByRole("region", { name: /earlier list/i });
    expect(history).toHaveTextContent(/structure safe to enter/i);
    expect(history).toHaveTextContent("Engineer cleared");
    expect(history.querySelectorAll("button, input, textarea")).toHaveLength(0);
    // The standard list has nothing recorded, so the history row does not make it PASS.
    expect(screen.getByLabelText(/^Compliance status:/)).not.toHaveTextContent("PASS");
  });

  it("a quick-fill seed never overwrites a technician's note on an N/A row", () => {
    const seed = Object.fromEntries(
      STANDARD.map((a) => [a, { applicable: true, completed: true, notes: "preset" }]),
    );
    useFetchMock.mockReturnValue({
      data: {
        data: STANDARD.map((action) => ({
          action,
          applicable: false,
          completed: false,
          notes:
            action === "water_stopped"
              ? "Mains valve inaccessible; insurer notified"
              : SEED_NOTE,
        })),
        actions: STANDARD,
      },
      loading: false,
      error: null,
    });
    render(<MakeSafeChecklist inspectionId="insp-1" seed={seed} />);
    expect(
      screen.getByDisplayValue("Mains valve inaccessible; insurer notified"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Compliance status:/)).not.toHaveTextContent("PASS");
  });

  it("a quick-fill seed still applies over the untouched intake seed", () => {
    const seed = Object.fromEntries(
      STANDARD.map((a) => [a, { applicable: true, completed: true, notes: "preset" }]),
    );
    useFetchMock.mockReturnValue({
      data: {
        data: STANDARD.map((action) => ({
          action,
          applicable: false,
          completed: false,
          notes: SEED_NOTE,
        })),
        actions: STANDARD,
      },
      loading: false,
      error: null,
    });
    render(<MakeSafeChecklist inspectionId="insp-1" seed={seed} />);
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent("PASS");
  });

  it("falls back to the standard list when the response names none", () => {
    renderWith({ data: [] });
    expect(screen.getByText(/mould containment/i)).toBeInTheDocument();
  });
});
