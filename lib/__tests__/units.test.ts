// RA-7001: unit-conversion helpers + backfill math for the m² migration.
import { describe, it, expect } from "vitest";
import {
  SQFT_TO_SQM,
  sqftToSqm,
  sqmToSqft,
  resolveAreaSqm,
  deriveAreaColumns,
} from "../units";

describe("units — sq ft ⇄ m²", () => {
  it("uses the exact factor 1 sq ft = 0.09290304 m²", () => {
    expect(SQFT_TO_SQM).toBe(0.09290304);
  });

  it("sqftToSqm converts", () => {
    expect(sqftToSqm(107.64)).toBeCloseTo(10.0, 2);
    expect(sqftToSqm(0)).toBe(0);
  });

  it("sqmToSqft is the inverse of sqftToSqm", () => {
    expect(sqmToSqft(10)).toBeCloseTo(107.639, 2);
    expect(sqmToSqft(sqftToSqm(215.3))).toBeCloseTo(215.3, 6);
  });
});

describe("resolveAreaSqm", () => {
  it("prefers the canonical affectedAreaSqm column", () => {
    expect(
      resolveAreaSqm({ affectedAreaSqm: 20, affectedSquareFootage: 999 }),
    ).toBe(20);
  });

  it("falls back to converting the legacy sq-ft value when m² is null", () => {
    // 120 sq ft × 0.09290304 = 11.148… m²
    expect(
      resolveAreaSqm({ affectedAreaSqm: null, affectedSquareFootage: 120 }),
    ).toBeCloseTo(11.148, 3);
  });

  it("treats a missing m² column as a fallback too", () => {
    expect(resolveAreaSqm({ affectedSquareFootage: 200 })).toBeCloseTo(
      18.58,
      2,
    );
  });

  it("returns 0 when neither value is present", () => {
    expect(resolveAreaSqm({})).toBe(0);
    expect(
      resolveAreaSqm({ affectedAreaSqm: null, affectedSquareFootage: null }),
    ).toBe(0);
  });
});

describe("deriveAreaColumns — dual-write from the affected-areas write path (form stores m²)", () => {
  it("stores the entered m² and derives the deprecated sq-ft column", () => {
    const cols = deriveAreaColumns({ affectedAreaSqm: 20 });
    expect(cols).not.toBeNull();
    expect(cols!.affectedAreaSqm).toBe(20);
    expect(cols!.affectedSquareFootage).toBeCloseTo(215.28, 2);
  });

  it("accepts a legacy sq-ft input and derives the canonical m²", () => {
    const cols = deriveAreaColumns({ affectedSquareFootage: 200 });
    expect(cols!.affectedAreaSqm).toBeCloseTo(18.58, 2);
    expect(cols!.affectedSquareFootage).toBeCloseTo(200, 6);
  });

  it("prefers affectedAreaSqm when both are supplied", () => {
    const cols = deriveAreaColumns({
      affectedAreaSqm: 12,
      affectedSquareFootage: 999,
    });
    expect(cols!.affectedAreaSqm).toBe(12);
  });

  it("rejects non-positive or non-finite input", () => {
    expect(deriveAreaColumns({ affectedAreaSqm: 0 })).toBeNull();
    expect(deriveAreaColumns({ affectedAreaSqm: -5 })).toBeNull();
    expect(deriveAreaColumns({})).toBeNull();
    expect(deriveAreaColumns({ affectedSquareFootage: "abc" })).toBeNull();
  });
});

describe("migration backfill math (affectedAreaSqm = affectedSquareFootage * 0.09290304)", () => {
  const backfill = (sqft: number) => sqft * SQFT_TO_SQM;

  it("matches the SQL UPDATE expression for representative rows", () => {
    expect(backfill(14)).toBeCloseTo(1.3006, 4);
    expect(backfill(100)).toBeCloseTo(9.290304, 6);
    expect(backfill(107.6)).toBeLessThan(10); // just under the mould threshold
    expect(backfill(108)).toBeGreaterThan(10); // just over
  });

  it("round-trips a metric-native value written by the dual-write path", () => {
    // Form stores affectedAreaSqm = 20; the deprecated column is 20 / factor.
    const sqft = sqmToSqft(20);
    expect(backfill(sqft)).toBeCloseTo(20, 9);
  });
});
