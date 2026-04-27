import { describe, it, expect } from "vitest";
import {
  attestStabilisationGuard,
  whsIncidentRaisedGuard,
  whsClearedGuard,
} from "../stabilisation";
import type { GuardContext } from "../types";

function baseCtx(): GuardContext {
  return {
    claimProgressId: "cp_1",
    reportId: "r_1",
    inspectionId: "i_1",
    fromState: "STABILISATION_ACTIVE",
    toState: "STABILISATION_COMPLETE",
    key: "attest_stabilisation",
  };
}

function fakeDb(overrides: {
  makeSafe?: Array<{
    id: string;
    action: string;
    completed: boolean;
    applicable: boolean;
  }>;
  swms?: { id: string; signedAt: Date | null } | null;
  whs?: Array<{ id: string; severity: string }>;
  /** Defaults to 1 (photo soft-gap NOT triggered). */
  photoCount?: number;
}) {
  return {
    makeSafeAction: {
      findMany: async () =>
        overrides.makeSafe ?? [
          {
            id: "ms_1",
            action: "power_isolated",
            completed: true,
            applicable: true,
          },
          {
            id: "ms_2",
            action: "water_stopped",
            completed: true,
            applicable: true,
          },
        ],
    },
    swmsDraft: {
      findFirst: async () =>
        overrides.swms === undefined
          ? { id: "s_1", signedAt: new Date() }
          : overrides.swms,
    },
    wHSIncident: {
      findMany: async () => overrides.whs ?? [],
    },
    inspectionPhoto: {
      count: async () => overrides.photoCount ?? 1,
    },
  };
}

describe("attestStabilisationGuard", () => {
  it("passes when make-safe complete + SWMS signed + no open HIGH WHS", async () => {
    const res = await attestStabilisationGuard(fakeDb({}), baseCtx());
    expect(res.passed).toBe(true);
    expect(res.snapshot).toHaveProperty("swmsId", "s_1");
  });

  it("fails when inspectionId is null", async () => {
    const res = await attestStabilisationGuard(fakeDb({}), {
      ...baseCtx(),
      inspectionId: null,
    });
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("Inspection");
  });

  it("fails when an applicable make-safe action is not completed", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({
        makeSafe: [
          {
            id: "ms_1",
            action: "power_isolated",
            completed: false,
            applicable: true,
          },
        ],
      }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("power_isolated");
  });

  it("passes when a non-applicable make-safe action is not completed", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({
        makeSafe: [
          {
            id: "ms_1",
            action: "gas_isolated",
            completed: false,
            applicable: false,
          },
        ],
      }),
      baseCtx(),
    );
    expect(res.passed).toBe(true);
  });

  it("fails when SWMS is not signed", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ swms: { id: "s_1", signedAt: null } }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("SwmsDraft");
  });

  it("fails when SWMS is missing entirely", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ swms: null }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("SwmsDraft");
  });

  it("fails when an open HIGH-severity WHS incident exists", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ whs: [{ id: "w_1", severity: "HIGH" }] }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("WHSIncident");
  });

  it("fails when an open CRITICAL-severity WHS incident exists", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ whs: [{ id: "w_1", severity: "CRITICAL" }] }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
  });

  it("M-14: passes but reports evidence.photo.coverage as a soft gap when no inspection photos exist", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ photoCount: 0 }),
      baseCtx(),
    );
    expect(res.passed).toBe(true);
    expect(res.softGaps).toEqual(["evidence.photo.coverage"]);
    expect(res.snapshot).toHaveProperty("photoCount", 0);
  });

  it("M-14: omits softGaps when at least one photo exists", async () => {
    const res = await attestStabilisationGuard(
      fakeDb({ photoCount: 5 }),
      baseCtx(),
    );
    expect(res.passed).toBe(true);
    expect(res.softGaps).toBeUndefined();
    expect(res.snapshot).toHaveProperty("photoCount", 5);
  });
});

describe("whsIncidentRaisedGuard", () => {
  it("passes when at least one HIGH/CRITICAL open WHS exists", async () => {
    const res = await whsIncidentRaisedGuard(
      fakeDb({ whs: [{ id: "w_1", severity: "HIGH" }] }),
      baseCtx(),
    );
    expect(res.passed).toBe(true);
  });

  it("fails when no open WHS incident", async () => {
    const res = await whsIncidentRaisedGuard(fakeDb({ whs: [] }), baseCtx());
    expect(res.passed).toBe(false);
  });
});

describe("whsClearedGuard", () => {
  it("passes when no HIGH/CRITICAL WHS is open", async () => {
    const res = await whsClearedGuard(fakeDb({ whs: [] }), baseCtx());
    expect(res.passed).toBe(true);
  });

  it("fails if a HIGH/CRITICAL WHS is still open", async () => {
    const res = await whsClearedGuard(
      fakeDb({ whs: [{ id: "w_1", severity: "HIGH" }] }),
      baseCtx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("remain OPEN");
  });
});
