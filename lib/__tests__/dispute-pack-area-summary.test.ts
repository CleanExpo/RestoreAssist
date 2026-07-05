// RA-7001: the dispute-pack legal PDF must print affected areas in m², never sq ft.
import { describe, it, expect } from "vitest";
import { formatAffectedAreaSummary } from "../dispute-pack";

const area = (o: Partial<Parameters<typeof formatAffectedAreaSummary>[0][number]>) => ({
  roomZoneId: "Kitchen",
  affectedAreaSqm: null,
  affectedSquareFootage: 0,
  waterSource: "Clean Water",
  category: null,
  class: null,
  ...o,
});

describe("dispute-pack formatAffectedAreaSummary", () => {
  it("prints the canonical m² value and never 'sq ft'", () => {
    const { total, lines } = formatAffectedAreaSummary([
      area({ roomZoneId: "Kitchen", affectedAreaSqm: 20 }),
    ]);
    expect(total).toBe("20.0 m²");
    expect(lines[0]).toContain("Kitchen: 20.0 m²");
    expect(lines[0]).not.toContain("sq ft");
  });

  it("converts a legacy sq-ft-only row to m²", () => {
    // 200 sq ft × 0.09290304 = 18.58 m²
    const { total, lines } = formatAffectedAreaSummary([
      area({ affectedAreaSqm: null, affectedSquareFootage: 200 }),
    ]);
    expect(total).toBe("18.6 m²");
    expect(lines[0]).toContain("18.6 m²");
  });

  it("sums mixed metric + legacy rows in m²", () => {
    const { total } = formatAffectedAreaSummary([
      area({ affectedAreaSqm: 10 }),
      area({ affectedAreaSqm: null, affectedSquareFootage: 107.64 }), // ≈ 10 m²
    ]);
    expect(total).toBe("20.0 m²");
  });

  it("includes category and class labels alongside m²", () => {
    const { lines } = formatAffectedAreaSummary([
      area({ affectedAreaSqm: 15, category: "3", class: "4" }),
    ]);
    expect(lines[0]).toBe(
      "- Kitchen: 15.0 m² | Source: Clean Water | Cat 3 / Class 4",
    );
  });
});
