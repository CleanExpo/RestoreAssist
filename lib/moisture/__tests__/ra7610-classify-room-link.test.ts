/**
 * RA-7610 after RA-7709: Category / Class are worked out by classifyInspection
 * (the one function the Review & Submit preview and submit both call). A
 * reading linked to a drawn room must be counted in that room's area, even
 * when its free-text location names a different room. A reading with no
 * room link still matches by its location text, as before.
 */
import { describe, expect, it } from "vitest";
import { classifyInspection } from "@/lib/nir-classification-engine";

const kitchen = { id: "sr-kitchen", name: "Kitchen" };

const areas = [
  {
    roomZoneId: "Kitchen",
    areaSqm: 5,
    waterSource: "Clean Water",
    timeSinceLoss: 4,
  },
  {
    roomZoneId: "Bathroom",
    areaSqm: 5,
    waterSource: "Clean Water",
    timeSinceLoss: 4,
  },
];

// Linked to Kitchen on the sketch; the typed location says "Bathroom".
const kitchenLinkedBathroomText = {
  location: "Bathroom",
  sketchRoomId: kitchen.id,
  sketchRoom: kitchen,
  surfaceType: "Carpet",
  moistureLevel: 30,
  depth: "Surface",
};

// Linked to Kitchen; the typed location names no affected area at all.
const kitchenLinkedOtherText = {
  location: "near the fridge",
  sketchRoomId: kitchen.id,
  sketchRoom: kitchen,
  surfaceType: "Carpet",
  moistureLevel: 30,
  depth: "Surface",
};

// No room link: the free-text location decides.
const unlinkedBathroom = {
  location: "Bathroom wall",
  sketchRoomId: null,
  sketchRoom: null,
  surfaceType: "Carpet",
  moistureLevel: 30,
  depth: "Surface",
};

function area(
  result: ReturnType<typeof classifyInspection>,
  roomZoneId: string,
) {
  const found = result.areas.find((a) => a.roomZoneId === roomZoneId);
  expect(found).toBeDefined();
  return found!;
}

describe("RA-7610 — classifyInspection uses the room link", () => {
  it("counts a Kitchen-linked reading typed as 'Bathroom' in Kitchen, not Bathroom", () => {
    const result = classifyInspection({
      affectedAreas: areas,
      moistureReadings: [kitchenLinkedBathroomText],
      environmentalData: null,
    });

    const k = area(result, "Kitchen");
    const b = area(result, "Bathroom");
    expect(k.input.moistureReadings).toHaveLength(1);
    expect(b.input.moistureReadings).toHaveLength(0);
    // 30% carpet makes the room Class 2; the dry room stays Class 1.
    expect(k.class).toBe("2");
    expect(b.class).toBe("1");
  });

  it("counts a linked reading whose location names no area in its linked room", () => {
    const result = classifyInspection({
      affectedAreas: areas,
      moistureReadings: [kitchenLinkedOtherText],
      environmentalData: null,
    });

    expect(area(result, "Kitchen").input.moistureReadings).toHaveLength(1);
    expect(result.class).toBe("2");
  });

  it("still matches a reading with no room link by its location text", () => {
    const result = classifyInspection({
      affectedAreas: areas,
      moistureReadings: [unlinkedBathroom],
      environmentalData: null,
    });

    expect(area(result, "Bathroom").input.moistureReadings).toHaveLength(1);
    expect(area(result, "Kitchen").input.moistureReadings).toHaveLength(0);
  });
});
