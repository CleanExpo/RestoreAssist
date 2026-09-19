import { describe, expect, it } from "vitest";
import { createDamageMarker } from "@/lib/sketch/damage-markers";
import {
  damageMarkersFromSketchData,
  parseDamageMarkerMap,
  placeDamageMarkers,
} from "../damage-marker-map";

describe("parseDamageMarkerMap", () => {
  it("keeps only normalized markers so report placement cannot drift", () => {
    const placed = createDamageMarker({
      type: "water_cat3",
      severity: "high",
      room_label: "Kitchen",
      notes: "Black water at kitchen sink",
      x: 80,
      y: 40,
      width: 200,
      height: 100,
    });
    const legacyOnly = {
      id: "dm-old",
      type: "fire",
      severity: "low",
      room_label: "Hall",
      x: 10,
      y: 10,
    };
    const pins = parseDamageMarkerMap([placed, legacyOnly]);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      type: "water_cat3",
      caption: "C3 Kitchen",
      notes: "Black water at kitchen sink",
      room_label: "Kitchen",
    });
    expect(pins[0].nx).toBeCloseTo(0.4);
    expect(pins[0].ny).toBeCloseTo(0.4);
  });

  it("returns empty for junk instead of inventing a pin", () => {
    expect(parseDamageMarkerMap(null)).toEqual([]);
    expect(parseDamageMarkerMap({ type: "water_cat1" })).toEqual([]);
  });
});

describe("placeDamageMarkers", () => {
  it("maps nx/ny onto the drawn image (PDF origin is bottom-left)", () => {
    const [placed] = placeDamageMarkers(
      [
        {
          id: "dm-1",
          type: "mould",
          severity: "moderate",
          nx: 0.25,
          ny: 0.25,
          label: "Mo",
          caption: "Mo Ensuite",
          color: "#16A34A",
          room_label: "Ensuite",
        },
      ],
      { x: 100, y: 50, width: 400, height: 200 },
    );
    expect(placed.cx).toBe(200);
    expect(placed.cy).toBe(200);
  });
});

describe("damageMarkersFromSketchData", () => {
  it("reads the editor-only key off the persisted Fabric blob", () => {
    const raw = [{ type: "water_cat1", severity: "low", x: 1, y: 1, nx: 0.1, ny: 0.2 }];
    expect(damageMarkersFromSketchData({ objects: [], damageMarkers: raw })).toEqual(
      raw,
    );
    expect(damageMarkersFromSketchData({ objects: [] })).toBeNull();
    expect(damageMarkersFromSketchData(null)).toBeNull();
  });
});
