import { describe, expect, it } from "vitest";
import {
  fabricJsonFromStoredSketchData,
  scaleConfigFromStoredSketchData,
} from "../pending-sketch-load";

describe("fabricJsonFromStoredSketchData", () => {
  it("returns null for empty/invalid input", () => {
    expect(fabricJsonFromStoredSketchData(null)).toBeNull();
    expect(fabricJsonFromStoredSketchData(undefined)).toBeNull();
    expect(fabricJsonFromStoredSketchData("x")).toBeNull();
    expect(fabricJsonFromStoredSketchData([])).toBeNull();
  });

  it("strips scaleConfig so Fabric loadFromJSON only gets canvas fields", () => {
    const stored = {
      version: "6.0.0",
      objects: [{ type: "rect", left: 10 }],
      scaleConfig: { pxPerMetre: 100, description: "calibrated" },
    };
    const fabric = fabricJsonFromStoredSketchData(stored);
    expect(fabric).toEqual({
      version: "6.0.0",
      objects: [{ type: "rect", left: 10 }],
    });
    expect(fabric).not.toHaveProperty("scaleConfig");
  });

  it("keeps background-only sketches restorable", () => {
    const fabric = fabricJsonFromStoredSketchData({
      backgroundImage: { src: "https://example.com/u.png" },
      scaleConfig: { pxPerMetre: 50 },
    });
    expect(fabric?.backgroundImage).toBeTruthy();
    expect(fabric).not.toHaveProperty("scaleConfig");
  });
});

describe("scaleConfigFromStoredSketchData", () => {
  it("extracts scaleConfig for FloorData restore", () => {
    expect(
      scaleConfigFromStoredSketchData({
        objects: [],
        scaleConfig: { pxPerMetre: 80 },
      }),
    ).toEqual({ pxPerMetre: 80 });
    expect(scaleConfigFromStoredSketchData({ objects: [] })).toBeNull();
  });
});
