import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_NOTE_MAX,
  evaluateVisitSubmission,
  isVisitLockedStatus,
  minutesOnSite,
  parseVisitPatch,
  type VisitForGate,
} from "../visit-gate";

const complete: VisitForGate = {
  arrivedAt: new Date("2026-11-21T22:05:00Z"),
  departedAt: new Date("2026-11-22T00:40:00Z"),
  metOnSite: "TENANT",
  frontPhotoId: "photo-1",
  equipmentOutcome: "ALL_LEFT",
  equipmentNote: null,
};

const fields = (r: ReturnType<typeof evaluateVisitSubmission>) =>
  r.ok ? [] : r.missing.map((m) => m.field);

describe("evaluateVisitSubmission", () => {
  it("passes a complete visit (the gate can say yes)", () => {
    expect(evaluateVisitSubmission(complete, { frontPhotoUsable: true })).toEqual({ ok: true });
  });

  it("lists all five mandatory items for an empty visit", () => {
    const empty: VisitForGate = {
      arrivedAt: null,
      departedAt: null,
      metOnSite: null,
      frontPhotoId: null,
      equipmentOutcome: null,
      equipmentNote: null,
    };
    expect(fields(evaluateVisitSubmission(empty, { frontPhotoUsable: false }))).toEqual([
      "arrivedAt",
      "departedAt",
      "metOnSite",
      "frontPhotoId",
      "equipmentOutcome",
    ]);
  });

  it.each([
    ["arrivedAt", { arrivedAt: null }],
    ["departedAt", { departedAt: null }],
    ["metOnSite", { metOnSite: null }],
    ["frontPhotoId", { frontPhotoId: null }],
    ["equipmentOutcome", { equipmentOutcome: null }],
  ] as const)("%s alone blocks submit", (field, patch) => {
    const r = evaluateVisitSubmission({ ...complete, ...patch }, { frontPhotoUsable: true });
    expect(fields(r)).toEqual([field]);
  });

  it("a front photo that is set but no longer usable (rejected or gone) blocks", () => {
    expect(fields(evaluateVisitSubmission(complete, { frontPhotoUsable: false }))).toEqual(["frontPhotoId"]);
  });

  it("departure at or before arrival blocks", () => {
    const same = { ...complete, departedAt: complete.arrivedAt };
    expect(fields(evaluateVisitSubmission(same, { frontPhotoUsable: true }))).toEqual(["departedAt"]);
    const before = { ...complete, departedAt: new Date("2026-11-21T21:00:00Z") };
    expect(fields(evaluateVisitSubmission(before, { frontPhotoUsable: true }))).toEqual(["departedAt"]);
  });

  it("some equipment removed needs a note saying which", () => {
    const some = { ...complete, equipmentOutcome: "SOME_REMOVED", equipmentNote: "  " };
    expect(fields(evaluateVisitSubmission(some, { frontPhotoUsable: true }))).toEqual(["equipmentNote"]);
    const noted = { ...some, equipmentNote: "2 air movers removed" };
    expect(evaluateVisitSubmission(noted, { frontPhotoUsable: true })).toEqual({ ok: true });
  });

  it("every missing item carries a plain label", () => {
    const r = evaluateVisitSubmission({ ...complete, metOnSite: null }, { frontPhotoUsable: true });
    expect(r).toEqual({ ok: false, missing: [{ field: "metOnSite", label: "Who was on site" }] });
  });
});

describe("minutesOnSite", () => {
  it("is whole minutes between arrival and departure", () => {
    expect(minutesOnSite(complete.arrivedAt, complete.departedAt)).toBe(155);
  });
  it("is null when either time is missing or departure is not after arrival", () => {
    expect(minutesOnSite(null, complete.departedAt)).toBeNull();
    expect(minutesOnSite(complete.arrivedAt, null)).toBeNull();
    expect(minutesOnSite(complete.departedAt, complete.arrivedAt)).toBeNull();
  });
});

describe("parseVisitPatch", () => {
  const now = new Date("2026-11-22T01:00:00Z");

  it("accepts every field and clears with null", () => {
    const r = parseVisitPatch(
      {
        arrivedAt: "2026-11-21T22:05:00.000Z",
        departedAt: null,
        metOnSite: "OWNER",
        frontPhotoId: "photo-1",
        equipmentOutcome: "SOME_REMOVED",
        equipmentNote: "  one dehumidifier removed ",
      },
      now,
    );
    expect(r).toEqual({
      ok: true,
      data: {
        arrivedAt: new Date("2026-11-21T22:05:00.000Z"),
        departedAt: null,
        metOnSite: "OWNER",
        frontPhotoId: "photo-1",
        equipmentOutcome: "SOME_REMOVED",
        equipmentNote: "one dehumidifier removed",
      },
    });
  });

  it("leaves out fields the body does not name", () => {
    expect(parseVisitPatch({ metOnSite: "NO_ONE" }, now)).toEqual({ ok: true, data: { metOnSite: "NO_ONE" } });
  });

  it.each([
    ["a non-object body", null],
    ["an array body", []],
    ["an unknown field", { visitNumber: 3 }],
    ["a submittedAt field", { submittedAt: "2026-11-21T22:05:00Z" }],
    ["a date that is not ISO", { arrivedAt: "yesterday" }],
    ["a number for a date", { arrivedAt: 1763762700000 }],
    ["an arrival more than an hour in the future", { arrivedAt: "2026-11-22T02:30:00Z" }],
    ["an unknown presence value", { metOnSite: "NEIGHBOUR" }],
    ["an unknown equipment value", { equipmentOutcome: "SOME" }],
    ["a blank photo id", { frontPhotoId: "  " }],
    ["a note over the limit", { equipmentNote: "x".repeat(EQUIPMENT_NOTE_MAX + 1) }],
    ["departure before arrival in the same body", { arrivedAt: "2026-11-21T22:05:00Z", departedAt: "2026-11-21T21:05:00Z" }],
  ])("refuses %s", (_label, body) => {
    const r = parseVisitPatch(body as unknown, now);
    expect(r.ok).toBe(false);
  });
});

describe("isVisitLockedStatus", () => {
  it.each(["COMPLETED", "REJECTED", "CLOSED", "ARCHIVED"])("%s locks the job's visits", (s) => {
    expect(isVisitLockedStatus(s)).toBe(true);
  });
  it.each(["DRAFT", "SUBMITTED", "ESTIMATED", "IN_BILLING"])("%s still takes visits (re-attendance)", (s) => {
    expect(isVisitLockedStatus(s)).toBe(false);
  });
});
