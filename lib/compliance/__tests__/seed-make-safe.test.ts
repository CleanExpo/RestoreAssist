import { describe, it, expect, vi, beforeEach } from "vitest";

const { count, createMany, findMany } = vi.hoisted(() => ({
  count: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    makeSafeAction: {
      count: (...a: unknown[]) => count(...a),
      createMany: (...a: unknown[]) => createMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
    // RA-8327: a blank claim type asks whether the job has a fire assessment.
    fireSmokeDamageAssessment: { findFirst: vi.fn(async () => null) },
  },
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

import { ensureMakeSafeSeeded } from "../seed-make-safe";

beforeEach(() => {
  count.mockReset();
  createMany.mockReset();
});

describe("ensureMakeSafeSeeded", () => {
  it("creates N/A rows when none exist", async () => {
    count.mockResolvedValue(0);
    createMany.mockResolvedValue({ count: 5 });

    await expect(ensureMakeSafeSeeded("insp_1")).resolves.toBe(true);
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            inspectionId: "insp_1",
            action: "water_stopped",
            applicable: false,
            completed: false,
          }),
        ]),
      }),
    );
  });

  it("is a no-op when rows already exist", async () => {
    count.mockResolvedValue(5);
    findMany.mockResolvedValue(
      [
        "power_isolated",
        "gas_isolated",
        "mould_containment",
        "water_stopped",
        "occupant_briefing",
      ].map((action) => ({
        action,
        applicable: false,
        completed: false,
        notes:
          "Seeded at intake — mark applicable items complete before relying on this for compliance.",
      })),
    );
    await expect(ensureMakeSafeSeeded("insp_1")).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });
});
