// @vitest-environment jsdom
/**
 * RA-8327 — the checklist draws the list the server names for this job.
 */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const useFetchMock = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (...a: unknown[]) => useFetchMock(...a),
}));

import {
  MakeSafeChecklist,
  type MakeSafeChecklistHandle,
} from "@/components/inspection/MakeSafeChecklist";

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

  it("choosing the same preset twice through applySeed keeps an N/A note and keeps Not assessed", () => {
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
    const ref = createRef<MakeSafeChecklistHandle>();
    render(<MakeSafeChecklist ref={ref} inspectionId="insp-1" seed={seed} />);
    act(() => ref.current!.applySeed(seed));
    act(() => ref.current!.applySeed(seed));
    expect(
      screen.getByDisplayValue("Mains valve inaccessible; insurer notified"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent("Not assessed");
  });

  it("applySeed applies over the untouched seed, and a second preset never replaces the first", () => {
    const first = Object.fromEntries(
      STANDARD.map((a) => [a, { applicable: true, completed: true, notes: "first" }]),
    );
    const second = Object.fromEntries(
      STANDARD.map((a) => [a, { applicable: false, completed: false, notes: "second" }]),
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
    const ref = createRef<MakeSafeChecklistHandle>();
    render(<MakeSafeChecklist ref={ref} inspectionId="insp-1" />);
    act(() => ref.current!.applySeed(first));
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent("PASS");
    act(() => ref.current!.applySeed(second));
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent("PASS");
    expect(screen.queryByDisplayValue("second")).not.toBeInTheDocument();
  });

  it("a note typed on a seeded row before a quick-fill is kept", () => {
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
    const ref = createRef<MakeSafeChecklistHandle>();
    render(<MakeSafeChecklist ref={ref} inspectionId="insp-1" />);
    fireEvent.change(screen.getByLabelText(/Notes for "Water source/), {
      target: { value: "Typed on site" },
    });
    act(() => ref.current!.applySeed(seed));
    expect(screen.getByDisplayValue("Typed on site")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Compliance status:/)).toHaveTextContent("Not assessed");
  });

  it("applyQuickFill is the only place a preset is written to the checklist state", () => {
    const src = readFileSync(
      join(process.cwd(), "components/inspection/MakeSafeChecklist.tsx"),
      "utf8",
    );
    const start = src.indexOf("function applyQuickFill(");
    expect(start).toBeGreaterThan(-1);
    expect(src.indexOf("function applyQuickFill(", start + 1)).toBe(-1);
    const end = src.indexOf("\n  }\n", start);
    const owner = src.slice(start, end);
    expect(owner).toContain("isIntakeSeed");
    expect(owner).toContain("setState(");

    // Every other state write is either the hydration from stored rows or a
    // single-field edit by the technician; neither can carry a preset.
    const others: string[] = [];
    for (const m of src.matchAll(/setState\(/g)) {
      const at = m.index ?? 0;
      if (at >= start && at < end) continue;
      others.push(src.slice(at, src.indexOf("\n", at)).trim());
    }
    expect(others.sort()).toEqual(["setState((prev) => ({", "setState(fromApi);"].sort());

    // Both preset entry points route through the owner.
    const applySeed = src.slice(src.indexOf("applySeed: ("), src.indexOf("}),", src.indexOf("applySeed: (")));
    expect(applySeed).toContain("applyQuickFill(");
    expect(src).toMatch(/applyQuickFill\(usableSeed\)/);
  });

  it("falls back to the standard list when the response names none", () => {
    renderWith({ data: [] });
    expect(screen.getByText(/mould containment/i)).toBeInTheDocument();
  });
});
