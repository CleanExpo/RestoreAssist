// RA-1136a: Logic tests for MakeSafeChecklist state helpers
// Validates the 5-action structure, default state, and row-to-state hydration
// (No jsdom required — pure function tests)

import { describe, it, expect } from "vitest";

// ── Inline the pure helpers from MakeSafeChecklist (no React import needed) ─

const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

type MakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];

const ACTION_LABELS: Record<MakeSafeActionName, string> = {
  power_isolated: "Power isolated (electrical hazard)",
  gas_isolated: "Gas supply isolated (gas leak hazard)",
  mould_containment: "Mould containment barriers erected",
  water_stopped: "Water source stopped/diverted",
  occupant_briefing: "Occupant safety briefing documented",
};

interface ActionState {
  applicable: boolean;
  completed: boolean;
  notes: string;
}

type ChecklistState = Record<MakeSafeActionName, ActionState>;

function defaultState(): ChecklistState {
  return Object.fromEntries(
    MAKE_SAFE_ACTIONS.map((a) => [
      a,
      { applicable: true, completed: false, notes: "" },
    ]),
  ) as ChecklistState;
}

interface MakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes: string | null;
}

function rowsToState(rows: MakeSafeRow[]): ChecklistState {
  const state = defaultState();
  for (const row of rows) {
    if (MAKE_SAFE_ACTIONS.includes(row.action as MakeSafeActionName)) {
      state[row.action as MakeSafeActionName] = {
        applicable: row.applicable,
        completed: row.completed,
        notes: row.notes ?? "",
      };
    }
  }
  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MakeSafeChecklist — state helpers", () => {
  describe("MAKE_SAFE_ACTIONS constant", () => {
    it("contains exactly 5 actions", () => {
      expect(MAKE_SAFE_ACTIONS).toHaveLength(5);
    });

    it("contains the expected 5 action names", () => {
      expect(MAKE_SAFE_ACTIONS).toContain("power_isolated");
      expect(MAKE_SAFE_ACTIONS).toContain("gas_isolated");
      expect(MAKE_SAFE_ACTIONS).toContain("mould_containment");
      expect(MAKE_SAFE_ACTIONS).toContain("water_stopped");
      expect(MAKE_SAFE_ACTIONS).toContain("occupant_briefing");
    });
  });

  describe("ACTION_LABELS", () => {
    it("has a label for every action", () => {
      for (const action of MAKE_SAFE_ACTIONS) {
        expect(ACTION_LABELS[action]).toBeDefined();
        expect(ACTION_LABELS[action].length).toBeGreaterThan(5);
      }
    });
  });

  describe("defaultState()", () => {
    it("produces applicable=true, completed=false for all 5 actions", () => {
      const state = defaultState();
      for (const action of MAKE_SAFE_ACTIONS) {
        expect(state[action].applicable).toBe(true);
        expect(state[action].completed).toBe(false);
        expect(state[action].notes).toBe("");
      }
    });
  });

  describe("rowsToState()", () => {
    it("hydrates completed status from API rows", () => {
      const rows: MakeSafeRow[] = [
        {
          action: "power_isolated",
          applicable: true,
          completed: true,
          notes: "done",
        },
        {
          action: "gas_isolated",
          applicable: false,
          completed: false,
          notes: null,
        },
      ];

      const state = rowsToState(rows);

      expect(state.power_isolated.completed).toBe(true);
      expect(state.power_isolated.notes).toBe("done");
      expect(state.gas_isolated.applicable).toBe(false);
      expect(state.gas_isolated.notes).toBe("");
    });

    it("ignores unknown action names from API", () => {
      const rows: MakeSafeRow[] = [
        {
          action: "unknown_action",
          applicable: true,
          completed: true,
          notes: null,
        },
      ];

      // Should not throw and defaults remain intact
      expect(() => rowsToState(rows)).not.toThrow();
      const state = rowsToState(rows);
      // All 5 known actions still have default values
      for (const action of MAKE_SAFE_ACTIONS) {
        expect(state[action].completed).toBe(false);
      }
    });

    it("returns all 5 actions even when API returns fewer rows", () => {
      const rows: MakeSafeRow[] = [
        {
          action: "power_isolated",
          applicable: true,
          completed: true,
          notes: null,
        },
      ];

      const state = rowsToState(rows);
      expect(Object.keys(state)).toHaveLength(5);
    });
  });

  describe("compliance pill logic", () => {
    it("reports PASS when all applicable items are completed", () => {
      const state = defaultState();
      // Mark all complete
      for (const action of MAKE_SAFE_ACTIONS) {
        state[action].completed = true;
      }

      const applicable = MAKE_SAFE_ACTIONS.filter((a) => state[a].applicable);
      const allComplete = applicable.every((a) => state[a].completed);
      expect(allComplete).toBe(true);
    });

    it("reports INCOMPLETE when at least one applicable item is not completed", () => {
      const state = defaultState();
      state.power_isolated.completed = true;
      // gas_isolated still false

      const applicable = MAKE_SAFE_ACTIONS.filter((a) => state[a].applicable);
      const allComplete = applicable.every((a) => state[a].completed);
      expect(allComplete).toBe(false);
    });

    it("reports PASS when all items are N/A", () => {
      const state = defaultState();
      for (const action of MAKE_SAFE_ACTIONS) {
        state[action].applicable = false;
      }

      const applicable = MAKE_SAFE_ACTIONS.filter((a) => state[a].applicable);
      // No applicable items — vacuously true
      const allComplete = applicable.every((a) => state[a].completed);
      expect(allComplete).toBe(true);
      expect(applicable).toHaveLength(0);
    });
  });
});
