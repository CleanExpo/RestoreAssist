import { describe, expect, it } from "vitest";
import {
  mockFootprint,
  mockGeocode,
  normaliseAddressKey,
} from "../geoscape-client";

describe("geoscape-client — mockGeocode", () => {
  it("is deterministic — same address yields same lat/lng", () => {
    const a = mockGeocode("123 George St, Sydney");
    const b = mockGeocode("123 George St, Sydney");
    expect(a).toEqual(b);
  });

  it("yields distinct hits for distinct addresses", () => {
    const a = mockGeocode("1 Smith St");
    const b = mockGeocode("2 Smith St");
    expect(a.gnafPid).not.toBe(b.gnafPid);
  });

  it("returns confidence='low' so callers know it's a mock", () => {
    expect(mockGeocode("anywhere").confidence).toBe("low");
  });
});

describe("geoscape-client — mockFootprint", () => {
  it("returns a closed-ring polygon with 5 coordinates", () => {
    const fp = mockFootprint("MOCK_GNAF_1");
    expect(fp.geomGeoJson.type).toBe("Polygon");
    expect(fp.geomGeoJson.coordinates[0]).toHaveLength(5);
    const ring = fp.geomGeoJson.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("source is 'test_fixture' so the API can flag the row as mock data", () => {
    expect(mockFootprint("MOCK_GNAF_1").source).toBe("test_fixture");
  });
});

describe("geoscape-client — normaliseAddressKey", () => {
  it("uppercases and collapses whitespace", () => {
    expect(normaliseAddressKey("  123 george  st  ")).toBe("123 GEORGE ST");
  });

  it("appends postcode with a delimiter", () => {
    expect(normaliseAddressKey("123 George St", "2000")).toBe(
      "123 GEORGE ST|2000",
    );
  });
});
