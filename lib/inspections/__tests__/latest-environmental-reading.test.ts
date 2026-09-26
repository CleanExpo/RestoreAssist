import { describe, expect, it } from "vitest";
import {
  latestEnvironmentalReading,
  type EnvironmentalReading,
} from "../latest-environmental-reading";

function reading(
  id: string,
  recordedAt: string,
  createdAt: string,
): EnvironmentalReading & { id: string } {
  return {
    id,
    ambientTemperature: 20,
    humidityLevel: 50,
    dewPoint: 9.3,
    airCirculation: false,
    recordedAt,
    createdAt,
  };
}

describe("latestEnvironmentalReading tie-break (RA-7744)", () => {
  const SAME = "2026-09-22T01:00:00.000Z";
  const earlier = reading("earlier", SAME, "2026-09-22T01:00:05.000Z");
  const later = reading("later", SAME, "2026-09-22T01:00:09.000Z");

  it("picks the later createdAt when recordedAt is equal", () => {
    expect(
      (latestEnvironmentalReading([earlier, later]) as { id: string }).id,
    ).toBe("later");
  });

  it("gives the same answer whatever order the list arrives in", () => {
    expect(
      (latestEnvironmentalReading([later, earlier]) as { id: string }).id,
    ).toBe("later");
  });

  it("still ranks by recordedAt first", () => {
    const newest = reading(
      "newest",
      "2026-09-23T01:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    expect(
      (latestEnvironmentalReading([later, newest, earlier]) as { id: string })
        .id,
    ).toBe("newest");
  });
});
