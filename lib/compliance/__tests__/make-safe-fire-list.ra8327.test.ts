/**
 * RA-8327 — fire jobs get the fire make-safe list.
 *
 * Lead decision (12/11/2026, after review round 2): the list the gate checks
 * follows the job's current claim type. Known WATER or MOULD (any non-fire
 * claim) gates on the standard list; FIRE gates on the fire list, except a job
 * that already holds a standard list recorded before RA-8327, which keeps
 * gating on that. A blank claim type counts as FIRE when a fire assessment
 * exists, otherwise standard. Rows from the other list stay visible read-only
 * as history and never count toward the gate. A reclassification never makes
 * the gate easier: in doubt, the stricter list wins.
 *
 * "Is this the untouched intake seed" has one owner, isIntakeSeed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, count, createMany, assessmentFindFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  createMany: vi.fn(),
  assessmentFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    makeSafeAction: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      createMany: (...a: unknown[]) => createMany(...a),
    },
    fireSmokeDamageAssessment: {
      findFirst: (...a: unknown[]) => assessmentFindFirst(...a),
    },
  },
}));

import * as actions from "../make-safe-actions";
import { checkMakeSafeGate } from "../make-safe-gate";
import { ensureMakeSafeSeeded } from "../seed-make-safe";
import { asbestosEraBasis } from "../asbestos-era";
import { MAKE_SAFE_SEED_NOTE as SEED_NOTE } from "../make-safe-compliance";

const STANDARD = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];
const FIRE = [
  "power_isolated",
  "gas_isolated",
  "structure_safe",
  "openings_secured",
  "occupant_briefing",
  "asbestos_presumed",
];

/** Before the fire list existed, and after. */
const LEGACY = new Date("2026-10-01T00:00:00.000Z");
const RECENT = new Date("2026-12-01T00:00:00.000Z");

type Row = {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
  createdAt?: Date;
};
const row = (
  action: string,
  applicable = false,
  completed = false,
  extra: Partial<Row> = {},
): Row => ({ action, applicable, completed, notes: null, createdAt: RECENT, ...extra });
/** The untouched intake seed for a list, created at `at`. */
const seedRows = (ids: string[], at: Date = RECENT): Row[] =>
  ids.map((a) => row(a, false, false, { notes: SEED_NOTE, createdAt: at }));
/** Replace one row of a list by action id. */
function withRow(rows: Row[], r: Row): Row[] {
  return rows.map((x) => (x.action === r.action ? { ...r, createdAt: x.createdAt } : x));
}

type Decision = { kind: string; actions: readonly string[]; history: Row[] };
// Read loosely so this file compiles and FAILS (rather than failing to load)
// against code that predates the API.
const api = actions as unknown as {
  makeSafeActionsFor: (kind: string) => readonly string[];
  decideMakeSafeList: (input: {
    claimType?: string | null;
    hasFireAssessment?: boolean;
    rows?: readonly Row[];
  }) => Decision;
  isIntakeSeed: (rows: readonly Row[]) => boolean;
  MAKE_SAFE_ACTION_LABELS: Record<string, string>;
};
const kindOf = (input: Parameters<typeof api.decideMakeSafeList>[0]) =>
  api.decideMakeSafeList(input).kind;

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  createMany.mockReset();
  assessmentFindFirst.mockReset();
  assessmentFindFirst.mockResolvedValue(null);
});

describe("the two lists", () => {
  it("keeps the standard list for water and mould jobs exactly as it was", () => {
    expect([...actions.MAKE_SAFE_ACTIONS]).toEqual(STANDARD);
    expect(api.makeSafeActionsFor("standard")).toEqual(STANDARD);
  });

  it("gives fire jobs power, gas, structure, openings, occupants and asbestos, and no mould line", () => {
    const fire = api.makeSafeActionsFor("fire");
    expect([...fire]).toEqual(FIRE);
    expect(fire).not.toContain("mould_containment");
    expect(fire).not.toContain("water_stopped");
  });

  it("labels every action on both lists", () => {
    for (const id of [...STANDARD, ...FIRE]) {
      expect(api.MAKE_SAFE_ACTION_LABELS[id]?.length ?? 0).toBeGreaterThan(5);
    }
  });

  it("states the asbestos year on the label from the registry, both jurisdictions", () => {
    const label = api.MAKE_SAFE_ACTION_LABELS.asbestos_presumed;
    expect(label).toContain(String(asbestosEraBasis("AU").year));
    expect(label).toContain(String(asbestosEraBasis("NZ").year));
  });
});

describe("isIntakeSeed, the one owner of 'untouched seed'", () => {
  it("is true only for N/A, not completed rows carrying the seed note", () => {
    expect(api.isIntakeSeed(seedRows(STANDARD))).toBe(true);
  });

  it("is false when a technician wrote a note on an N/A row", () => {
    expect(
      api.isIntakeSeed(withRow(seedRows(STANDARD), row("water_stopped", false, false, { notes: "Mains valve inaccessible" }))),
    ).toBe(false);
  });

  it("is false when a person saved an N/A with no note", () => {
    expect(api.isIntakeSeed(withRow(seedRows(STANDARD), row("mould_containment")))).toBe(false);
  });

  it("is false for an applicable row and for no rows", () => {
    expect(api.isIntakeSeed(withRow(seedRows(STANDARD), row("power_isolated", true)))).toBe(false);
    expect(api.isIntakeSeed([])).toBe(false);
  });
});

describe("which list the gate checks", () => {
  it("fire claim types get the fire list", () => {
    expect(kindOf({ claimType: "FIRE" })).toBe("fire");
    expect(kindOf({ claimType: "FIRE_SMOKE" })).toBe("fire");
  });

  it("water, mould and other known claim types get the standard list", () => {
    for (const claimType of ["WATER", "MOULD", "STORM"]) {
      expect(kindOf({ claimType })).toBe("standard");
    }
  });

  it("a job reclassified to water after fire rows were recorded gates on the standard list", () => {
    const rows = withRow(seedRows(FIRE), row("structure_safe", true, true));
    for (const claimType of ["WATER", "MOULD"]) {
      const decision = api.decideMakeSafeList({ claimType, rows });
      expect(decision.kind).toBe("standard");
      expect(decision.actions).toContain("water_stopped");
      expect(decision.history.map((r) => r.action)).toEqual(["structure_safe"]);
    }
  });

  it("a blank claim type with a fire assessment counts as fire; without one, standard", () => {
    expect(kindOf({ claimType: null, hasFireAssessment: true })).toBe("fire");
    expect(kindOf({ claimType: null, hasFireAssessment: false })).toBe("standard");
    const firedRows = withRow(seedRows(FIRE), row("structure_safe", true, true));
    expect(kindOf({ claimType: null, hasFireAssessment: false, rows: firedRows })).toBe("standard");
  });

  it("a fire job holding a standard list recorded before RA-8327 keeps gating on it", () => {
    const variants = [
      withRow(seedRows(STANDARD, LEGACY), row("water_stopped", true, true)),
      withRow(seedRows(STANDARD, LEGACY), row("occupant_briefing", true, true)),
      withRow(seedRows(STANDARD, LEGACY), row("water_stopped", false, false, { notes: "Mains valve inaccessible" })),
    ];
    for (const rows of variants) {
      const decision = api.decideMakeSafeList({ claimType: "FIRE", rows });
      expect(decision.kind).toBe("standard");
      expect(decision.history).toEqual([]);
    }
  });

  it("a standard list recorded after RA-8327 on a fire job does not lower the gate (reclassified to fire)", () => {
    const rows = withRow(seedRows(STANDARD, RECENT), row("water_stopped", true, true));
    const decision = api.decideMakeSafeList({ claimType: "FIRE", rows });
    expect(decision.kind).toBe("fire");
    expect(decision.history.map((r) => r.action)).toEqual(["water_stopped"]);
  });

  it("when the row dates are unknown, the stricter fire list wins", () => {
    const rows = withRow(seedRows(STANDARD), row("water_stopped", true, true)).map(
      ({ createdAt: _c, ...r }) => r,
    );
    expect(kindOf({ claimType: "FIRE", rows })).toBe("fire");
  });

  it("an untouched legacy standard seed on a fire job moves to the fire list", () => {
    expect(kindOf({ claimType: "FIRE", rows: seedRows(STANDARD, LEGACY) })).toBe("fire");
  });
});

describe("submit gate", () => {
  const gate = checkMakeSafeGate as unknown as (
    id: string,
    claimType?: string | null,
  ) => ReturnType<typeof checkMakeSafeGate>;

  it("on a fire job with no rows, blocks on the six fire actions and never on mould containment", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await gate("insp-fire", "FIRE");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.map((b) => b.action).sort()).toEqual([...FIRE].sort());
  });

  it("on a fire job, an open structure check blocks submit", async () => {
    let rows = seedRows(FIRE);
    rows = withRow(rows, row("power_isolated", true, true));
    rows = withRow(rows, row("structure_safe", true, false));
    findMany.mockResolvedValueOnce(rows);
    const result = await gate("insp-fire", "FIRE");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.map((b) => b.action)).toEqual(["structure_safe"]);
    expect(result.blockers[0].label).toMatch(/structure/i);
  });

  it("on a fire job with the fire list done, passes", async () => {
    findMany.mockResolvedValueOnce(withRow(seedRows(FIRE), row("asbestos_presumed", true, true)));
    expect(await gate("insp-fire", "FIRE")).toEqual({ canSubmit: true, blockers: [] });
  });

  it("on a water job, blocks on the same five standard actions as before", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await gate("insp-water", "WATER");
    expect(result.blockers.map((b) => b.action).sort()).toEqual([...STANDARD].sort());
  });

  it("a water job's recorded fire rows never count toward its gate", async () => {
    findMany.mockResolvedValueOnce([
      row("structure_safe", true, true),
      row("asbestos_presumed", true, true),
    ]);
    const result = await gate("insp-reclass", "WATER");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.map((b) => b.action).sort()).toEqual([...STANDARD].sort());
  });

  it("a live fire job recorded on the standard list before RA-8327 reads unchanged and passes", async () => {
    findMany.mockResolvedValueOnce(
      withRow(seedRows(STANDARD, LEGACY), row("water_stopped", true, true)),
    );
    expect(await gate("insp-live", "FIRE")).toEqual({ canSubmit: true, blockers: [] });
  });

  it("a job reclassified to fire after RA-8327 is held to the fire list", async () => {
    findMany.mockResolvedValueOnce(
      withRow(seedRows(STANDARD, RECENT), row("power_isolated", true, true)),
    );
    const result = await gate("insp-reclass", "FIRE");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.map((b) => b.action).sort()).toEqual(
      ["asbestos_presumed", "openings_secured", "structure_safe"],
    );
  });

  it("a blank claim type with a fire assessment is gated on the fire list", async () => {
    findMany.mockResolvedValueOnce([]);
    assessmentFindFirst.mockResolvedValueOnce({ id: "fsa-1" });
    const result = await gate("insp-blank", null);
    expect(result.blockers.map((b) => b.action).sort()).toEqual([...FIRE].sort());
  });

  it("loads notes and row dates for the decision", async () => {
    findMany.mockResolvedValueOnce([]);
    await gate("insp-fire", "FIRE");
    expect(findMany.mock.calls[0][0]).toMatchObject({
      select: { notes: true, createdAt: true },
    });
  });
});

describe("intake seed", () => {
  const seed = ensureMakeSafeSeeded as unknown as (
    id: string,
    claimType?: string | null,
  ) => Promise<boolean>;
  const seededActions = () =>
    (createMany.mock.calls[0][0] as { data: Array<{ action: string }> }).data.map(
      (d) => d.action,
    );

  it("seeds the fire list on a new fire job", async () => {
    count.mockResolvedValue(0);
    createMany.mockResolvedValue({ count: 6 });
    await expect(seed("insp-fire", "FIRE")).resolves.toBe(true);
    expect(seededActions()).toEqual(FIRE);
  });

  it("seeds the standard list on a new water job", async () => {
    count.mockResolvedValue(0);
    createMany.mockResolvedValue({ count: 5 });
    await expect(seed("insp-water", "WATER")).resolves.toBe(true);
    expect(seededActions()).toEqual(STANDARD);
  });

  it("seeds the fire list on a new job with a blank claim type and a fire assessment", async () => {
    count.mockResolvedValue(0);
    assessmentFindFirst.mockResolvedValueOnce({ id: "fsa-1" });
    createMany.mockResolvedValue({ count: 6 });
    await expect(seed("insp-blank", null)).resolves.toBe(true);
    expect(seededActions()).toEqual(FIRE);
  });

  it("adds the missing fire rows when a fire job holds only the untouched standard seed", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(seedRows(STANDARD, LEGACY));
    createMany.mockResolvedValue({ count: 3 });
    await expect(seed("insp-fire", "FIRE")).resolves.toBe(true);
    expect(seededActions().sort()).toEqual(
      ["asbestos_presumed", "openings_secured", "structure_safe"].sort(),
    );
    expect(createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });

  it("leaves a legacy recorded standard list alone on a fire job", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(
      withRow(seedRows(STANDARD, LEGACY), row("water_stopped", false, false, { notes: "Mains valve inaccessible" })),
    );
    await expect(seed("insp-live", "FIRE")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("does not fill a reclassified fire job's missing fire rows with N/A, so they still block", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(
      withRow(seedRows(STANDARD, RECENT), row("power_isolated", true, true)),
    );
    await expect(seed("insp-reclass", "FIRE")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("loads notes and row dates for the decision", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(seedRows(STANDARD));
    createMany.mockResolvedValue({ count: 3 });
    await seed("insp-fire", "FIRE");
    expect(findMany.mock.calls[0][0]).toMatchObject({
      select: { notes: true, createdAt: true },
    });
  });
});
