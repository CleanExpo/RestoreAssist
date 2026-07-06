/**
 * RA-7005 Wave 1 — guardrail tests. These lock the two non-negotiable safety
 * invariants: no air movers while mould is active, and equipment never exceeds
 * the derated power budget.
 */
import { describe, it, expect } from "vitest";
import {
  planDrying,
  computePowerBudget,
  packOntoCircuits,
  idealAirMovers,
  ampsFor,
  type EquipmentLine,
} from "../equipment-planner";

const power2x20 = { circuits: 2, circuitRatingA: 20 }; // default 80% derate

describe("computePowerBudget", () => {
  it("applies the 80% AS/NZS 3000 derate per circuit", () => {
    const b = computePowerBudget(power2x20);
    expect(b.perCircuitUsableA).toBe(16); // 20 × 0.8
    expect(b.siteUsableA).toBe(32); // 16 × 2
    expect(b.deratePct).toBe(0.8);
  });

  it("honours an explicit derate and a 3-circuit site", () => {
    const b = computePowerBudget({ circuits: 3, circuitRatingA: 20, deratePct: 0.8 });
    expect(b.siteUsableA).toBe(48);
  });
});

describe("SAFETY INVARIANT 1 — no air movers while mould is active", () => {
  const plan = planDrying(
    { affectedAreaM2: 58, mouldActive: true },
    power2x20,
  );

  it("Phase 1 forbids air movers and contains none", () => {
    const p1 = plan.phases.find((p) => p.phase === 1)!;
    expect(p1.airMoversAllowed).toBe(false);
    expect(p1.lines.some((l) => l.kind === "air_mover")).toBe(false);
    // Phase 1 must still dry — dehumidifiers + AFD present.
    expect(p1.lines.some((l) => l.kind === "dehumidifier")).toBe(true);
    expect(p1.lines.some((l) => l.kind === "afd")).toBe(true);
  });

  it("Phase 2 (post-clearance) is where air movers appear", () => {
    const p2 = plan.phases.find((p) => p.phase === 2)!;
    expect(p2.airMoversAllowed).toBe(true);
    expect(p2.lines.some((l) => l.kind === "air_mover")).toBe(true);
  });
});

describe("SAFETY INVARIANT 2 — never exceed the derated power budget", () => {
  it("no phase's per-circuit load exceeds the derated limit", () => {
    const plan = planDrying(
      { affectedAreaM2: 120, mouldActive: true, porosity: "high", furniture: "heavy" },
      power2x20,
    );
    for (const phase of plan.phases) {
      for (const circuitA of phase.packing.perCircuitA) {
        expect(circuitA).toBeLessThanOrEqual(plan.budget.perCircuitUsableA + 1e-6);
      }
      expect(phase.packing.fits).toBe(true);
    }
  });

  it("caps air movers and flags sectional mitigation when the supply is short", () => {
    // Single 20A circuit (16A usable). At 60 m² the DH backbone fits (3×3.4=10.2A)
    // but the ideal air-mover complement can't — they must be capped + flagged.
    const site = { affectedAreaM2: 60, mouldActive: false };
    const plan = planDrying(site, { circuits: 1, circuitRatingA: 20 });
    expect(plan.powerConstrained).toBe(true);
    expect(plan.advisories.join(" ")).toMatch(/sectional mitigation|alternative power/i);
    const p1 = plan.phases[0];
    const airMovers = p1.lines.find((l) => l.kind === "air_mover")?.quantity ?? 0;
    expect(airMovers).toBeLessThan(idealAirMovers(site));
    expect(p1.packing.fits).toBe(true); // the (capped) plan actually fits the supply
  });

  it("flags alternative power when even the dehumidifier backbone can't fit", () => {
    // 120 m² needs 6 LGR (20.4A) — exceeds a single 16A circuit before any air movers.
    const plan = planDrying(
      { affectedAreaM2: 120, mouldActive: false },
      { circuits: 1, circuitRatingA: 20 },
    );
    expect(plan.powerConstrained).toBe(true);
    expect(plan.advisories.join(" ")).toMatch(/alternative power|sectional/i);
  });
});

describe("packOntoCircuits", () => {
  it("distributes load and reports a fit", () => {
    const budget = computePowerBudget(power2x20); // 2×16A
    const lines: EquipmentLine[] = [
      { kind: "dehumidifier", groupId: "lgr-35", quantity: 3, ampsEach: 3.4, ampsTotal: 10.2 },
      { kind: "afd", groupId: "afd-500", quantity: 2, ampsEach: 1.5, ampsTotal: 3.0 },
    ];
    const packing = packOntoCircuits(lines, budget);
    expect(packing.fits).toBe(true);
    expect(packing.perCircuitA.every((a) => a <= 16 + 1e-6)).toBe(true);
    expect(packing.totalA).toBeCloseTo(13.2, 1);
  });

  it("reports no-fit when a single unit exceeds every circuit", () => {
    const budget = computePowerBudget({ circuits: 2, circuitRatingA: 5 }); // 4A/circuit
    const lines: EquipmentLine[] = [
      { kind: "dehumidifier", groupId: "lgr-85", quantity: 1, ampsEach: 5.1, ampsTotal: 5.1 },
    ];
    expect(packOntoCircuits(lines, budget).fits).toBe(false);
  });
});

describe("load factors + amp sourcing", () => {
  it("high porosity + heavy furniture raise the air-mover count", () => {
    const base = idealAirMovers({ affectedAreaM2: 50, mouldActive: false, porosity: "low", furniture: "light" });
    const loaded = idealAirMovers({ affectedAreaM2: 50, mouldActive: false, porosity: "high", furniture: "heavy" });
    expect(loaded).toBeGreaterThan(base);
  });

  it("reads real amp draws from the equipment matrix", () => {
    expect(ampsFor("dehumidifier", "lgr-35")).toBe(3.4);
    expect(ampsFor("afd", "afd-500")).toBe(1.5);
  });
});
