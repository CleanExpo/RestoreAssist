import { describe, expect, it, vi } from "vitest";

// The route module pulls in next-auth/prisma/idempotency at import time.
// Stub them so we can import and unit-test the pure payload builder
// (buildNirReportOutput) without a live session or database.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { inspection: { findUnique: vi.fn() } } }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionTenancy: vi.fn() }));

import { buildNirReportOutput, resolvePhotoGeotag } from "../guidewire/route";

// Minimal inspection shape matching fetchInspectionForGuidewire's projection.
function makeInspection(overrides: Record<string, unknown> = {}) {
  return {
    id: "insp_1",
    status: "COMPLETED",
    propertyPostcode: "2150",
    propertyAddress: "123 Smith St, Parramatta NSW 2150",
    inspectionDate: new Date("2026-01-01T00:00:00.000Z"),
    submittedAt: new Date("2026-01-02T00:00:00.000Z"),
    classifications: [],
    scopeItems: [],
    costEstimates: [],
    affectedAreas: [],
    moistureReadings: [],
    environmentalData: [],
    photos: [],
    ...overrides,
  } as unknown as Parameters<typeof buildNirReportOutput>[0];
}

describe("Guidewire photo manifest", () => {
  it("exports real GPS coordinates and category from damageCategory", () => {
    const inspection = makeInspection({
      photos: [
        {
          id: "photo_1",
          timestamp: new Date("2026-01-01T10:30:00.000Z"),
          gpsLatitude: -33.815,
          gpsLongitude: 151.001,
          damageCategory: "CAT_2",
        },
      ],
    });

    const out = buildNirReportOutput(inspection, "Tech Name", "user_1");
    const photo = out.photoManifest.photos[0];

    expect(out.photoManifest.totalPhotos).toBe(1);
    // Bug 1 fix: real GPS flows through (was hardcoded 0,0).
    expect(photo.latitude).toBe(-33.815);
    expect(photo.longitude).toBe(151.001);
    // Bug 2 fix: category is derived from the real damageCategory field
    // (was reading a non-existent `.category` → always undefined).
    // damageCategory holds IICRC water-category codes (CAT_1..CAT_3), which
    // are not Guidewire photo-type values, so mapPhotoCategory maps them to
    // the "damage" default — but the read is now live, not dead.
    expect(photo.category).toBe("damage");
    expect(photo.photoId).toBe("photo_1");
    expect(photo.sequenceNumber).toBe(1);
    expect(photo.capturedAt).toBe("2026-01-01T10:30:00.000Z");
    // Citation consistency: the insurer payload cites the S500:2021 edition, not
    // the legacy year-less "IICRC S500 §12.2" form (CLAUDE.md rule #12, RA-6793).
    expect(photo.standardRef).toBe("IICRC S500:2021 §12.2");
  });

  it("falls back to 0 only when GPS columns are genuinely null", () => {
    const inspection = makeInspection({
      photos: [
        {
          id: "photo_2",
          timestamp: new Date("2026-01-01T11:00:00.000Z"),
          gpsLatitude: null,
          gpsLongitude: null,
          damageCategory: null,
        },
      ],
    });

    const photo = buildNirReportOutput(inspection, "Tech", "user_1")
      .photoManifest.photos[0];

    // Absence is published as absence. It used to serialise as 0,0 — a real
    // position off West Africa, indistinguishable to an insurer from a photo
    // genuinely geotagged there.
    expect(photo.latitude).toBeNull();
    expect(photo.longitude).toBeNull();
    expect(photo.category).toBe("damage");
  });

  it("never publishes a half coordinate", () => {
    // gpsLatitude/gpsLongitude are independently nullable columns and the
    // upload route writes them independently, so one-sided rows are reachable.
    const inspection = makeInspection({
      photos: [
        {
          id: "photo_3",
          timestamp: new Date("2026-01-01T12:00:00.000Z"),
          gpsLatitude: -33.815,
          gpsLongitude: null,
          damageCategory: null,
        },
      ],
    });

    const photo = buildNirReportOutput(inspection, "Tech", "user_1")
      .photoManifest.photos[0];

    expect(photo.latitude).toBeNull();
    expect(photo.longitude).toBeNull();
  });
});

describe("resolvePhotoGeotag", () => {
  it("passes through a valid Australian coordinate pair", () => {
    expect(resolvePhotoGeotag(-33.815, 151.001)).toEqual({
      latitude: -33.815,
      longitude: 151.001,
    });
  });

  it("preserves a genuine zero coordinate when the pair is complete", () => {
    // 0,0 is only ever fabricated when it stands in for null — an explicitly
    // supplied pair is data, and the resolver must not second-guess it.
    expect(resolvePhotoGeotag(0, 0)).toEqual({ latitude: 0, longitude: 0 });
  });

  it.each([
    ["both null", null, null],
    ["missing longitude", -33.815, null],
    ["missing latitude", null, 151.001],
    ["undefined pair", undefined, undefined],
    ["latitude out of range", 91, 151.001],
    ["longitude out of range", -33.815, 181],
    ["non-finite latitude", Number.NaN, 151.001],
    ["infinite longitude", -33.815, Number.POSITIVE_INFINITY],
  ])("nulls the pair when %s", (_label, lat, lng) => {
    expect(resolvePhotoGeotag(lat, lng)).toEqual({
      latitude: null,
      longitude: null,
    });
  });
});
