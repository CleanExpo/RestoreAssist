import { describe, expect, it } from "vitest";
import { prioritiseHazards, type HazardInput } from "../hazards";

const h = (over: Partial<HazardInput> & { id: string }): HazardInput => ({
  title: `Hazard ${over.id}`,
  action: "Isolate and inspect",
  verification: "unverified",
  ...over,
});

describe("prioritiseHazards ordering", () => {
  it("puts unresolved critical first, then high, medium, low", () => {
    const out = prioritiseHazards([
      h({ id: "low", severity: "low" }),
      h({ id: "crit", severity: "critical" }),
      h({ id: "med", severity: "medium" }),
      h({ id: "high", severity: "high" }),
    ]);
    expect(out.cards.map((c) => c.id)).toEqual(["crit", "high", "med", "low"]);
  });

  it("never ranks an unrated hazard as safe: it sits with high, above medium and low", () => {
    const out = prioritiseHazards([
      h({ id: "low", severity: "low" }),
      h({ id: "unrated" }),
      h({ id: "med", severity: "medium" }),
    ]);
    expect(out.cards.map((c) => c.id)).toEqual(["unrated", "med", "low"]);
    expect(out.cards[0].severityLabel).toBe("Severity not assessed");
  });

  it("within a level puts unverified before verified, and resolved hazards last of all", () => {
    const out = prioritiseHazards([
      h({ id: "resolvedCrit", severity: "critical", verification: "resolved" }),
      h({ id: "verifiedHigh", severity: "high", verification: "verified" }),
      h({ id: "unverifiedHigh", severity: "high", verification: "unverified" }),
      h({ id: "lowOpen", severity: "low" }),
    ]);
    expect(out.cards.map((c) => c.id)).toEqual(["unverifiedHigh", "verifiedHigh", "lowOpen", "resolvedCrit"]);
  });

  it("is stable and independent of input order", () => {
    const list = [h({ id: "b", severity: "high" }), h({ id: "a", severity: "high" })];
    expect(prioritiseHazards(list).cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(prioritiseHazards([...list].reverse()).cards.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("prioritiseHazards critical alert (shown statically and in the PDF)", () => {
  it("raises an alert listing unresolved critical hazards", () => {
    const out = prioritiseHazards([h({ id: "crit", severity: "critical", title: "Live wiring under water" }), h({ id: "x", severity: "low" })]);
    expect(out.criticalAlert).toEqual({ count: 1, titles: ["Live wiring under water"] });
  });

  it("raises no alert when the critical hazard is resolved", () => {
    const out = prioritiseHazards([h({ id: "crit", severity: "critical", verification: "resolved" })]);
    expect(out.criticalAlert).toBeNull();
  });

  it("does not call an empty hazard list safe", () => {
    const out = prioritiseHazards([]);
    expect(out.cards).toEqual([]);
    expect(out.criticalAlert).toBeNull();
    expect(out.noHazardsRecorded).toBe(true);
  });
});

describe("prioritiseHazards floor-plan hotspots", () => {
  it("numbers hotspots in priority order and only for hazards with a recorded position", () => {
    const out = prioritiseHazards([
      h({ id: "low", severity: "low", position: { x: 0.2, y: 0.3 } }),
      h({ id: "crit", severity: "critical", position: { x: 0.8, y: 0.5 } }),
      h({ id: "nopos", severity: "high" }),
    ]);
    expect(out.hotspots.map((s) => [s.id, s.number])).toEqual([
      ["crit", 1],
      ["low", 3],
    ]);
    expect(out.cards.find((c) => c.id === "nopos")!.locationRecorded).toBe(false);
    expect(out.cards.find((c) => c.id === "crit")!.number).toBe(1);
  });

  it("ignores positions outside the plan or not finite instead of drawing them", () => {
    const out = prioritiseHazards([
      h({ id: "a", position: { x: 1.4, y: 0.5 } }),
      h({ id: "b", position: { x: Number.NaN, y: 0.5 } }),
    ]);
    expect(out.hotspots).toEqual([]);
    expect(out.cards.every((c) => !c.locationRecorded)).toBe(true);
  });
});
