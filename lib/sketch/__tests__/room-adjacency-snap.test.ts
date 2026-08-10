import { describe, expect, it } from "vitest";
import {
  ADJACENCY_SNAP_PX,
  findRoomAdjacencySnap,
  type RoomEdgeRef,
} from "../room-adjacency-snap";

const rectEdges = (
  roomId: string,
  left: number,
  top: number,
  w: number,
  h: number,
): RoomEdgeRef[] => [
  {
    roomId,
    edgeIndex: 0,
    a: { x: left, y: top },
    b: { x: left + w, y: top },
  },
  {
    roomId,
    edgeIndex: 1,
    a: { x: left + w, y: top },
    b: { x: left + w, y: top + h },
  },
  {
    roomId,
    edgeIndex: 2,
    a: { x: left + w, y: top + h },
    b: { x: left, y: top + h },
  },
  {
    roomId,
    edgeIndex: 3,
    a: { x: left, y: top + h },
    b: { x: left, y: top },
  },
];

describe("findRoomAdjacencySnap", () => {
  it("snaps a nearly-touching right edge onto the neighbour left edge", () => {
    const stationary = rectEdges("a", 0, 0, 200, 150);
    // Room B is 8px left of A's right edge (within snap threshold).
    // Height/offset chosen so no horizontal edge is already coincident.
    const moving = rectEdges("b", 200 - 8, 20, 180, 110);
    const result = findRoomAdjacencySnap(moving, stationary, ADJACENCY_SNAP_PX);
    expect(result.snapped).toBe(true);
    expect(result.dx).toBeCloseTo(8);
    expect(result.dy).toBeCloseTo(0);
    expect(result.join).not.toBeNull();
    // Green cue segment should lie on the shared vertical edge at x=200
    expect(result.join!.a.x).toBeCloseTo(200);
    expect(result.join!.b.x).toBeCloseTo(200);
  });

  it("returns no snap when rooms are far apart", () => {
    const stationary = rectEdges("a", 0, 0, 100, 100);
    const moving = rectEdges("b", 400, 400, 100, 100);
    const result = findRoomAdjacencySnap(moving, stationary, ADJACENCY_SNAP_PX);
    expect(result.snapped).toBe(false);
    expect(result.join).toBeNull();
  });

  it("snaps horizontal shared edges (bottom → top)", () => {
    const stationary = rectEdges("a", 0, 0, 200, 100);
    const moving = rectEdges("b", 20, 100 - 6, 160, 120);
    const result = findRoomAdjacencySnap(moving, stationary, ADJACENCY_SNAP_PX);
    expect(result.snapped).toBe(true);
    expect(result.dy).toBeCloseTo(6);
    expect(result.join!.a.y).toBeCloseTo(100);
    expect(result.join!.b.y).toBeCloseTo(100);
  });
});
