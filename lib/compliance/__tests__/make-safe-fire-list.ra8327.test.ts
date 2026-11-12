/**
 * RA-8327 — fire jobs get the fire make-safe list.
 *
 * Before this change every job, fire included, was checked against one list
 * that carried "Mould containment barriers erected" and had no line for the
 * structure, the openings or asbestos. Water and mould jobs must keep exactly
 * the list and gate behaviour they had, and make-safe rows already stored on
 * live jobs must read the way they did (no data rewrite).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, count, createMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    makeSafeAction: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      createMany: (...a: unknown[]) => createMany(...a),
    },
  },
}));

import * as actions from "../make-safe-actions";
import { checkMakeSafeGate } from "../make-safe-gate";
import { ensureMakeSafeSeeded } from "../seed-make-safe";
import { asbestosEraBasis } from "../asbestos-era";

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

type Row = {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
};
const SEED_NOTE =
  "Seeded at intake — mark applicable items complete before relying on this for compliance.";
const row = (action: string, applicable = false, completed = false): Row => ({
  action,
  applicable,
  completed,
});
const seedRows = (ids: string[]) => ids.map((a) => row(a));

// The new API, read loosely so this file compiles and FAILS (rather than
// failing to load) against the code that predates it.
const api = actions as unknown as {
  makeSafeActionsFor: (kind: string) => readonly string[];
  makeSafeListKindFor: (input: {
    claimType?: string | null;
    rows?: readonly Row[];
  }) => string;
  MAKE_SAFE_ACTION_LABELS: Record<string, string>;
};

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  createMany.mockReset();
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

describe("which list a job gets", () => {
  it("fire claim types get the fire list", () => {
    expect(api.makeSafeListKindFor({ claimType: "FIRE" })).toBe("fire");
    expect(api.makeSafeListKindFor({ claimType: "FIRE_SMOKE" })).toBe("fire");
  });

  it("water, mould and unknown claim types keep the standard list", () => {
    for (const claimType of ["WATER", "MOULD", "STORM", null, undefined]) {
      expect(api.makeSafeListKindFor({ claimType })).toBe("standard");
    }
  });

  it("a live fire job whose technician already recorded the standard list keeps reading it", () => {
    const rows = [...seedRows(STANDARD)];
    rows[3] = row("water_stopped", true, true);
    expect(api.makeSafeListKindFor({ claimType: "FIRE", rows })).toBe("standard");
  });

  it("a live fire job with only a shared action recorded keeps the standard list", () => {
    const rows = seedRows(STANDARD);
    rows[4] = row("occupant_briefing", true, true);
    expect(api.makeSafeListKindFor({ claimType: "FIRE", rows })).toBe("standard");
  });

  it("a live fire job with a technician note on an N/A standard row keeps the standard list", () => {
    const rows = seedRows(STANDARD).map((r) => ({ ...r, notes: SEED_NOTE }));
    rows[3] = { ...row("water_stopped"), notes: "Mains valve inaccessible; insurer notified" };
    expect(api.makeSafeListKindFor({ claimType: "FIRE", rows })).toBe("standard");
  });

  it("a person's N/A with no note is a record too; only the intake seed note is not", () => {
    const rows = seedRows(STANDARD).map((r) => ({ ...r, notes: SEED_NOTE }));
    expect(api.makeSafeListKindFor({ claimType: "FIRE", rows })).toBe("fire");
    rows[2] = { ...row("mould_containment"), notes: null };
    expect(api.makeSafeListKindFor({ claimType: "FIRE", rows })).toBe("standard");
  });

  it("an untouched standard seed on a fire claim moves to the fire list", () => {
    expect(
      api.makeSafeListKindFor({ claimType: "FIRE", rows: seedRows(STANDARD) }),
    ).toBe("fire");
  });

  it("a recorded fire list stays fire when the claim type is later overwritten", () => {
    const rows = seedRows(FIRE);
    rows[2] = row("structure_safe", true, true);
    expect(api.makeSafeListKindFor({ claimType: "WATER", rows })).toBe("fire");
    expect(api.makeSafeListKindFor({ claimType: null, rows })).toBe("fire");
  });

  it("with no claim type, the seeded rows name the list", () => {
    expect(api.makeSafeListKindFor({ claimType: null, rows: seedRows(FIRE) })).toBe("fire");
    expect(api.makeSafeListKindFor({ claimType: null, rows: seedRows(STANDARD) })).toBe(
      "standard",
    );
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
    findMany.mockResolvedValueOnce([
      ...seedRows(FIRE.filter((a) => a !== "structure_safe" && a !== "power_isolated")),
      row("power_isolated", true, true),
      row("structure_safe", true, false),
    ]);
    const result = await gate("insp-fire", "FIRE");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.map((b) => b.action)).toEqual(["structure_safe"]);
    expect(result.blockers[0].label).toMatch(/structure/i);
  });

  it("on a fire job with the fire list done, passes", async () => {
    findMany.mockResolvedValueOnce([
      ...seedRows(FIRE.filter((a) => a !== "asbestos_presumed")),
      row("asbestos_presumed", true, true),
    ]);
    const result = await gate("insp-fire", "FIRE");
    expect(result).toEqual({ canSubmit: true, blockers: [] });
  });

  it("on a water job, blocks on the same five standard actions as before", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await gate("insp-water", "WATER");
    expect(result.blockers.map((b) => b.action).sort()).toEqual([...STANDARD].sort());
  });

  it("reads notes so a noted N/A standard row keeps a live fire job on its list", async () => {
    const rows = seedRows(STANDARD).map((r) => ({ ...r, notes: SEED_NOTE }));
    rows[3] = { ...row("water_stopped"), notes: "Mains valve inaccessible" };
    rows[0] = { ...row("power_isolated", true, true), notes: null };
    findMany.mockResolvedValueOnce(rows);
    const result = await gate("insp-live", "FIRE");
    expect(findMany.mock.calls[0][0]).toMatchObject({ select: { notes: true } });
    expect(result).toEqual({ canSubmit: true, blockers: [] });
  });

  it("a live fire job recorded on the standard list reads unchanged and passes", async () => {
    const rows = seedRows(STANDARD);
    rows[3] = row("water_stopped", true, true);
    findMany.mockResolvedValueOnce(rows);
    const result = await gate("insp-live", "FIRE");
    expect(result).toEqual({ canSubmit: true, blockers: [] });
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

  it("adds the missing fire rows when a fire job holds only the untouched standard seed", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(seedRows(STANDARD));
    createMany.mockResolvedValue({ count: 3 });
    await expect(seed("insp-fire", "FIRE")).resolves.toBe(true);
    expect(seededActions().sort()).toEqual(
      ["asbestos_presumed", "openings_secured", "structure_safe"].sort(),
    );
    expect(createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });

  it("leaves a standard list with only a shared action recorded alone on a fire job", async () => {
    count.mockResolvedValue(5);
    const rows = seedRows(STANDARD);
    rows[4] = row("occupant_briefing", true, true);
    findMany.mockResolvedValueOnce(rows);
    await expect(seed("insp-live", "FIRE")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("leaves an all-N/A standard list carrying a technician note alone on a fire job", async () => {
    count.mockResolvedValue(5);
    const rows = seedRows(STANDARD).map((r) => ({ ...r, notes: SEED_NOTE }));
    rows[3] = { ...row("water_stopped"), notes: "Mains valve inaccessible" };
    findMany.mockResolvedValueOnce(rows);
    await expect(seed("insp-live", "FIRE")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("the seed reads notes so it can tell a technician's N/A from the intake seed", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValueOnce(seedRows(STANDARD).map((r) => ({ ...r, notes: SEED_NOTE })));
    createMany.mockResolvedValue({ count: 3 });
    await seed("insp-fire", "FIRE");
    expect(findMany.mock.calls[0][0]).toMatchObject({ select: { notes: true } });
  });

  it("leaves a recorded standard list alone on a live fire job", async () => {
    count.mockResolvedValue(5);
    const rows = seedRows(STANDARD);
    rows[0] = row("power_isolated", true, true);
    rows[3] = row("water_stopped", true, true);
    findMany.mockResolvedValueOnce(rows);
    await expect(seed("insp-live", "FIRE")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });
});
