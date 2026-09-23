// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const useFetchMock = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (...a: unknown[]) => useFetchMock(...a),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { MakeSafeChecklist } from "@/components/inspection/MakeSafeChecklist";

afterEach(() => {
  cleanup();
  useFetchMock.mockReset();
});

const SEED_NOTE =
  "Seeded at intake — mark applicable items complete before relying on this for compliance.";
const ACTIONS = [
  "gas_isolated",
  "mould_containment",
  "occupant_briefing",
  "power_isolated",
  "water_stopped",
];

function rows(
  over: Partial<{ applicable: boolean; completed: boolean; notes: string | null }>[] = [],
) {
  return ACTIONS.map((action, i) => ({
    action,
    applicable: false,
    completed: false,
    notes: SEED_NOTE,
    ...(over[i] ?? {}),
  }));
}

function renderWith(data: unknown) {
  useFetchMock.mockReturnValue({ data: { data }, loading: false, error: null });
  render(<MakeSafeChecklist inspectionId="insp-1" />);
}

describe("MakeSafeChecklist compliance badge (RA-7713 part 10)", () => {
  it("shows Not assessed for the all-N/A intake seed, never PASS", () => {
    renderWith(rows());
    const badge = screen.getByLabelText(/^Compliance status:/);
    expect(badge).toHaveTextContent("Compliance: Not assessed");
    expect(badge).not.toHaveTextContent("PASS");
  });

  it("shows PASS when an applicable item is complete and the rest are N/A", () => {
    renderWith(rows([{ applicable: true, completed: true, notes: null }]));
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent(
      "Compliance: PASS",
    );
  });

  it("shows FAIL when an applicable item is still open", () => {
    renderWith(
      rows([
        { applicable: true, completed: true, notes: null },
        { applicable: true, completed: false, notes: null },
      ]),
    );
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent(
      "Compliance: FAIL",
    );
  });
});
