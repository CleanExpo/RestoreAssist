import { describe, expect, it } from "vitest";
import {
  fabricJsonFromStoredSketchData,
  scaleConfigFromStoredSketchData,
  roomMoistureCropFromStoredSketchData,
  damageMarkersFromStoredSketchData,
} from "../pending-sketch-load";

describe("fabricJsonFromStoredSketchData", () => {
  it("returns null for empty/invalid input", () => {
    expect(fabricJsonFromStoredSketchData(null)).toBeNull();
    expect(fabricJsonFromStoredSketchData(undefined)).toBeNull();
    expect(fabricJsonFromStoredSketchData("x")).toBeNull();
    expect(fabricJsonFromStoredSketchData([])).toBeNull();
  });

  it("strips editor-only keys so Fabric loadFromJSON only gets canvas fields", () => {
    const stored = {
      version: "6.0.0",
      objects: [{ type: "rect", left: 10 }],
      scaleConfig: { pxPerMetre: 100, description: "calibrated" },
      roomMoistureCrop: {
        roomId: "r1",
        crop: { left: 0, top: 0, width: 10, height: 10, roomId: "r1" },
      },
      raSketchMeta: { fieldComplete: true },
      damageMarkers: [{ type: "water_cat1", severity: "low", x: 1, y: 1 }],
    };
    const fabric = fabricJsonFromStoredSketchData(stored);
    expect(fabric).toEqual({
      version: "6.0.0",
      objects: [{ type: "rect", left: 10 }],
    });
    expect(fabric).not.toHaveProperty("scaleConfig");
    expect(fabric).not.toHaveProperty("roomMoistureCrop");
    expect(fabric).not.toHaveProperty("raSketchMeta");
    expect(fabric).not.toHaveProperty("damageMarkers");
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

describe("roomMoistureCropFromStoredSketchData", () => {
  it("restores valid crop meta and rejects junk", () => {
    expect(
      roomMoistureCropFromStoredSketchData({
        roomMoistureCrop: {
          roomId: "r1",
          crop: { left: 1, top: 2, width: 3, height: 4, roomId: "r1" },
        },
      }),
    ).toEqual({
      roomId: "r1",
      crop: { left: 1, top: 2, width: 3, height: 4, roomId: "r1" },
    });
    expect(roomMoistureCropFromStoredSketchData({ objects: [] })).toBeNull();
    expect(
      roomMoistureCropFromStoredSketchData({
        roomMoistureCrop: { roomId: "r1", crop: { left: 0 } },
      }),
    ).toBeNull();
  });
});

describe("damageMarkersFromStoredSketchData", () => {
  it("extracts the overlay array and rejects non-arrays", () => {
    const markers = [{ type: "water_cat3", severity: "high", x: 1, y: 2 }];
    expect(
      damageMarkersFromStoredSketchData({ objects: [], damageMarkers: markers }),
    ).toEqual(markers);
    expect(damageMarkersFromStoredSketchData({ objects: [] })).toBeNull();
    expect(
      damageMarkersFromStoredSketchData({ damageMarkers: { type: "water_cat1" } }),
    ).toBeNull();
  });
});
