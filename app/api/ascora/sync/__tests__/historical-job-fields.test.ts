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
import {
  stripNullBytes,
  stripUnpairedSurrogates,
  sanitizeForPostgresText,
} from "@/lib/sanitize";

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

describe("NUL-byte stripping (RA-7026 08P01 prod-crash regression)", () => {
  // A lone U+0000 in an Ascora free-text narrative made the historicalJob.upsert
  // throw PostgresError 08P01 "insufficient data left in message", which aborted
  // the whole sync and left AscoraIntegration.lastSyncAt NULL for 6 days.
  const NUL = String.fromCharCode(0);

  it("stripNullBytes removes U+0000 but preserves narrative punctuation verbatim", () => {
    expect(stripNullBytes(`RH ${NUL}< 40% at ${NUL}24h`)).toBe("RH < 40% at 24h");
  });

  it("does NOT entity-encode angle brackets (unlike sanitizeString) — narrative stays readable", () => {
    expect(stripNullBytes(`Tramex 22 ${NUL}> 16 wme`)).toBe("Tramex 22 > 16 wme");
  });

  it("strips NUL from scopeOfWorks so the historicalJob.upsert can't hit 08P01", () => {
    const job = makeJob({
      jobDescription: `Extract ${NUL}+ dry`,
      workUndertaken: `Set 4 AFDs${NUL}, 2 DHs`,
    });

    const scope = buildHistoricalJobRefreshableFields(job).scopeOfWorks ?? "";
    expect(scope).not.toContain(NUL);
    expect(scope).toContain("Extract + dry");
    expect(scope).toContain("Set 4 AFDs, 2 DHs");
  });

  it("strips NUL from claimNumber", () => {
    const job = makeJob({ clientOrderNumber: `PO-${NUL}12345` });

    expect(buildHistoricalJobRefreshableFields(job).claimNumber).toBe("PO-12345");
  });
});

describe("unpaired-surrogate stripping (RA-7026 08P01 residual — ~215 skipped jobs)", () => {
  // After the NUL-only fix, 215 historical jobs still hit Postgres 08P01. The
  // remaining cause in Ascora free-text is an unpaired UTF-16 surrogate — invalid
  // UTF-8 Postgres rejects the same way. sanitizeForPostgresText covers both.
  const NUL = String.fromCharCode(0);
  const HIGH = "\uD83D"; // lone high surrogate (half of an emoji)
  const LOW = "\uDE00"; // lone low surrogate
  const EMOJI = String.fromCodePoint(0x1f600); // valid surrogate PAIR (grinning-face emoji, U+1F600)

  it("removes a lone high surrogate but keeps surrounding text", () => {
    expect(stripUnpairedSurrogates(`site ${HIGH}notes`)).toBe("site notes");
  });

  it("removes a lone low surrogate", () => {
    expect(stripUnpairedSurrogates(`a${LOW}b`)).toBe("ab");
  });

  it("preserves a valid surrogate pair (emoji)", () => {
    expect(stripUnpairedSurrogates(`done ${EMOJI}`)).toBe(`done ${EMOJI}`);
  });

  it("sanitizeForPostgresText strips BOTH NUL and unpaired surrogates, keeps emoji", () => {
    expect(sanitizeForPostgresText(`x${NUL}y${HIGH}z`)).toBe("xyz");
    expect(sanitizeForPostgresText(`keep ${EMOJI}`)).toBe(`keep ${EMOJI}`);
  });

  it("scopeOfWorks with a lone surrogate no longer trips 08P01", () => {
    const job = makeJob({
      jobDescription: `Extract${HIGH} + dry`,
      workUndertaken: `Set AFDs${LOW}`,
    });
    const scope = buildHistoricalJobRefreshableFields(job).scopeOfWorks ?? "";
    expect(scope).not.toMatch(/[\uD800-\uDFFF]/);
    expect(scope).toContain("Extract + dry");
  });
});
