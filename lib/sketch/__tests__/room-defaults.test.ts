import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_SIDE_M,
  rectRoomPoints,
  rectRoomPointsFromDiagonal,
  roomLengthWidthM,
  resizeRectRoomFromDims,
  parseMetresInput,
  hostWallIdForRoomEdge,
  parseRoomEdgeHostWallId,
  roomEdgeHostSegments,
} from "../room-defaults";

describe("rectRoomPoints", () => {
  it("places a default ~12′8″ room centered on the tap point", () => {
    const pts = rectRoomPoints({ x: 500, y: 400 }, DEFAULT_ROOM_SIDE_M, DEFAULT_ROOM_SIDE_M);
    expect(pts).toHaveLength(4);
    const dims = roomLengthWidthM(pts);
    expect(dims?.lengthM).toBe(DEFAULT_ROOM_SIDE_M);
    expect(dims?.widthM).toBe(DEFAULT_ROOM_SIDE_M);
    // Centroid stays on the tap
    const cx = (pts[0].x + pts[2].x) / 2;
    const cy = (pts[0].y + pts[2].y) / 2;
    expect(cx).toBeCloseTo(500, 5);
    expect(cy).toBeCloseTo(400, 5);
  });
});

describe("rectRoomPointsFromDiagonal", () => {
  it("builds an axis-aligned rect from any two corners", () => {
    const pts = rectRoomPointsFromDiagonal({ x: 100, y: 50 }, { x: 300, y: 250 });
    expect(roomLengthWidthM(pts)).toEqual({ lengthM: 2, widthM: 2 });
  });
});

describe("resizeRectRoomFromDims", () => {
  it("keeps the centroid when typing new L×W", () => {
    const original = rectRoomPoints({ x: 200, y: 200 }, 4, 3);
    const next = resizeRectRoomFromDims(original, 5, 2.5)!;
    const dims = roomLengthWidthM(next)!;
    expect(dims.lengthM).toBe(5);
    expect(dims.widthM).toBe(2.5);
    expect((next[0].x + next[2].x) / 2).toBeCloseTo(200, 5);
    expect((next[0].y + next[2].y) / 2).toBeCloseTo(200, 5);
  });

  it("returns null for irregular (non-rect) rooms", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(resizeRectRoomFromDims(L, 3, 3)).toBeNull();
  });
});

describe("parseMetresInput", () => {
  it("parses metric strings", () => {
    expect(parseMetresInput("3.86")).toBe(3.86);
    expect(parseMetresInput("3,86 m")).toBe(3.86);
  });

  it("parses feet-inches (Xactimate-style)", () => {
    expect(parseMetresInput("12'8\"")).toBe(3.86);
  });

  it("rejects empty / non-positive", () => {
    expect(parseMetresInput("")).toBeNull();
    expect(parseMetresInput("-1")).toBeNull();
    expect(parseMetresInput("abc")).toBeNull();
  });
});

describe("room edge host wall ids", () => {
  it("round-trips roomId + edge index", () => {
    const id = hostWallIdForRoomEdge("room-abc", 2);
    expect(parseRoomEdgeHostWallId(id)).toEqual({
      roomId: "room-abc",
      edgeIndex: 2,
    });
  });

  it("emits one host segment per polygon edge", () => {
    const pts = rectRoomPoints({ x: 0, y: 0 }, 2, 1);
    const segs = roomEdgeHostSegments("r1", pts);
    expect(segs).toHaveLength(4);
    expect(segs[0].wallId).toBe("r1:edge:0");
  });
});
