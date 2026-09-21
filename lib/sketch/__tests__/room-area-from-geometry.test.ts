import { describe, expect, it } from "vitest";
import {
  isMeasuredRoom,
  resolvePxPerMetre,
  resolveRoomAreaM2,
  resolveWallAreaM2,
  roomLabel,
} from "../room-area-from-geometry";

describe("room-area-from-geometry", () => {
  it("prefers data.areaM2 over pixel shoelace", () => {
    const obj = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ],
      data: { type: "room" as const, areaM2: 9 },
    };
    expect(resolveRoomAreaM2(obj)).toBe(9);
  });

  it("uses L×W metres when areaM2 is missing", () => {
    expect(
      resolveRoomAreaM2({
        data: { type: "room", lengthM: 3, widthM: 3 },
      }),
    ).toBe(9);
  });

  it("shoelaces array-form points at the given scale", () => {
    const obj = {
      type: "Polygon",
      points: [
        [0, 0],
        [300, 0],
        [300, 300],
        [0, 300],
      ] as [number, number][],
      data: { type: "room" as const },
    };
    expect(resolveRoomAreaM2(obj, 100)).toBeCloseTo(9, 5);
  });

  it("reads scaleConfig.pxPerMetre", () => {
    expect(resolvePxPerMetre({ scaleConfig: { pxPerMetre: 50 } })).toBe(50);
    expect(resolvePxPerMetre({ scaleConfig: {} })).toBe(100);
    expect(resolvePxPerMetre(null)).toBe(100);
  });

  it("identifies rooms by data.type even without a polygon type", () => {
    expect(isMeasuredRoom({ data: { type: "room" } })).toBe(true);
    expect(isMeasuredRoom({ type: "polygon" })).toBe(true);
    expect(
      isMeasuredRoom({
        type: "polygon",
        data: { type: "room", provenance: "underlay_reference" },
      }),
    ).toBe(false);
    expect(isMeasuredRoom({ data: { type: "opening" } })).toBe(false);
  });

  it("wall area is perimeter × ceiling when both are known", () => {
    expect(
      resolveWallAreaM2({
        data: {
          type: "room",
          lengthM: 3,
          widthM: 3,
          ceilingHeightM: 2.7,
        },
      }),
    ).toBeCloseTo(32.4, 5);
  });

  it("roomLabel falls back to Room", () => {
    expect(roomLabel({ data: { type: "room", label: "  Kitchen  " } })).toBe(
      "Kitchen",
    );
    expect(roomLabel({})).toBe("Room");
  });
});
