/**
 * reducer.ts — pure reducer for wall-graph mutations.
 *
 * Lives in `lib/sketch/v3/` (not `hooks/`) because it has no React
 * dependencies — `useWallGraph` is a thin React adapter on top. Keeping the
 * reducer pure means we can unit-test every action in isolation.
 *
 * Action design notes:
 *  - Every mutation runs the face-finder afterwards so `Floor.rooms` stays
 *    in sync with corners + walls. For typical floors (<200 corners) this is
 *    sub-millisecond.
 *  - Undo/redo is a stack of full graph snapshots. Memory is fine — a graph
 *    snapshot is <50KB. Reverting via JSON-clone is far simpler than
 *    inverse-action plumbing and avoids divergence bugs.
 *  - Anchored-evidence deletion-protection is enforced on the *server* in a
 *    transaction (see Phase 4); the reducer doesn't know about anchors.
 */

import { deriveRooms } from "./face-finder";
import type {
  Corner,
  Cuid,
  Floor,
  Opening,
  OpeningType,
  WallGraph,
  Wall,
  ScaleMethod,
} from "./wall-graph-types";
import { getActiveFloor } from "./wall-graph-types";

export type WallGraphAction =
  | {
      type: "ADD_CORNER";
      cornerId: Cuid;
      x: number;
      y: number;
    }
  | { type: "MOVE_CORNER"; cornerId: Cuid; x: number; y: number }
  | { type: "DELETE_CORNER"; cornerId: Cuid }
  | {
      type: "ADD_WALL";
      wallId: Cuid;
      from: Cuid;
      to: Cuid;
      thicknessMm?: number;
      isExterior?: boolean;
      height?: number;
    }
  | { type: "DELETE_WALL"; wallId: Cuid }
  | {
      type: "SPLIT_WALL_AT_CORNER";
      wallId: Cuid;
      newCornerId: Cuid;
      x: number;
      y: number;
      newWallId: Cuid;
    }
  | {
      type: "ADD_OPENING";
      openingId: Cuid;
      wallId: Cuid;
      openingType: OpeningType;
      positionM: number;
      widthM: number;
      heightM?: number;
      sillHeightM?: number;
    }
  | {
      type: "MOVE_OPENING";
      openingId: Cuid;
      positionM?: number;
      widthM?: number;
    }
  | { type: "DELETE_OPENING"; openingId: Cuid }
  | { type: "LABEL_ROOM"; roomId: Cuid; label: string; roomType?: string }
  | { type: "SET_SCALE"; pxPerMetre: number; method?: ScaleMethod }
  | {
      type: "ADD_FLOOR";
      floorId: Cuid;
      floorIndex: number;
      floorLabel: string;
    }
  | { type: "SET_ACTIVE_FLOOR"; floorId: Cuid }
  | { type: "REPLACE_FLOOR"; floor: Floor }
  | { type: "REPLACE_GRAPH"; graph: WallGraph };

export interface ReducerError extends Error {
  code:
    | "CORNER_NOT_FOUND"
    | "WALL_NOT_FOUND"
    | "OPENING_NOT_FOUND"
    | "ROOM_NOT_FOUND"
    | "FLOOR_NOT_FOUND"
    | "DUPLICATE_ID"
    | "WALL_REFERENCES_MISSING_CORNER"
    | "OPENING_OFF_WALL_END"
    | "INVALID_SCALE";
}

function fail(code: ReducerError["code"], message: string): never {
  const err = new Error(message) as ReducerError;
  err.code = code;
  throw err;
}

/**
 * Dispatch a single action. Returns a new graph (input is never mutated).
 *
 * Throws `ReducerError` on integrity violations — the React adapter catches
 * and surfaces these as toasts.
 */
export function reduce(graph: WallGraph, action: WallGraphAction): WallGraph {
  switch (action.type) {
    case "ADD_CORNER":
      return mapActiveFloor(graph, (floor) => {
        if (floor.corners.some((c) => c.id === action.cornerId)) {
          fail("DUPLICATE_ID", `Corner ${action.cornerId} already exists`);
        }
        const corner: Corner = {
          id: action.cornerId,
          x: action.x,
          y: action.y,
        };
        return { ...floor, corners: [...floor.corners, corner] };
      });

    case "MOVE_CORNER":
      return mapActiveFloor(graph, (floor) => {
        if (!floor.corners.some((c) => c.id === action.cornerId)) {
          fail("CORNER_NOT_FOUND", `Corner ${action.cornerId} not found`);
        }
        return {
          ...floor,
          corners: floor.corners.map((c) =>
            c.id === action.cornerId ? { ...c, x: action.x, y: action.y } : c,
          ),
        };
      });

    case "DELETE_CORNER":
      return mapActiveFloor(graph, (floor) => {
        if (!floor.corners.some((c) => c.id === action.cornerId)) {
          fail("CORNER_NOT_FOUND", `Corner ${action.cornerId} not found`);
        }
        // Cascade: drop walls that referenced the corner, then any openings
        // attached to those walls.
        const walls = floor.walls.filter(
          (w) => w.from !== action.cornerId && w.to !== action.cornerId,
        );
        const droppedWallIds = new Set(
          floor.walls
            .filter(
              (w) => w.from === action.cornerId || w.to === action.cornerId,
            )
            .map((w) => w.id),
        );
        const openings = floor.openings.filter(
          (o) => !droppedWallIds.has(o.wallId),
        );
        return {
          ...floor,
          corners: floor.corners.filter((c) => c.id !== action.cornerId),
          walls,
          openings,
        };
      });

    case "ADD_WALL":
      return mapActiveFloor(graph, (floor) => {
        if (floor.walls.some((w) => w.id === action.wallId)) {
          fail("DUPLICATE_ID", `Wall ${action.wallId} already exists`);
        }
        const fromExists = floor.corners.some((c) => c.id === action.from);
        const toExists = floor.corners.some((c) => c.id === action.to);
        if (!fromExists || !toExists) {
          fail(
            "WALL_REFERENCES_MISSING_CORNER",
            `Wall ${action.wallId} references missing corners`,
          );
        }
        const wall: Wall = {
          id: action.wallId,
          from: action.from,
          to: action.to,
          thicknessMm: action.thicknessMm ?? 110,
          isExterior: action.isExterior ?? false,
          height: action.height,
        };
        return { ...floor, walls: [...floor.walls, wall] };
      });

    case "DELETE_WALL":
      return mapActiveFloor(graph, (floor) => {
        if (!floor.walls.some((w) => w.id === action.wallId)) {
          fail("WALL_NOT_FOUND", `Wall ${action.wallId} not found`);
        }
        return {
          ...floor,
          walls: floor.walls.filter((w) => w.id !== action.wallId),
          openings: floor.openings.filter((o) => o.wallId !== action.wallId),
        };
      });

    case "SPLIT_WALL_AT_CORNER":
      return mapActiveFloor(graph, (floor) => {
        const wall = floor.walls.find((w) => w.id === action.wallId);
        if (!wall) fail("WALL_NOT_FOUND", `Wall ${action.wallId} not found`);
        if (floor.corners.some((c) => c.id === action.newCornerId)) {
          fail("DUPLICATE_ID", `Corner ${action.newCornerId} already exists`);
        }
        const newCorner: Corner = {
          id: action.newCornerId,
          x: action.x,
          y: action.y,
        };
        const segmentA: Wall = {
          ...wall!,
          to: action.newCornerId,
        };
        const segmentB: Wall = {
          ...wall!,
          id: action.newWallId,
          from: action.newCornerId,
          to: wall!.to,
        };
        return {
          ...floor,
          corners: [...floor.corners, newCorner],
          walls: [
            ...floor.walls.filter((w) => w.id !== action.wallId),
            segmentA,
            segmentB,
          ],
          // Openings attached to the split wall stay on segmentA; if their
          // positionM puts them past the split point, move them to segmentB.
          openings: redistributeOpenings(
            floor,
            wall!,
            segmentA,
            segmentB,
            newCorner,
          ),
        };
      });

    case "ADD_OPENING":
      return mapActiveFloor(graph, (floor) => {
        if (floor.openings.some((o) => o.id === action.openingId)) {
          fail("DUPLICATE_ID", `Opening ${action.openingId} already exists`);
        }
        const wall = floor.walls.find((w) => w.id === action.wallId);
        if (!wall) {
          fail("WALL_NOT_FOUND", `Wall ${action.wallId} not found`);
        }
        const length = wallLengthM(floor, wall!);
        if (
          action.positionM < 0 ||
          action.positionM + action.widthM > length
        ) {
          fail(
            "OPENING_OFF_WALL_END",
            `Opening overflow: pos ${action.positionM}m, width ${action.widthM}m, wall length ${length.toFixed(2)}m`,
          );
        }
        const opening: Opening = {
          id: action.openingId,
          wallId: action.wallId,
          type: action.openingType,
          positionM: action.positionM,
          widthM: action.widthM,
          heightM: action.heightM,
          sillHeightM: action.sillHeightM,
        };
        return { ...floor, openings: [...floor.openings, opening] };
      });

    case "MOVE_OPENING":
      return mapActiveFloor(graph, (floor) => {
        const opening = floor.openings.find((o) => o.id === action.openingId);
        if (!opening) {
          fail("OPENING_NOT_FOUND", `Opening ${action.openingId} not found`);
        }
        const next: Opening = {
          ...opening!,
          positionM: action.positionM ?? opening!.positionM,
          widthM: action.widthM ?? opening!.widthM,
        };
        const wall = floor.walls.find((w) => w.id === next.wallId);
        if (!wall) {
          fail("WALL_NOT_FOUND", `Wall ${next.wallId} not found`);
        }
        const length = wallLengthM(floor, wall!);
        if (next.positionM < 0 || next.positionM + next.widthM > length) {
          fail(
            "OPENING_OFF_WALL_END",
            `Opening overflow after move: pos ${next.positionM}m, width ${next.widthM}m, wall length ${length.toFixed(2)}m`,
          );
        }
        return {
          ...floor,
          openings: floor.openings.map((o) =>
            o.id === action.openingId ? next : o,
          ),
        };
      });

    case "DELETE_OPENING":
      return mapActiveFloor(graph, (floor) => {
        if (!floor.openings.some((o) => o.id === action.openingId)) {
          fail(
            "OPENING_NOT_FOUND",
            `Opening ${action.openingId} not found`,
          );
        }
        return {
          ...floor,
          openings: floor.openings.filter((o) => o.id !== action.openingId),
        };
      });

    case "LABEL_ROOM":
      return mapActiveFloor(graph, (floor) => {
        const room = floor.rooms.find((r) => r.id === action.roomId);
        if (!room) fail("ROOM_NOT_FOUND", `Room ${action.roomId} not found`);
        return {
          ...floor,
          rooms: floor.rooms.map((r) =>
            r.id === action.roomId
              ? { ...r, label: action.label, roomType: action.roomType ?? r.roomType }
              : r,
          ),
        };
      }, { skipFaceFinder: true });

    case "SET_SCALE":
      if (action.pxPerMetre <= 0) {
        fail("INVALID_SCALE", `pxPerMetre must be positive`);
      }
      return {
        ...graph,
        scale: {
          pxPerMetre: action.pxPerMetre,
          calibratedAt: new Date().toISOString(),
          method: action.method ?? graph.scale.method,
        },
        floors: graph.floors.map((f) =>
          f.id === graph.activeFloorId
            ? recalcRooms({ ...f, pxPerMetre: action.pxPerMetre })
            : f,
        ),
      };

    case "ADD_FLOOR": {
      if (graph.floors.some((f) => f.id === action.floorId)) {
        fail("DUPLICATE_ID", `Floor ${action.floorId} already exists`);
      }
      const newFloor: Floor = {
        id: action.floorId,
        floorIndex: action.floorIndex,
        floorLabel: action.floorLabel,
        pxPerMetre: graph.scale.pxPerMetre,
        northRotationDeg: 0,
        sourceType: "manual",
        corners: [],
        walls: [],
        openings: [],
        rooms: [],
      };
      return { ...graph, floors: [...graph.floors, newFloor] };
    }

    case "SET_ACTIVE_FLOOR":
      if (!graph.floors.some((f) => f.id === action.floorId)) {
        fail("FLOOR_NOT_FOUND", `Floor ${action.floorId} not found`);
      }
      return { ...graph, activeFloorId: action.floorId };

    case "REPLACE_FLOOR":
      if (!graph.floors.some((f) => f.id === action.floor.id)) {
        fail("FLOOR_NOT_FOUND", `Floor ${action.floor.id} not found`);
      }
      return {
        ...graph,
        floors: graph.floors.map((f) =>
          f.id === action.floor.id ? recalcRooms(action.floor) : f,
        ),
      };

    case "REPLACE_GRAPH":
      return {
        ...action.graph,
        floors: action.graph.floors.map(recalcRooms),
      };

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${String(_exhaustive)}`);
    }
  }
}

/* ─── Undo / redo wrapper ────────────────────────────────────────────────── */

export interface HistoryState {
  past: WallGraph[];
  present: WallGraph;
  future: WallGraph[];
}

/** Maximum undo depth — matches V2's 50-state cap. */
const MAX_HISTORY = 50;

export function newHistory(graph: WallGraph): HistoryState {
  return { past: [], present: graph, future: [] };
}

export function applyAction(
  state: HistoryState,
  action: WallGraphAction,
): HistoryState {
  const next = reduce(state.present, action);
  const past = [...state.past, state.present].slice(-MAX_HISTORY);
  return { past, present: next, future: [] };
}

export function undo(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redo(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state;
  const [next, ...rest] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future: rest,
  };
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function mapActiveFloor(
  graph: WallGraph,
  fn: (floor: Floor) => Floor,
  opts: { skipFaceFinder?: boolean } = {},
): WallGraph {
  const active = getActiveFloor(graph);
  const updatedRaw = fn(active);
  const updated = opts.skipFaceFinder ? updatedRaw : recalcRooms(updatedRaw);
  return {
    ...graph,
    floors: graph.floors.map((f) => (f.id === active.id ? updated : f)),
  };
}

function recalcRooms(floor: Floor): Floor {
  return { ...floor, rooms: deriveRooms(floor) };
}

function wallLengthM(floor: Floor, wall: Wall): number {
  const from = floor.corners.find((c) => c.id === wall.from);
  const to = floor.corners.find((c) => c.id === wall.to);
  if (!from || !to) return 0;
  const px = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
  return px / floor.pxPerMetre;
}

function redistributeOpenings(
  floor: Floor,
  oldWall: Wall,
  segmentA: Wall,
  segmentB: Wall,
  newCorner: Corner,
): Opening[] {
  const fromCorner = floor.corners.find((c) => c.id === oldWall.from);
  if (!fromCorner) return floor.openings;
  const splitPx = Math.sqrt(
    (newCorner.x - fromCorner.x) ** 2 + (newCorner.y - fromCorner.y) ** 2,
  );
  const splitM = splitPx / floor.pxPerMetre;

  return floor.openings.map((o) => {
    if (o.wallId !== oldWall.id) return o;
    if (o.positionM + o.widthM <= splitM) {
      return { ...o, wallId: segmentA.id };
    }
    return {
      ...o,
      wallId: segmentB.id,
      positionM: Math.max(0, o.positionM - splitM),
    };
  });
}
