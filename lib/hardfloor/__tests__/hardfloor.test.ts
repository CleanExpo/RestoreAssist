import { describe, expect, it } from "vitest";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";
import {
  buildQuoteOptions,
  canSeal,
  checkSolutionPh,
  completeStep,
  estimateJob,
  evaluateAsbestosGate,
  guidedTestsFor,
  isActionAllowed,
  nextStep,
  planMaintenance,
  startMaintenanceVisit,
  WALKTHROUGH_STEPS,
  type HardFloorClientRecord,
} from "@/lib/hardfloor";

describe("asbestos gate", () => {
  const base = { confirmedAsbestosFree: false, damaged: false, acmSuspected: false } as const;
  const auYear = ASBESTOS_PRESUMPTION_YEAR.AU;
  const nzYear = ASBESTOS_PRESUMPTION_YEAR.NZ;

  it("presumes asbestos on AU VCT laid inside the era and locks out dry and abrasive methods", () => {
    const gate = evaluateAsbestosGate({ ...base, floorType: "vct", yearLaid: auYear - 1, jurisdiction: "AU" });
    expect(gate.result).toBe("presume");
    expect(isActionAllowed(gate, "dry_strip")).toBe(false);
    expect(isActionAllowed(gate, "black_pad")).toBe(false);
    expect(isActionAllowed(gate, "brown_pad")).toBe(false);
  });

  it("does not apply the old flat Queensland register year as a national threshold", () => {
    // A mid-1990s floor in Australia is still inside the presumption era.
    const gate = evaluateAsbestosGate({ ...base, floorType: "vct", yearLaid: 1995, jurisdiction: "AU" }); // regulatory-year-ignore
    expect(gate.result).toBe("presume");
  });

  it("uses the NZ year for NZ jobs", () => {
    expect(evaluateAsbestosGate({ ...base, floorType: "vct", yearLaid: nzYear - 1, jurisdiction: "NZ" }).result).toBe("presume");
    expect(evaluateAsbestosGate({ ...base, floorType: "vct", yearLaid: nzYear, jurisdiction: "NZ" }).result).toBe("clear");
  });

  it("presumes when the register or a visual ID suspects ACM, even with an unknown year", () => {
    expect(evaluateAsbestosGate({ ...base, floorType: "linoleum", yearLaid: null, jurisdiction: "AU" }).result).toBe("clear");
    expect(evaluateAsbestosGate({ ...base, acmSuspected: true, floorType: "linoleum", yearLaid: null, jurisdiction: "AU" }).result).toBe("presume");
  });

  it("stops work when presumed asbestos is damaged", () => {
    const gate = evaluateAsbestosGate({ ...base, damaged: true, floorType: "vct", yearLaid: auYear - 20, jurisdiction: "AU" });
    expect(gate.result).toBe("stop");
    expect(isActionAllowed(gate, "dry_strip")).toBe(false);
  });

  it("clears post-era floors, confirmed-free floors and non-risk materials", () => {
    expect(evaluateAsbestosGate({ ...base, floorType: "vct", yearLaid: auYear, jurisdiction: "AU" }).result).toBe("clear");
    expect(evaluateAsbestosGate({ ...base, confirmedAsbestosFree: true, floorType: "vct", yearLaid: auYear - 20, jurisdiction: "AU" }).result).toBe("clear");
    expect(evaluateAsbestosGate({ ...base, damaged: true, floorType: "porcelain", yearLaid: auYear - 30, jurisdiction: "AU" }).result).toBe("clear");
  });
});

describe("seal gate", () => {
  it("blocks sealing with no reading", () => {
    expect(canSeal([]).ok).toBe(false);
  });

  it("blocks sealing while the floor still reads alkaline", () => {
    expect(canSeal([{ ph: 9.5, takenAt: "2026-11-09T01:00:00Z" }]).ok).toBe(false);
  });

  it("allows sealing once the latest reading is 7–8, regardless of input order", () => {
    const result = canSeal([
      { ph: 7.4, takenAt: "2026-11-09T02:00:00Z" },
      { ph: 10.2, takenAt: "2026-11-09T01:00:00Z" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("uses the latest reading, not the best one", () => {
    const result = canSeal([
      { ph: 7.2, takenAt: "2026-11-09T01:00:00Z" },
      { ph: 8.6, takenAt: "2026-11-09T02:00:00Z" },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("chemistry check", () => {
  it("rejects a pH 11 stripper on linoleum", () => {
    expect(checkSolutionPh("linoleum", 11, "strip").ok).toBe(false);
  });
  it("accepts a pH 12.5 stripper on VCT", () => {
    expect(checkSolutionPh("vct", 12.5, "strip").ok).toBe(true);
  });
  it("rejects acid on calcium stone", () => {
    expect(checkSolutionPh("calcium_stone", 3, "clean").ok).toBe(false);
  });
  it("never strips coated timber", () => {
    expect(checkSolutionPh("timber_coated", 7, "strip").ok).toBe(false);
  });
});

describe("estimate", () => {
  const rateCard = { perM2Cents: { strip_and_seal: 1000, tile_grout_clean: 800 }, edgePerMCents: 200, furnitureMoveCents: 1500 };

  it("applies AU GST through lib/gst-rules", () => {
    const est = estimateJob({
      rooms: [{ name: "Foyer", floorType: "vct", service: "strip_and_seal", areaM2: 50 }],
      rateCard,
      edgeLinearM: 10,
      furnitureMoves: 2,
      country: "AU",
    });
    expect(est.subtotalCents).toBe(50_000 + 2_000 + 3_000);
    expect(est.gstCents).toBe(5_500);
    expect(est.totalCents).toBe(60_500);
  });

  it("applies NZ GST at 15%", () => {
    const est = estimateJob({
      rooms: [{ name: "Kitchen", floorType: "porcelain", service: "tile_grout_clean", areaM2: 10 }],
      rateCard,
      country: "NZ",
    });
    expect(est.gstCents).toBe(1_200);
  });

  it("refuses a service the floor type cannot take", () => {
    expect(() =>
      estimateJob({
        rooms: [{ name: "Lounge", floorType: "timber_coated", service: "strip_and_seal", areaM2: 20 }],
        rateCard,
        country: "AU",
      }),
    ).toThrow(/not a valid service/);
  });

  it("builds three quote options with the plan on the third", () => {
    const est = estimateJob({ rooms: [{ name: "A", floorType: "vct", service: "strip_and_seal", areaM2: 1 }], rateCard, country: "AU" });
    const options = buildQuoteOptions({ clean: est, clean_protect: est, restore_plan: est });
    expect(options.map((o) => o.key)).toEqual(["clean", "clean_protect", "restore_plan"]);
    expect(options.filter((o) => o.includesMaintenancePlan).map((o) => o.key)).toEqual(["restore_plan"]);
  });
});

describe("walkthrough and maintenance loop", () => {
  const allCaptures = Object.fromEntries(
    WALKTHROUGH_STEPS.flatMap((s) => s.requiredCaptures).map((c) => [c, `value:${c}`]),
  );
  const fresh: HardFloorClientRecord = {
    clientId: "c1",
    siteId: "s1",
    traffic: "high",
    visits: [{ visitNumber: 1, startedAt: "2026-11-09T00:00:00Z", completedSteps: [], captures: allCaptures }],
  };

  it("enforces step order", () => {
    expect(() => completeStep(fresh, "test")).toThrow(/Complete "intake"/);
  });

  it("refuses a step with missing captures", () => {
    const missing: HardFloorClientRecord = { ...fresh, visits: [{ ...fresh.visits[0], captures: {} }] };
    expect(() => completeStep(missing, "intake")).toThrow(/Missing captures/);
  });

  it("loops from Maintain back to Inspect and keeps visit history", () => {
    let record = fresh;
    for (const step of WALKTHROUGH_STEPS) record = completeStep(record, step.id);
    expect(nextStep(record)).toBeNull();

    const looped = startMaintenanceVisit(record, "2027-05-09T00:00:00Z");
    expect(looped.visits).toHaveLength(2);
    expect(looped.visits[0].completedSteps).toHaveLength(10);
    expect(looped.visits[0]).toBe(record.visits[0]);
    expect(nextStep(looped)?.id).toBe("inspect");
    expect(looped.visits[1].captures.client).toBe("value:client");
  });

  it("will not start a new visit before Maintain is done", () => {
    expect(() => startMaintenanceVisit(fresh, "2027-05-09T00:00:00Z")).toThrow(/Finish the current visit/);
  });

  it("picks guided tests by floor type", () => {
    const vct = guidedTestsFor("vct").map((t) => t.id);
    expect(vct).toContain("asbestos_gate");
    expect(vct).not.toContain("acid_drop");
    const stone = guidedTestsFor("calcium_stone").map((t) => t.id);
    expect(stone).toContain("acid_drop");
    expect(stone).not.toContain("asbestos_gate");
  });

  it("defaults high-traffic plans to 6 and 12 months and refuses to invent others", () => {
    const plan = planMaintenance({ traffic: "high", completedAt: "2026-11-09T00:00:00.000Z" });
    expect(plan.nextVisitAt).toBe("2027-05-09T00:00:00.000Z");
    expect(plan.restorativeDueAt).toBe("2027-11-09T00:00:00.000Z");
    expect(() => planMaintenance({ traffic: "low", completedAt: "2026-11-09T00:00:00.000Z" })).toThrow(/no default/);
  });
});
