/**
 * RA-7610: a moisture reading created against a SketchRoom reference must
 * appear in the affected-area join, on the moisture heat-map, and in the
 * drying-status query. On main the field does not exist and those three
 * surfaces still join by free-text location only.
 *
 * Location "North Wall" does not contain "Living room", so today's name
 * match misses it. The room FK is the join key.
 */
import { describe, expect, it } from "vitest";
import {
  dryingLocationForReading,
  heatmapReadingsForRoom,
  readingMatchesArea,
} from "../reading-room-join";

const livingRoom = { id: "sr-living", name: "Living room" };

const linkedReading = {
  location: "North Wall",
  sketchRoomId: livingRoom.id,
  sketchRoom: livingRoom,
  surfaceType: "carpet",
  moistureLevel: 28,
};

const freeTextReading = {
  location: "Living Room North Wall",
  sketchRoomId: null,
  sketchRoom: null,
  surfaceType: "carpet",
  moistureLevel: 22,
};

const livingArea = { roomZoneId: "Living room" };

describe("RA-7610 — reading ↔ room link", () => {
  it("joins a reading to an affected area via sketchRoomId even when location does not match", () => {
    expect(readingMatchesArea(linkedReading, livingArea)).toBe(true);
  });

  it("falls back to today's name match when sketchRoomId is null", () => {
    expect(readingMatchesArea(freeTextReading, livingArea)).toBe(true);
    expect(
      readingMatchesArea(
        { location: "Bathroom", sketchRoomId: null, sketchRoom: null },
        livingArea,
      ),
    ).toBe(false);
  });

  it("places a room-linked reading on that room's moisture heat-map", () => {
    const onMap = heatmapReadingsForRoom(
      [linkedReading, freeTextReading],
      livingRoom,
    );
    expect(onMap.map((r) => r.location)).toEqual([
      "North Wall",
      "Living Room North Wall",
    ]);
  });

  it("does not put a different room's linked reading on this heat-map", () => {
    const kitchenLinked = {
      location: "North Wall",
      sketchRoomId: "sr-kitchen",
      sketchRoom: { id: "sr-kitchen", name: "Kitchen" },
    };
    expect(heatmapReadingsForRoom([kitchenLinked], livingRoom)).toEqual([]);
  });

  it("uses the SketchRoom name in the drying-status query when sketchRoomId is present", () => {
    expect(dryingLocationForReading(linkedReading)).toBe("Living room");
    expect(dryingLocationForReading(freeTextReading)).toBe(
      "Living Room North Wall",
    );
  });
});
