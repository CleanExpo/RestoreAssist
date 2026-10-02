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
import { classifyInspection } from "../../nir-classification-engine";
import {
  dryingLocationForReading,
  heatmapReadingsForRoom,
  locationMatchesRoomName,
  linkedReadingAreaMismatch,
  linkedReadingsAreaConflict,
  unlinkedReadingsAreaAmbiguity,
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

  it("lets the room link decide: a Kitchen-linked reading typed 'Bathroom' does not match the Bathroom area", () => {
    const kitchenLinkedBathroomText = {
      location: "Bathroom",
      sketchRoomId: "sr-kitchen",
      sketchRoom: { id: "sr-kitchen", name: "Kitchen" },
    };
    expect(
      readingMatchesArea(kitchenLinkedBathroomText, { roomZoneId: "Bathroom" }),
    ).toBe(false);
    expect(
      readingMatchesArea(kitchenLinkedBathroomText, { roomZoneId: "Kitchen" }),
    ).toBe(true);
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

  it("does not attach a linked Bedroom 30 reading to Bedroom 3", () => {
    const reading = {
      location: "North Wall",
      sketchRoomId: "sr-bedroom-30",
      sketchRoom: { id: "sr-bedroom-30", name: "Bedroom 30" },
    };
    expect(readingMatchesArea(reading, { roomZoneId: "Bedroom 3" })).toBe(false);
    expect(readingMatchesArea(reading, { roomZoneId: "Bedroom 30" })).toBe(true);
    expect(linkedReadingAreaMismatch(reading, [{ roomZoneId: "Bedroom 3" }])).toBe(true);
  });

  it("flags generic linked rooms when numbered or named areas need exact association", () => {
    const genericBedroom = {
      location: "North Wall",
      sketchRoomId: "sr-bedroom",
      sketchRoom: { id: "sr-bedroom", name: "Bedroom" },
    };
    const areas = [{ roomZoneId: "Bedroom 3" }, { roomZoneId: "Bedroom 4" }];
    expect(areas.some((area) => readingMatchesArea(genericBedroom, area))).toBe(false);
    expect(linkedReadingAreaMismatch(genericBedroom, areas)).toBe(true);
    expect(linkedReadingAreaMismatch(genericBedroom, [{ roomZoneId: "Kitchen" }])).toBe(true);
    expect(linkedReadingAreaMismatch({
      ...genericBedroom,
      sketchRoom: { id: "sr-bedroom", name: "Bedroom 4" },
    }, areas)).toBe(false);
    expect(linkedReadingAreaMismatch({
      location: "Living Room wall",
      sketchRoomId: "sr-living",
      sketchRoom: { id: "sr-living", name: "Living Room" },
    }, [{ roomZoneId: "Living Room — Rear Lounge" }])).toBe(true);
    expect(linkedReadingAreaMismatch({
      location: "North Wall",
      sketchRoomId: "sr-rear-lounge",
      sketchRoom: { id: "sr-rear-lounge", name: "Rear Lounge" },
    }, [{ roomZoneId: "Living Room — Rear Lounge" }])).toBe(true);
    expect(linkedReadingAreaMismatch({
      ...genericBedroom,
      sketchRoom: { id: "sr-bedroom", name: "Bedroom 3" },
    }, [{ roomZoneId: "Bedroom" }])).toBe(true);
    expect(linkedReadingAreaMismatch({
      location: "North Wall",
      sketchRoomId: null,
    }, areas)).toBe(false);
    expect(linkedReadingAreaMismatch(genericBedroom, [])).toBe(false);
    expect(linkedReadingAreaMismatch(genericBedroom, [
      { roomZoneId: "Bedroom" },
      { roomZoneId: "Bedroom" },
    ])).toBe(true);
  });
  it("rejects distinct drawing IDs that collapse into one named area", () => {
    const first = {
      location: "North Wall",
      sketchRoomId: "sr-bedroom-a",
      sketchRoom: { id: "sr-bedroom-a", name: "Bedroom" },
    };
    const second = {
      location: "South Wall",
      sketchRoomId: "sr-bedroom-b",
      sketchRoom: { id: "sr-bedroom-b", name: "Bedroom" },
    };
    const areas = [{ roomZoneId: "Bedroom" }];
    expect(linkedReadingAreaMismatch(first, areas)).toBe(false);
    expect(linkedReadingAreaMismatch(second, areas)).toBe(false);
    expect(linkedReadingsAreaConflict([first, second], areas)).toBe(true);
    expect(linkedReadingsAreaConflict([first, { ...first, location: "South Wall" }], areas))
      .toBe(false);
    expect(linkedReadingsAreaConflict([{ ...second, sketchRoomId: null }, first], areas))
      .toBe(false);
  });

  it("flags unlinked readings hinting at a renamed area without cross-matching room numbers", () => {
    const reading = { location: "Living Room North Wall", sketchRoomId: null };
    expect(unlinkedReadingsAreaAmbiguity(
      [reading], [{ roomZoneId: "Living Room — Rear Lounge" }],
    )).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity(
      [{ location: "Rear Lounge North Wall" }],
      [{ roomZoneId: "Living Room — Rear Lounge" }],
    )).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity(
      [{ location: "Bedroom North Wall" }], [{ roomZoneId: "Bedroom 4" }],
    )).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity(
      [{ location: "Bedroom 3 North Wall" }], [{ roomZoneId: "Bedroom 4" }],
    )).toBe(false);
    expect(unlinkedReadingsAreaAmbiguity(
      [{ location: "North Wall" }], [{ roomZoneId: "Living Room — Rear Lounge" }],
    )).toBe(false);
    expect(unlinkedReadingsAreaAmbiguity(
      [reading], [{ roomZoneId: "Living Room" }, { roomZoneId: "Living Room — Rear Lounge" }],
    )).toBe(false);
    expect(locationMatchesRoomName("Bedroom 30 North Wall", "Bedroom 3")).toBe(false);
  });

  it("classifies Bedroom 2 reading only in Bedroom 2 when a generic Bedroom also exists", () => {
    const reading = {
      location: "Bedroom 2 North Wall",
      sketchRoomId: null,
      surfaceType: "Carpet",
      moistureLevel: 28,
      depth: "Surface",
    };
    const areas = [{ roomZoneId: "Bedroom" }, { roomZoneId: "Bedroom 2" }];
    expect(readingMatchesArea(reading, areas[0])).toBe(false);
    expect(readingMatchesArea(reading, areas[1])).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([reading], areas)).toBe(false);

    const result = classifyInspection({
      affectedAreas: areas.map((area) => ({ ...area, areaSqm: 12, waterSource: "Clean Water" })),
      moistureReadings: [reading],
      environmentalData: null,
    });
    expect(result.areas.map((area) => [area.roomZoneId, area.input.moistureReadings.length]))
      .toEqual([["Bedroom", 0], ["Bedroom 2", 1]]);
    expect(readingMatchesArea({ ...reading, location: "Bedroom North Wall" }, areas[0])).toBe(true);
    expect(readingMatchesArea({ ...reading, location: "Bedroom North Wall" }, areas[1])).toBe(false);
  });

  it("keeps decimal and unit distances in Kitchen without merging into Kitchen 1", () => {
    const areas = [{ roomZoneId: "Kitchen" }, { roomZoneId: "Kitchen 1" }];
    const decimal = {
      location: "Kitchen 1.2m from sink",
      surfaceType: "Tile",
      moistureLevel: 24,
      depth: "Surface",
    };
    const spacedUnit = { ...decimal, location: "Kitchen 1 m from sink" };
    for (const reading of [decimal, spacedUnit]) {
      expect(readingMatchesArea(reading, areas[0])).toBe(true);
      expect(readingMatchesArea(reading, areas[1])).toBe(false);
      expect(unlinkedReadingsAreaAmbiguity([reading], [areas[1]])).toBe(true);
    }
    expect(unlinkedReadingsAreaAmbiguity([decimal], areas)).toBe(false);
    expect(unlinkedReadingsAreaAmbiguity([spacedUnit], areas)).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([spacedUnit], [areas[0]])).toBe(false);
    const result = classifyInspection({
      affectedAreas: areas.map((area) => ({ ...area, areaSqm: 12, waterSource: "Clean Water" })),
      moistureReadings: [decimal, spacedUnit],
      environmentalData: null,
    });
    expect(result.areas.map((area) => [area.roomZoneId, area.input.moistureReadings.length]))
      .toEqual([["Kitchen", 2], ["Kitchen 1", 0]]);
    expect(readingMatchesArea({ ...decimal, location: "Kitchen 1 North Wall" }, areas[0]))
      .toBe(false);
    expect(readingMatchesArea({ ...decimal, location: "Kitchen 1 North Wall" }, areas[1]))
      .toBe(true);
  });

  it("blocks an unlinked numbered or named location when only a generic area exists", () => {
    const numbered = { location: "Bedroom 2 North Wall", sketchRoomId: null };
    expect(locationMatchesRoomName(numbered.location, "Bedroom")).toBe(false);
    expect(unlinkedReadingsAreaAmbiguity([numbered], [{ roomZoneId: "Bedroom" }])).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([numbered], [
      { roomZoneId: "Bedroom 2" }, { roomZoneId: "Bedroom 2" },
    ])).toBe(true);
    expect(readingMatchesArea(
      { location: "Living Room — Rear Lounge North Wall" }, { roomZoneId: "Living Room" },
    )).toBe(false);
    expect(locationMatchesRoomName("Living Room—Rear Lounge North Wall", "Living Room"))
      .toBe(false);
    expect(readingMatchesArea(
      { location: "Living Room — Rear Lounge North Wall" }, { roomZoneId: "Living Room — Rear Lounge" },
    )).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity(
      [{ location: "Living Room — Rear Lounge North Wall" }], [{ roomZoneId: "Living Room" }],
    )).toBe(true);
  });

  it("treats the meter prompt's em-dash east wall as a point inside Master bedroom", () => {
    const reading = {
      location: "Master bedroom — east wall, 300mm from floor",
      sketchRoomId: null,
      surfaceType: "Plasterboard",
      moistureLevel: 28,
      depth: "Surface",
    };
    const area = { roomZoneId: "Master bedroom" };
    expect(readingMatchesArea(reading, area)).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([reading], [area])).toBe(false);
    const result = classifyInspection({
      affectedAreas: [{ ...area, areaSqm: 12, waterSource: "Clean Water" }],
      moistureReadings: [reading],
      environmentalData: null,
    });
    expect(result.areas[0].input.moistureReadings).toHaveLength(1);

    const named = { ...reading, location: "Master bedroom — Rear Suite North Wall" };
    expect(readingMatchesArea(named, area)).toBe(false);
    expect(readingMatchesArea(named, { roomZoneId: "Master bedroom — Rear Suite" })).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([named], [area])).toBe(true);
    expect(unlinkedReadingsAreaAmbiguity([reading], [
      area, { roomZoneId: "Master bedroom — east wall" },
    ])).toBe(true);
  });

  it("keeps unaffected baselines out of affected-area scope and identity gates", () => {
    const baseline = {
      location: "Living Room North Wall",
      sketchRoomId: "sr-kitchen",
      sketchRoom: { id: "sr-kitchen", name: "Kitchen" },
      isBaseline: true,
    };
    const areas = [{ roomZoneId: "Living Room — Rear Lounge" }];
    expect(readingMatchesArea(baseline, { roomZoneId: "Kitchen" })).toBe(false);
    expect(linkedReadingsAreaConflict([baseline], areas)).toBe(false);
    expect(unlinkedReadingsAreaAmbiguity([{ ...baseline, sketchRoomId: null }], areas))
      .toBe(false);
  });
});
