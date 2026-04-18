// RA-1136a: Unit tests for checkMakeSafeGate
// Verifies: canSubmit logic, blocker generation, N/A exemption

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──────────────────────────────────────────────────────────────
// vi.mock is hoisted, so the factory must not reference variables declared
// outside it. We capture the spy via vi.hoisted instead.

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    makeSafeAction: {
      findMany: mockFindMany,
    },
  },
}));

// ── Mock route constants (avoids Next.js server-only import in test env) ────

vi.mock("@/app/api/inspections/[id]/make-safe/route", () => ({
  MAKE_SAFE_ACTIONS: [
    "power_isolated",
    "gas_isolated",
    "mould_containment",
    "water_stopped",
    "occupant_briefing",
  ] as const,
}));

// ── Import SUT after mocks ───────────────────────────────────────────────────

import { checkMakeSafeGate } from "../make-safe-gate";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(action: string, applicable: boolean, completed: boolean) {
  return { action, applicable, completed };
}

const ALL_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("checkMakeSafeGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canSubmit: true when all applicable items are completed", async () => {
    mockFindMany.mockResolvedValueOnce(
      ALL_ACTIONS.map((a) => makeRow(a, true, true)),
    );

    const result = await checkMakeSafeGate("insp-001");

    expect(result.canSubmit).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns blockers for incomplete applicable items", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeRow("power_isolated", true, true),
      makeRow("gas_isolated", true, false), // <-- blocker
      makeRow("mould_containment", true, true),
      makeRow("water_stopped", true, false), // <-- blocker
      makeRow("occupant_briefing", true, true),
    ]);

    const result = await checkMakeSafeGate("insp-002");

    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers.map((b) => b.action)).toContain("gas_isolated");
    expect(result.blockers.map((b) => b.action)).toContain("water_stopped");
  });

  it("does not block on N/A (applicable=false) items even if incomplete", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeRow("power_isolated", true, true),
      makeRow("gas_isolated", false, false), // N/A — must not block
      makeRow("mould_containment", false, false), // N/A — must not block
      makeRow("water_stopped", true, true),
      makeRow("occupant_briefing", true, true),
    ]);

    const result = await checkMakeSafeGate("insp-003");

    expect(result.canSubmit).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("treats missing rows as applicable + incomplete (safe default)", async () => {
    // Only 2 of 5 rows exist
    mockFindMany.mockResolvedValueOnce([
      makeRow("power_isolated", true, true),
      makeRow("gas_isolated", true, true),
    ]);

    const result = await checkMakeSafeGate("insp-004");

    expect(result.canSubmit).toBe(false);
    // 3 missing rows → 3 blockers
    expect(result.blockers).toHaveLength(3);
    expect(result.blockers.map((b) => b.action)).toContain("mould_containment");
    expect(result.blockers.map((b) => b.action)).toContain("water_stopped");
    expect(result.blockers.map((b) => b.action)).toContain("occupant_briefing");
  });

  it("includes human-readable labels in blockers", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeRow("power_isolated", true, false),
    ]);

    const result = await checkMakeSafeGate("insp-005");

    const blocker = result.blockers.find((b) => b.action === "power_isolated");
    expect(blocker).toBeDefined();
    expect(blocker?.label).toBe("Power isolated (electrical hazard)");
  });
});
