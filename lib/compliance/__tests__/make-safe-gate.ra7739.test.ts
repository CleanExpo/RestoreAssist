// RA-7739: the Stabilisation (make-safe) submit gate must refuse a checklist
// where nothing was marked applicable. RA-7713 part 10 already made the badge
// read "Not assessed" for that state; the gate still let it SUBMIT, so badge
// and gate disagreed. They now share makeSafeCompliance().

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { makeSafeAction: { findMany: mockFindMany } },
}));

vi.mock("@/app/api/inspections/[id]/make-safe/route", () => ({
  MAKE_SAFE_ACTIONS: [
    "power_isolated",
    "gas_isolated",
    "mould_containment",
    "water_stopped",
    "occupant_briefing",
  ] as const,
}));

import { checkMakeSafeGate } from "../make-safe-gate";
import { makeSafeCompliance } from "../make-safe-compliance";

const ALL_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];

// Exactly what ensureMakeSafeSeeded writes at intake (seed-make-safe.ts:29-35):
// every action applicable=false, completed=false. The gate selects only these
// three columns.
const INTAKE_SEED = ALL_ACTIONS.map((action) => ({
  action,
  applicable: false,
  completed: false,
}));

describe("checkMakeSafeGate — all N/A is not an assessment (RA-7739)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses the untouched intake seed with a plain-English reason", async () => {
    mockFindMany.mockResolvedValueOnce(INTAKE_SEED);
    const result = await checkMakeSafeGate("insp-seed");
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toMatch(/stabilisation checklist/i);
    expect(result.reason).toMatch(/applicable/i);
    expect(result.reason).not.toMatch(/IICRC|S500|AS\/NZS/);
  });

  it("refuses a checklist where every item was marked N/A by hand", async () => {
    mockFindMany.mockResolvedValueOnce(
      ALL_ACTIONS.map((action) => ({ action, applicable: false, completed: true })),
    );
    const result = await checkMakeSafeGate("insp-all-na");
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("allows one applicable completed item with the rest N/A", async () => {
    mockFindMany.mockResolvedValueOnce([
      { action: "power_isolated", applicable: false, completed: false },
      { action: "gas_isolated", applicable: false, completed: false },
      { action: "mould_containment", applicable: false, completed: false },
      { action: "water_stopped", applicable: false, completed: false },
      { action: "occupant_briefing", applicable: true, completed: true },
    ]);
    const result = await checkMakeSafeGate("insp-one");
    expect(result.canSubmit).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("agrees with the badge for every state: submit allowed iff PASS", async () => {
    const cases = [
      INTAKE_SEED,
      ALL_ACTIONS.map((action) => ({ action, applicable: true, completed: true })),
      ALL_ACTIONS.map((action, i) => ({
        action,
        applicable: true,
        completed: i !== 2,
      })),
      ALL_ACTIONS.map((action, i) => ({
        action,
        applicable: i === 0,
        completed: i === 0,
      })),
    ];
    for (const rows of cases) {
      mockFindMany.mockResolvedValueOnce(rows);
      const result = await checkMakeSafeGate("insp-x");
      expect(result.canSubmit).toBe(makeSafeCompliance(rows) === "PASS");
    }
  });
});
