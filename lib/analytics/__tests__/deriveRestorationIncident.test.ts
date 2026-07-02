/**
 * RA-6917 Phase 1 — deriveRestorationIncident contract.
 *
 * The de-identification contract is the load-bearing part: the row written to
 * RestorationIncident must carry NO address/owner/narrative, geography at
 * postcode granularity only, capturedAt truncated to month, and it must be
 * idempotent on the one-way source hash.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { inspectionFindUnique, incidentUpsert } = vi.hoisted(() => ({
  inspectionFindUnique: vi.fn(),
  incidentUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: inspectionFindUnique },
    restorationIncident: { upsert: incidentUpsert },
  },
}));

import { deriveRestorationIncident } from "../deriveRestorationIncident";

const NSW_POSTCODE = "2000"; // Sydney → NSW

beforeEach(() => {
  vi.clearAllMocks();
  incidentUpsert.mockResolvedValue({});
});

describe("deriveRestorationIncident", () => {
  it("writes a de-identified incident with only postcode-level geography", async () => {
    inspectionFindUnique.mockResolvedValue({
      propertyPostcode: NSW_POSTCODE,
      inspectionDate: new Date("2026-03-10T02:00:00Z"),
      completedAt: new Date("2026-03-15T04:00:00Z"),
      waterDamageClassification: {
        waterCategory: "CAT_3",
        damageClass: "CLASS_2",
        lossSourceType: "PLUMBING",
      },
    });

    await deriveRestorationIncident("insp_123");

    expect(incidentUpsert).toHaveBeenCalledTimes(1);
    const arg = incidentUpsert.mock.calls[0][0];
    const written = { ...arg.create, ...arg.update };

    // classification carried through
    expect(written.state).toBe("NSW");
    expect(written.postcode).toBe(NSW_POSTCODE);
    expect(written.waterCategory).toBe("CAT_3");
    expect(written.damageClass).toBe("CLASS_2");
    expect(written.lossSource).toBe("PLUMBING");
    expect(written.hazards).toContain("black_water"); // CAT_3
    expect(written.remediationDays).toBe(5);

    // capturedAt truncated to first of month (UTC)
    expect((written.capturedAt as Date).toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );

    // DE-IDENTIFICATION: no PII fields anywhere in the payload
    const serialised = JSON.stringify({ ...arg.create, ...arg.update, where: arg.where });
    expect(serialised).not.toContain("insp_123"); // raw id never stored
    expect(Object.keys(written)).not.toContain("propertyAddress");
    expect(Object.keys(written)).not.toContain("technicianName");
    expect(Object.keys(written)).not.toContain("inspectionId");
    expect(Object.keys(written)).not.toContain("ownerName");
  });

  it("keys the upsert on a one-way hash of the inspection id (idempotent, not identity)", async () => {
    inspectionFindUnique.mockResolvedValue({
      propertyPostcode: NSW_POSTCODE,
      inspectionDate: new Date("2026-03-10T02:00:00Z"),
      completedAt: new Date("2026-03-12T02:00:00Z"),
      waterDamageClassification: null,
    });

    await deriveRestorationIncident("insp_123");

    const arg = incidentUpsert.mock.calls[0][0];
    // sha256("insp_123") is 64 hex chars and is NOT the raw id
    expect(arg.where.sourceInspectionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(arg.where.sourceInspectionHash).not.toBe("insp_123");
  });

  it("skips silently when the inspection has no postcode", async () => {
    inspectionFindUnique.mockResolvedValue({
      propertyPostcode: null,
      inspectionDate: new Date("2026-03-10T02:00:00Z"),
      completedAt: null,
      waterDamageClassification: null,
    });

    await deriveRestorationIncident("insp_456");

    expect(incidentUpsert).not.toHaveBeenCalled();
  });

  it("handles a missing classification (nulls, no black_water hazard)", async () => {
    inspectionFindUnique.mockResolvedValue({
      propertyPostcode: "3000", // Melbourne → VIC
      inspectionDate: new Date("2026-05-01T00:00:00Z"),
      completedAt: new Date("2026-05-02T00:00:00Z"),
      waterDamageClassification: null,
    });

    await deriveRestorationIncident("insp_789");

    const arg = incidentUpsert.mock.calls[0][0];
    const written = { ...arg.create, ...arg.update };
    expect(written.state).toBe("VIC");
    expect(written.waterCategory).toBeNull();
    expect(written.hazards).toEqual([]);
    expect(written.outcome).toBe("completed");
  });
});
