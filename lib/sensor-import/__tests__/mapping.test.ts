import { describe, expect, it } from "vitest";

import { isValidatedMapping, validateMapping } from "../mapping";

const HEADER = ["Time", "Room", "Material", "MC", "Temp", "RH", "Dew", "Sensor"];

const moisture = () => ({
  kind: "moisture",
  timestamp: { column: "Time", format: "yyyy-MM-dd HH:mm[:ss]", timeZone: "Australia/Sydney" },
  device: { vendor: "UbiBot", model: "WS1", idColumn: "Sensor" },
  location: { column: "Room" },
  moisture: { valueColumn: "MC", unit: "PERCENT_MC", surfaceType: { column: "Material" } },
});

const ambient = () => ({
  kind: "ambient",
  timestamp: { column: "Time", format: "iso" },
  device: { vendor: "UbiBot" },
  location: { value: "Lounge" },
  ambient: { temperatureColumn: "Temp", temperatureUnit: "C", humidityColumn: "RH", dewPointColumn: "Dew" },
});

function issues(input: unknown, header: string[] = HEADER) {
  const result = validateMapping(input, header);
  if (result.ok) throw new Error("expected the mapping to be refused");
  return result.issues;
}

describe("AC-3 mapping", () => {
  it("accepts a moisture mapping and resolves columns to header positions", () => {
    const result = validateMapping(moisture(), HEADER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping.timestamp.index).toBe(0);
    expect(result.mapping.location).toEqual({ index: 1 });
    expect(result.mapping.moisture).toEqual({
      valueIndex: 3,
      unit: "PERCENT_MC",
      surfaceType: { index: 2 },
      depth: "Surface",
    });
    expect(result.mapping.device.idIndex).toBe(7);
    expect(isValidatedMapping(result.mapping)).toBe(true);
  });

  it("accepts an ambient mapping with a constant location", () => {
    const result = validateMapping(ambient(), HEADER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping.location).toEqual({ value: "Lounge" });
    expect(result.mapping.ambient).toEqual({
      temperatureIndex: 4,
      temperatureUnit: "C",
      humidityIndex: 5,
      dewPointIndex: 6,
    });
  });

  it("does not treat a hand-built object as a validated mapping", () => {
    const accepted = validateMapping(moisture(), HEADER);
    if (!accepted.ok) throw new Error("setup failed");
    expect(isValidatedMapping({ ...accepted.mapping })).toBe(false);
    expect(isValidatedMapping(moisture())).toBe(false);
  });

  it("refuses a column that is not in the header", () => {
    const input = moisture();
    input.moisture.valueColumn = "Moisture %";
    expect(issues(input)).toEqual([{ path: "moisture.valueColumn", code: "column_not_found" }]);
  });

  it("refuses an unknown key at the top level and inside a block", () => {
    expect(issues({ ...moisture(), jobId: "abc" })).toEqual([{ path: "", code: "unknown_key" }]);
    const nested = moisture();
    (nested.timestamp as Record<string, unknown>).locale = "en-AU";
    expect(issues(nested)).toEqual([{ path: "timestamp", code: "unknown_key" }]);
  });

  it("refuses the wrong kind block and a missing kind block", () => {
    const both = { ...moisture(), ambient: ambient().ambient };
    expect(issues(both)).toEqual([{ path: "ambient", code: "kind_block_unexpected" }]);
    const none = { ...moisture(), moisture: undefined };
    expect(issues(none)).toEqual([{ path: "moisture", code: "kind_block_missing" }]);
    const swapped = { ...ambient(), kind: "moisture" };
    expect(issues(swapped)).toEqual([
      { path: "moisture", code: "kind_block_missing" },
      { path: "ambient", code: "kind_block_unexpected" },
    ]);
  });

  it("refuses a moisture unit RestoreAssist does not store", () => {
    const input = moisture();
    input.moisture.unit = "REL";
    expect(issues(input)).toEqual([{ path: "moisture.unit", code: "invalid" }]);
  });

  it("refuses a format with no zone of its own when no time zone is given", () => {
    for (const format of ["yyyy-MM-dd HH:mm[:ss]", "dd/MM/yyyy HH:mm[:ss]", "MM/dd/yyyy HH:mm[:ss]"]) {
      const input = moisture();
      input.timestamp = { column: "Time", format } as typeof input.timestamp;
      expect(issues(input)).toEqual([{ path: "timestamp.timeZone", code: "time_zone_required" }]);
    }
  });

  it("refuses a time zone the runtime does not know", () => {
    for (const timeZone of ["Australia/Atlantis", "Sydney time", "+10:00"]) {
      const input = moisture();
      input.timestamp.timeZone = timeZone;
      expect(issues(input)).toEqual([{ path: "timestamp.timeZone", code: "time_zone_unknown" }]);
    }
  });

  it("refuses a vendor that is blank or over 100 characters", () => {
    const long = moisture();
    long.device.vendor = "v".repeat(101);
    expect(issues(long)).toEqual([{ path: "device.vendor", code: "invalid" }]);
    const blank = moisture();
    blank.device.vendor = "   ";
    expect(issues(blank)).toEqual([{ path: "device.vendor", code: "invalid" }]);
    const atLimit = moisture();
    atLimit.device.vendor = "v".repeat(100);
    expect(validateMapping(atLimit, HEADER).ok).toBe(true);
  });

  it("refuses input that is not an object", () => {
    expect(issues(null)).toEqual([{ path: "", code: "invalid" }]);
    expect(issues("moisture")).toEqual([{ path: "", code: "invalid" }]);
  });

  it("never repeats a value from the file or the mapping in a refusal", () => {
    const secret = "SECRET-CELL-VALUE-8413";
    const header = ["Time", secret];
    const input = {
      kind: secret,
      timestamp: { column: secret + "x", format: secret, timeZone: secret },
      device: { vendor: secret.repeat(10), model: secret.repeat(10), idColumn: secret + "y" },
      location: { column: secret + "z", value: secret },
      moisture: { valueColumn: secret + "q", unit: secret, surfaceType: { value: "" } },
      [secret]: secret,
    };
    const result = validateMapping(input, header);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET");

    const absent = moisture();
    absent.location = { column: secret } as unknown as typeof absent.location;
    const refused = validateMapping(absent, HEADER);
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused)).not.toContain("SECRET");
  });
});
