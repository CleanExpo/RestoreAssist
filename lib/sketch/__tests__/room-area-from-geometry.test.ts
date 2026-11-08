import { describe, expect, it } from "vitest";
import {
  areaM2FromGeometryOnly,
  isMeasuredRoom,
  resolvePxPerMetre,
  resolveRoomAreaM2,
  resolveWallAreaM2,
  roomLabel,
} from "../room-area-from-geometry";

describe("room-area-from-geometry", () => {
  it("prefers data.areaM2 over pixel shoelace when the drawing supports it (RA-7572, RA-8237)", () => {
    const obj = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ],
      data: { type: "room" as const, areaM2: 9.1 },
    };
    // Within 2% of the 9 m² drawing: the claim bills.
    expect(resolveRoomAreaM2(obj)).toBe(9.1);
    // RA-8237 widen: a claim the drawing does not support bills the drawing.
    const tiny = {
      ...obj,
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ],
      data: { type: "room" as const, areaM2: 9 },
    };
    expect(resolveRoomAreaM2(tiny)).toBeCloseTo(0.0009, 9);
    // With no drawing at all the claim still bills.
    expect(resolveRoomAreaM2({ data: { type: "room", areaM2: 9 } })).toBe(9);
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

  it("identifies measured rooms and skips underlay_reference / ai_suggested", () => {
    expect(
      isMeasuredRoom({
        data: { type: "room", provenance: "operator_measured" },
      }),
    ).toBe(true);
    // Legacy editor / pre-RA-6760 V2 import: missing provenance bills as measured.
    expect(isMeasuredRoom({ data: { type: "room" } })).toBe(true);
    expect(isMeasuredRoom({ type: "polygon" })).toBe(true);
    expect(
      isMeasuredRoom({
        data: { type: "room", provenance: null as unknown as string },
      }),
    ).toBe(true);
    expect(
      isMeasuredRoom({ data: { type: "room", provenance: "" } }),
    ).toBe(true);
    expect(
      isMeasuredRoom({
        type: "polygon",
        data: { type: "room", provenance: "underlay_reference" },
      }),
    ).toBe(false);
    expect(
      isMeasuredRoom({
        type: "polygon",
        data: { type: "room", provenance: "ai_suggested" },
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

  it("areaM2FromGeometryOnly ignores forged m² and L×W", () => {
    const obj = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ],
      data: { type: "room" as const, areaM2: 900, lengthM: 30, widthM: 30 },
    };
    expect(areaM2FromGeometryOnly(obj, 100)).toBe(9);
    // RA-8237 widen: the billing resolver refuses the forged claim too.
    expect(resolveRoomAreaM2(obj, 100)).toBe(9);
  });
});
