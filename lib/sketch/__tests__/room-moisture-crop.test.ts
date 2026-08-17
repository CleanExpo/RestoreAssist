import { describe, expect, it } from "vitest";
import {
  contentBoundsForRoomCrop,
  filterPinsInRoom,
  filterNormalizedPinsInRoom,
  isPointInRoomCrop,
  roomCropMeta,
  roomPolygonToCropRect,
  ROOM_MOISTURE_CROP_PADDING_PX,
} from "../room-moisture-crop";

const square = {
  id: "room-1",
  label: "Living",
  points: [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ],
};

describe("room-moisture-crop", () => {
  it("builds padded AABB crop from room polygon", () => {
    const crop = roomPolygonToCropRect(square);
    expect(crop).not.toBeNull();
    expect(crop!.roomId).toBe("room-1");
    expect(crop!.label).toBe("Living");
    expect(crop!.left).toBe(100 - ROOM_MOISTURE_CROP_PADDING_PX);
    expect(crop!.top).toBe(100 - ROOM_MOISTURE_CROP_PADDING_PX);
    expect(crop!.width).toBe(200 + ROOM_MOISTURE_CROP_PADDING_PX * 2);
    expect(crop!.height).toBe(150 + ROOM_MOISTURE_CROP_PADDING_PX * 2);
  });

  it("returns null for degenerate polygons", () => {
    expect(
      roomPolygonToCropRect({ id: "x", points: [{ x: 0, y: 0 }] }),
    ).toBeNull();
  });

  it("hit-tests points inside the room", () => {
    expect(isPointInRoomCrop(200, 175, square.points)).toBe(true);
    expect(isPointInRoomCrop(50, 50, square.points)).toBe(false);
  });

  it("filters pins to those inside the room", () => {
    const pins = [
      { id: "a", x: 200, y: 175, wme: 10 },
      { id: "b", x: 10, y: 10, wme: 20 },
    ];
    const inside = filterPinsInRoom(pins, square.points, 800, 600);
    expect(inside.map((p) => p.id)).toEqual(["a"]);
  });

  it("builds crop meta and export bounds", () => {
    const crop = roomPolygonToCropRect(square)!;
    const meta = roomCropMeta("room-1", crop);
    expect(meta.roomId).toBe("room-1");
    expect(meta.crop.width).toBe(crop.width);
    const bounds = contentBoundsForRoomCrop(crop);
    expect(bounds.width).toBe(crop.width);
    expect(bounds.height).toBe(crop.height);
  });

  it("filters normalized pins into the room polygon", () => {
    const pins = [
      { nx: 200 / 800, ny: 175 / 600, wme: 12 },
      { nx: 10 / 800, ny: 10 / 600, wme: 22 },
    ];
    const inside = filterNormalizedPinsInRoom(pins, square.points, 800, 600);
    expect(inside).toHaveLength(1);
    expect(inside[0].wme).toBe(12);
  });
});
