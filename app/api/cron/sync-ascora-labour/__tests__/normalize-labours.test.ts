import { describe, it, expect } from "vitest";
import {
  normalizeJobLabours,
  findLabourRows,
  describeShape,
} from "../route";

/**
 * RA-7026 regression: the importer read `data.jobLabours`, a key Ascora never
 * returns, so 4,000 jobs produced 0 labour lines (fetchErrors:0, labourLines:0).
 * These lock in that we extract rows from every shape Ascora actually uses and
 * map the rate/hours fields tolerantly.
 */
describe("normalizeJobLabours", () => {
  it("extracts rows from the standard { success, results } envelope (as /Jobs/Jobs uses)", () => {
    const out = normalizeJobLabours({
      success: true,
      totalPages: 1,
      results: [
        { roleName: "Senior Technician", numberOfHours: 8, hourlyRateExTax: 85, totalAmountExTax: 680 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      roleName: "Senior Technician",
      numberOfHours: 8,
      hourlyRateExTax: 85,
      totalAmountExTax: 680,
    });
  });

  it("extracts rows from a bare array", () => {
    const out = normalizeJobLabours([
      { roleName: "Labourer", numberOfHours: 4, hourlyRateExTax: 70 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hourlyRateExTax).toBe(70);
  });

  it("still supports the original jobLabours key", () => {
    const out = normalizeJobLabours({ jobLabours: [{ roleName: "Tech", numberOfHours: 2, hourlyRateExTax: 90 }] });
    expect(out).toHaveLength(1);
  });

  it("maps alternative field names (rate/hours/amount)", () => {
    const out = normalizeJobLabours({
      results: [{ role: "Tech", hours: 5, rate: 95, amount: 475, chargeable: true, date: "2024-01-02" }],
    });
    expect(out[0]).toMatchObject({
      roleName: "Tech",
      numberOfHours: 5,
      hourlyRateExTax: 95,
      totalAmountExTax: 475,
      isChargeable: true,
      startDate: "2024-01-02",
    });
  });

  it("coerces numeric strings (Ascora sometimes returns rates as strings)", () => {
    const out = normalizeJobLabours({ results: [{ roleName: "Tech", numberOfHours: "6", hourlyRateExTax: "88.50" }] });
    expect(out[0].numberOfHours).toBe(6);
    expect(out[0].hourlyRateExTax).toBe(88.5);
  });

  it("returns [] for empty / unrecognised shapes without throwing", () => {
    expect(normalizeJobLabours(null)).toEqual([]);
    expect(normalizeJobLabours({})).toEqual([]);
    expect(normalizeJobLabours({ nope: 1 })).toEqual([]);
    expect(normalizeJobLabours("oops")).toEqual([]);
  });

  it("the extracted rows survive the route's billable filter (rate>0 && hours>0)", () => {
    const rows = normalizeJobLabours({
      results: [
        { roleName: "Tech", numberOfHours: 8, hourlyRateExTax: 85 },
        { roleName: "Zero", numberOfHours: 0, hourlyRateExTax: 85 },
        { roleName: "Free", numberOfHours: 8, hourlyRateExTax: 0 },
      ],
    });
    const billable = rows.filter(
      (l) => (l.hourlyRateExTax ?? 0) > 0 && (l.numberOfHours ?? 0) > 0,
    );
    expect(billable).toHaveLength(1);
    expect(billable[0].roleName).toBe("Tech");
  });
});

/**
 * Shape-agnostic fallback (RA-7026). Prod emptyShapes captured the JobLabour
 * envelope as `{ success, jobLabours }` yet parsed 0 rows — i.e. jobLabours is
 * present but not a top-level array. These lock in that nested / single-object
 * labour still extracts, while unrelated arrays are never mistaken for labour.
 */
describe("findLabourRows (nested / single-object labour)", () => {
  it("extracts labour nested one level below the container", () => {
    const out = normalizeJobLabours({
      success: true,
      jobLabours: {
        jobLabour: [
          { roleName: "Senior Tech", numberOfHours: 8, hourlyRateExTax: 85 },
        ],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ roleName: "Senior Tech", numberOfHours: 8, hourlyRateExTax: 85 });
  });

  it("wraps a single labour object returned without an array", () => {
    const out = normalizeJobLabours({
      success: true,
      jobLabours: { roleName: "Tech", numberOfHours: 4, hourlyRateExTax: 90 },
    });
    expect(out).toHaveLength(1);
    expect(out[0].hourlyRateExTax).toBe(90);
  });

  it("ignores unrelated arrays (jobs/customers) that carry no labour fields", () => {
    expect(
      findLabourRows({ results: [{ jobId: "J1", customerName: "Acme" }] }),
    ).toEqual([]);
  });

  it("returns [] for a genuinely empty labour array (job truly had no labour)", () => {
    expect(normalizeJobLabours({ success: true, jobLabours: [] })).toEqual([]);
  });
});

describe("describeShape (PII-safe diagnostic)", () => {
  it("distinguishes a genuinely empty array from a nested-object parser gap", () => {
    expect(describeShape({ success: true, jobLabours: [] })).toBe(
      "{success:boolean,jobLabours:array[0]}",
    );
    expect(
      describeShape({ success: true, jobLabours: { jobLabour: [{ roleName: "x" }] } }),
    ).toBe("{success:boolean,jobLabours:{jobLabour:array[1]}}");
  });

  it("omits values so no customer data enters logs/metadata", () => {
    const shape = describeShape({ customerName: "Jane Homeowner", hours: 8 });
    expect(shape).not.toContain("Jane");
    expect(shape).toBe("{customerName:string,hours:number}");
  });
});
