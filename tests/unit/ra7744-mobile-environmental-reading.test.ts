import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { latestEnvironmentalReading as webLatest } from "@/lib/inspections/latest-environmental-reading";
import { latestEnvironmentalReading as mobileLatest } from "../../mobile/lib/inspections/latest-environmental-reading";

// RA-7744: the Expo field screen read GET /api/inspections/[id]'s
// environmentalData as one object, but it is an ARRAY, so temperature and
// humidity loaded as "undefined". `mobile/` has no React Native test runner
// in CI, so this pins the screen's wiring and the helper it calls.

const screenSource = readFileSync(
  join(process.cwd(), "mobile/app/(tabs)/inspections/[id].tsx"),
  "utf8",
);

const base = {
  ambientTemperature: 0,
  humidityLevel: 0,
  dewPoint: null,
  airCirculation: false,
};

const CASES = {
  list: [
    { ...base, id: "old", ambientTemperature: 30, recordedAt: "2026-09-20T01:00:00.000Z" },
    { ...base, id: "new", ambientTemperature: 21, recordedAt: "2026-09-22T01:00:00.000Z" },
  ],
  tie: [
    { ...base, id: "a", recordedAt: "2026-09-22T01:00:00.000Z", createdAt: "2026-09-22T01:00:01.000Z" },
    { ...base, id: "b", recordedAt: "2026-09-22T01:00:00.000Z", createdAt: "2026-09-22T01:00:09.000Z" },
  ],
  createdOnly: [
    { ...base, id: "x", createdAt: "2026-09-22T01:00:00.000Z" },
    { ...base, id: "y", createdAt: "2026-09-21T01:00:00.000Z" },
  ],
  single: { ...base, id: "one", recordedAt: "2026-09-22T01:00:00.000Z" },
  empty: [],
  none: null,
};

describe("mobile job screen environment readings (RA-7744)", () => {
  it("loads the fields from the latest reading via the helper, not the raw list", () => {
    expect(screenSource).toMatch(
      /const env = latestEnvironmentalReading\(data\.environmentalData\);/,
    );
    expect(screenSource).toMatch(
      /setEnvTemp\(String\(env\.ambientTemperature\)\)/,
    );
    expect(screenSource).toMatch(
      /setEnvHumidity\(String\(env\.humidityLevel\)\)/,
    );
    expect(screenSource).not.toMatch(/data\.environmentalData\.\w/);
  });

  it("picks the latest reading from the ARRAY the API returns", () => {
    expect(mobileLatest(CASES.list)?.ambientTemperature).toBe(21);
  });

  it("agrees with the web helper on every shape", () => {
    for (const [name, value] of Object.entries(CASES)) {
      const web = webLatest(value as never) as { id?: string } | null;
      const mobile = mobileLatest(value as never) as { id?: string } | null;
      expect(mobile?.id ?? null, name).toBe(web?.id ?? null);
    }
  });
});
