import { describe, it, expect } from "vitest";
import {
  assessReadingDryness,
  summariseWetReadings,
} from "../reading-dryness";

describe("assessReadingDryness", () => {
  it("plasterboard above the 1% dry standard reads not_dry", () => {
    const r = assessReadingDryness({ surfaceType: "drywall", moistureLevel: 22 });
    expect(r.status).toBe("not_dry");
    if (r.status === "not_dry") {
      expect(r.targetMc).toBe(1);
      expect(r.marginMc).toBe(21);
      expect(r.material).toContain("plasterboard");
    }
  });

  it("plasterboard at/below the dry standard reads dry", () => {
    const r = assessReadingDryness({ surfaceType: "gib", moistureLevel: 0.8 });
    expect(r.status).toBe("dry");
  });

  it("timber uses the 16% standard (14% dry, 22% not_dry)", () => {
    expect(assessReadingDryness({ surfaceType: "wood", moistureLevel: 14 }).status).toBe("dry");
    expect(assessReadingDryness({ surfaceType: "timber", moistureLevel: 22 }).status).toBe("not_dry");
  });

  it("resolves materials that already match by alias (carpet, concrete)", () => {
    expect(assessReadingDryness({ surfaceType: "carpet", moistureLevel: 8 }).status).toBe("not_dry"); // >5
    expect(assessReadingDryness({ surfaceType: "concrete", moistureLevel: 6 }).status).toBe("not_dry"); // >4
  });

  it("treats a reading with no unit as moisture content", () => {
    expect(
      assessReadingDryness({ surfaceType: "drywall", moistureLevel: 0.5, unit: null }).status,
    ).toBe("dry");
    expect(
      assessReadingDryness({ surfaceType: "drywall", moistureLevel: 30, unit: "WME" }).status,
    ).toBe("not_dry");
  });

  it("returns unknown for non-moisture-content units (RH, temperature)", () => {
    expect(assessReadingDryness({ surfaceType: "drywall", moistureLevel: 60, unit: "RH" }).status).toBe("unknown");
    expect(assessReadingDryness({ surfaceType: "drywall", moistureLevel: 21, unit: "CELSIUS" }).status).toBe("unknown");
  });

  it("returns unknown (never guesses) for an unrecognised surface or missing surface", () => {
    expect(assessReadingDryness({ surfaceType: "spaceship hull", moistureLevel: 50 }).status).toBe("unknown");
    expect(assessReadingDryness({ surfaceType: null, moistureLevel: 50 }).status).toBe("unknown");
    expect(assessReadingDryness({ surfaceType: "  ", moistureLevel: 50 }).status).toBe("unknown");
  });
});

describe("summariseWetReadings", () => {
  it("returns only the still-wet readings with a human summary", () => {
    const wet = summariseWetReadings([
      { surfaceType: "drywall", moistureLevel: 22, location: "Bathroom" },
      { surfaceType: "drywall", moistureLevel: 0.5, location: "Hallway" }, // dry
      { surfaceType: "RH probe", moistureLevel: 60, unit: "RH", location: "Lounge" }, // unknown
      { surfaceType: "timber", moistureLevel: 25, location: "Subfloor" },
    ]);
    expect(wet).toHaveLength(2);
    expect(wet[0]).toMatchObject({ location: "Bathroom" });
    expect(wet[0].summary).toContain("dry standard");
    expect(wet.map((w) => w.location)).toEqual(["Bathroom", "Subfloor"]);
  });
});
