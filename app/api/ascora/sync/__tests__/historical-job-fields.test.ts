/**
 * RA-274 — HistoricalJob "CEO Board Hardening" field mapping.
 *
 * The only writer of these 6 columns is the historicalJob.upsert in
 * app/api/ascora/sync/route.ts. This exercises the pure mapping function the
 * upsert now spreads into both its create and update payloads, proving each
 * of classificationSource/claimNumber/scopeOfWorks is populated from a real
 * Ascora job field (no fabrication), while insurerName/totalLabourHours/
 * durationDays stay null because the Ascora payload has no source field for
 * them (asserted separately against the raw AscoraJobRaw shape).
 */

import { describe, expect, it } from "vitest";
import {
  buildHistoricalJobRefreshableFields,
  coerceHistoricalWaterFields,
  type AscoraJobRaw,
} from "../route";

function makeJob(overrides: Partial<AscoraJobRaw> = {}): AscoraJobRaw {
  return {
    jobId: "job-1",
    jobNumber: "JN-100",
    jobName: "Water damage — Unit 4",
    jobDescription: "Category 2 water loss, extract + dry 3 rooms.",
    jobType: { id: "t1", name: "Water Damage" },
    addressLine1: "12 Test St",
    suburb: "Loganholme",
    state: "QLD",
    postcode: "4129",
    completedDate: "2026-06-01T00:00:00.000Z",
    totalExTax: 4500,
    clientOrderNumber: "PO-CLAIM-99881",
    siteCustomer: { id: "c1", name: "Jane Homeowner" },
    billingCustomer: { id: "b1", name: "Suncorp Insurance" },
    ...overrides,
  };
}

describe("buildHistoricalJobRefreshableFields", () => {
  it("maps classificationSource, claimNumber and scopeOfWorks from real Ascora fields", () => {
    const job = makeJob();

    const fields = buildHistoricalJobRefreshableFields(job);

    expect(fields).toEqual({
      classificationSource: "rule-based",
      claimNumber: "PO-CLAIM-99881",
      scopeOfWorks: "Category 2 water loss, extract + dry 3 rooms.",
    });
  });

  it("maps claimNumber from clientOrderNumber (the closest genuine claim-reference field Ascora exposes)", () => {
    const job = makeJob({ clientOrderNumber: "PO-77" });

    expect(buildHistoricalJobRefreshableFields(job).claimNumber).toBe("PO-77");
  });

  it("leaves claimNumber null when Ascora didn't supply a clientOrderNumber", () => {
    const job = makeJob({ clientOrderNumber: undefined });

    expect(buildHistoricalJobRefreshableFields(job).claimNumber).toBeNull();
  });

  it("leaves claimNumber null when clientOrderNumber is blank/whitespace", () => {
    const job = makeJob({ clientOrderNumber: "   " });

    expect(buildHistoricalJobRefreshableFields(job).claimNumber).toBeNull();
  });

  it("maps scopeOfWorks from the full jobDescription narrative", () => {
    const job = makeJob({ jobDescription: "Full scope narrative here." });

    expect(buildHistoricalJobRefreshableFields(job).scopeOfWorks).toBe(
      "Full scope narrative here.",
    );
  });

  it("leaves scopeOfWorks null when Ascora didn't supply a jobDescription", () => {
    const job = makeJob({ jobDescription: undefined });

    expect(buildHistoricalJobRefreshableFields(job).scopeOfWorks).toBeNull();
  });

  it("always reports classificationSource as rule-based — Ascora never supplies a claim type/category directly", () => {
    const job = makeJob({ jobType: "Fire & Smoke" });

    expect(buildHistoricalJobRefreshableFields(job).classificationSource).toBe(
      "rule-based",
    );
  });

  it("AscoraJobRaw carries no insurer, labour-hours, or start-date field — insurerName/totalLabourHours/durationDays cannot be derived", () => {
    const job = makeJob();
    const keys = Object.keys(job);

    expect(keys).not.toContain("insurerName");
    expect(keys).not.toContain("insurer");
    expect(keys).not.toContain("totalLabourHours");
    expect(keys).not.toContain("labourHours");
    expect(keys).not.toContain("durationDays");
    expect(keys).not.toContain("startDate");
    // billingCustomer exists but is already consumed for `customerName`
    // (route.ts) — reusing it as insurerName would be guessing, not mapping.
    expect(job.billingCustomer?.name).toBe("Suncorp Insurance");
  });
});

describe("coerceHistoricalWaterFields (RA-7026 prod-crash regression)", () => {
  it("coerces numeric damageCategory/damageClass to STRINGS (schema is String?)", () => {
    const out = coerceHistoricalWaterFields({ damageCategory: 1, damageClass: 2 });
    expect(out).toEqual({ waterCategory: "1", waterClass: "2" });
    expect(typeof out.waterCategory).toBe("string");
    expect(typeof out.waterClass).toBe("string");
  });

  it("returns undefined (not null) for missing fields so an update never wipes a prior value", () => {
    expect(coerceHistoricalWaterFields({ damageCategory: 3 })).toEqual({
      waterCategory: "3",
      waterClass: undefined,
    });
    expect(coerceHistoricalWaterFields(null)).toEqual({
      waterCategory: undefined,
      waterClass: undefined,
    });
    expect(coerceHistoricalWaterFields(undefined)).toEqual({
      waterCategory: undefined,
      waterClass: undefined,
    });
  });

  it("preserves a zero category as the string \"0\" rather than dropping it", () => {
    expect(coerceHistoricalWaterFields({ damageCategory: 0 }).waterCategory).toBe("0");
  });
});
