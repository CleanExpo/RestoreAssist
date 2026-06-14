import { describe, expect, it } from "vitest";
import {
  buildInspectionNumber,
  extractAuPostcode,
  mapLossTypeToClaimType,
  mapPayloadToInspection,
  type DrNrpgWebhookPayload,
} from "../inbound-mapper";

describe("mapLossTypeToClaimType", () => {
  it("maps known lossType values case-insensitively", () => {
    expect(mapLossTypeToClaimType("water")).toBe("WATER");
    expect(mapLossTypeToClaimType("Water")).toBe("WATER");
    expect(mapLossTypeToClaimType("FIRE")).toBe("FIRE");
    expect(mapLossTypeToClaimType("mould")).toBe("MOULD");
    expect(mapLossTypeToClaimType("mold")).toBe("MOULD"); // US spelling
    expect(mapLossTypeToClaimType("storm")).toBe("STORM");
    expect(mapLossTypeToClaimType("biohazard")).toBe("BIOHAZARD");
  });

  it("returns null for missing or unknown lossType (no silent defaulting)", () => {
    expect(mapLossTypeToClaimType(undefined)).toBeNull();
    expect(mapLossTypeToClaimType(null)).toBeNull();
    expect(mapLossTypeToClaimType("")).toBeNull();
    expect(mapLossTypeToClaimType("flood")).toBeNull(); // not in map
    expect(mapLossTypeToClaimType("vandalism")).toBeNull();
  });
});

describe("extractAuPostcode", () => {
  it("extracts trailing 4-digit postcode", () => {
    expect(extractAuPostcode("12 Smith St, Sydney NSW 2000")).toBe("2000");
    expect(extractAuPostcode("Brisbane QLD 4000")).toBe("4000");
  });

  it("returns null when no trailing 4-digit postcode is present", () => {
    expect(extractAuPostcode("12 Smith St, Sydney")).toBeNull();
    expect(extractAuPostcode("")).toBeNull();
  });
});

describe("buildInspectionNumber", () => {
  it("produces NIR-YYYY-MM-XXXXYYYY format", () => {
    const out = buildInspectionNumber({
      timestamp: new Date("2026-05-14T10:00:00Z"),
      jobId: "dr-nrpg-abc-def-1234",
      randomHex: "a1b2",
    });
    expect(out).toBe("NIR-2026-05-A1B21234");
  });

  it("pads short jobIds to 4-char suffix", () => {
    const out = buildInspectionNumber({
      timestamp: new Date("2026-01-01T00:00:00Z"),
      jobId: "x",
      randomHex: "ffff",
    });
    expect(out).toBe("NIR-2026-01-FFFF000X");
  });
});

describe("mapPayloadToInspection", () => {
  const basePayload: DrNrpgWebhookPayload = {
    event: "job.dispatched",
    jobId: "drnrpg-job-9999",
    claimNumber: "CLM-2026-0001",
    insurer: "Suncorp",
    policyHolder: "Jane Citizen",
    propertyAddress: "42 Wallaby Way, Sydney NSW 2000",
    lossType: "water",
    timestamp: "2026-05-14T08:30:00Z",
  };

  it("maps a full payload to an Inspection input", () => {
    const out = mapPayloadToInspection({
      payload: basePayload,
      randomHex: "abcd",
    });
    expect(out).not.toBeNull();
    expect(out!.propertyAddress).toBe("42 Wallaby Way, Sydney NSW 2000");
    expect(out!.propertyPostcode).toBe("2000");
    expect(out!.needsPostcodeReview).toBe(false);
    expect(out!.status).toBe("DRAFT");
    expect(out!.source).toBe("DR_NRPG");
    expect(out!.claimType).toBe("WATER");
    expect(out!.inspectionNumber).toBe("NIR-2026-05-ABCD9999");
    expect(out!.inspectionDate.toISOString()).toBe("2026-05-14T08:30:00.000Z");
  });

  it("returns null when propertyAddress is missing", () => {
    const out = mapPayloadToInspection({
      payload: { ...basePayload, propertyAddress: undefined },
      randomHex: "abcd",
    });
    expect(out).toBeNull();
  });

  it("falls back to postcode '0000' AND flags needsPostcodeReview when address lacks a postcode", () => {
    const out = mapPayloadToInspection({
      payload: {
        ...basePayload,
        propertyAddress: "Somewhere remote, no postcode",
      },
      randomHex: "abcd",
    });
    // Sentinel postcode is still set so the job is not dropped...
    expect(out!.propertyPostcode).toBe("0000");
    // ...but the review flag warns downstream the jurisdiction is unverified.
    expect(out!.needsPostcodeReview).toBe(true);
    // Rest of the payload still maps cleanly.
    expect(out!.propertyAddress).toBe("Somewhere remote, no postcode");
    expect(out!.claimType).toBe("WATER");
    expect(out!.source).toBe("DR_NRPG");
  });

  it("does not flag needsPostcodeReview when a real postcode is present", () => {
    const out = mapPayloadToInspection({
      payload: basePayload,
      randomHex: "abcd",
    });
    expect(out!.needsPostcodeReview).toBe(false);
  });

  it("leaves claimType null when lossType is unknown — no silent WATER default", () => {
    const out = mapPayloadToInspection({
      payload: { ...basePayload, lossType: "flood" },
      randomHex: "abcd",
    });
    expect(out!.claimType).toBeNull();
  });
});
