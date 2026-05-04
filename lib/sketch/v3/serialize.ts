/**
 * serialize.ts — JSON ↔ WallGraph round-trip + Prisma write helpers.
 *
 * Wire format is a snapshot of the wall-graph at a point in time. We persist:
 *   - relational rows (FloorPlanV3 + Corner/Wall/Opening/Room) as the source of
 *     truth for queries
 *   - a JSON blob in `ClaimSketch.sketchData` as a fast-load cache
 *
 * `toJSON` and `fromJSON` operate on the cache blob. `toPrismaWrite` emits the
 * relational diff actions needed to upsert from a graph state. The diff layer
 * is intentionally simple — full replace per floor — because graphs are bounded
 * (typical floor: <200 corners, <250 walls) and partial-diff complexity isn't
 * justified at this scale.
 */

import type {
  Floor,
  Opening,
  WallGraph,
  Wall,
  Corner,
  Room,
} from "./wall-graph-types";
import { isValidGraph } from "./wall-graph-types";

/** Wire-format version stamp; bump on breaking shape changes. */
const WIRE_VERSION = 3 as const;

export interface WallGraphWire {
  version: 3;
  scale: WallGraph["scale"];
  floors: Floor[];
  activeFloorId: string;
}

/**
 * Serialise a graph for the `ClaimSketch.sketchData` JSON cache.
 *
 * No transformation today — the in-memory shape and wire shape are identical —
 * but the indirection means we can evolve them independently.
 */
export function toJSON(graph: WallGraph): WallGraphWire {
  return {
    version: WIRE_VERSION,
    scale: { ...graph.scale },
    floors: graph.floors.map(cloneFloor),
    activeFloorId: graph.activeFloorId,
  };
}

export class WallGraphParseError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${message} at ${path}`);
    this.name = "WallGraphParseError";
  }
}

/**
 * Parse a wire-format blob into a WallGraph. Throws on shape or version
 * mismatches. Does *not* run topology validation — call `validateGraph` after
 * if you need that.
 */
export function fromJSON(input: unknown): WallGraph {
  if (!isObject(input)) {
    throw new WallGraphParseError("expected object", "$");
  }
  const version = (input as Record<string, unknown>).version;
  if (version !== WIRE_VERSION) {
    throw new WallGraphParseError(
      `unsupported version ${String(version)}; expected ${WIRE_VERSION}`,
      "$.version",
    );
  }

  const scale = (input as Record<string, unknown>).scale;
  if (!isObject(scale)) throw new WallGraphParseError("missing scale", "$.scale");

  const floorsRaw = (input as Record<string, unknown>).floors;
  if (!Array.isArray(floorsRaw) || floorsRaw.length === 0) {
    throw new WallGraphParseError("floors must be non-empty array", "$.floors");
  }

  const activeFloorId = (input as Record<string, unknown>).activeFloorId;
  if (typeof activeFloorId !== "string") {
    throw new WallGraphParseError(
      "activeFloorId must be string",
      "$.activeFloorId",
    );
  }

  const floors = floorsRaw.map((f, i) => parseFloor(f, `$.floors[${i}]`));
  if (!floors.some((f) => f.id === activeFloorId)) {
    throw new WallGraphParseError(
      "activeFloorId does not match any floor",
      "$.activeFloorId",
    );
  }

  return {
    version: 3,
    scale: {
      pxPerMetre: numberAt(scale, "pxPerMetre", "$.scale.pxPerMetre"),
      calibratedAt: stringAt(scale, "calibratedAt", "$.scale.calibratedAt"),
      method: stringAt(scale, "method", "$.scale.method") as
        | "manual"
        | "geoscape"
        | "image_import",
    },
    floors,
    activeFloorId,
  };
}

/* ─── Prisma write planning ──────────────────────────────────────────────── */

/**
 * Plain serialisable rows ready to be persisted by the API layer. The API
 * layer holds the live Prisma client; this module stays free of `@/lib/prisma`
 * so it can be unit-tested without spinning up a database.
 */
export interface PrismaWritePlan {
  floorPlans: Array<{
    id: string;
    floorIndex: number;
    floorLabel: string;
    pxPerMetre: number;
    northRotationDeg: number;
    origin: { lat: number; lng: number } | null;
    geoTransform: Floor["geoTransform"] | null;
    sourceType: Floor["sourceType"];
    sourceFootprintId: string | null;
  }>;
  corners: Array<Corner & { floorPlanId: string }>;
  walls: Array<Wall & { floorPlanId: string }>;
  openings: Array<Opening & { floorPlanId: string }>;
  rooms: Array<{
    id: string;
    floorPlanId: string;
    label: string;
    roomType: string | null;
    cornerCycle: string[];
    centroidX: number;
    centroidY: number;
    areaM2: number;
    metadata: Record<string, unknown> | null;
  }>;
}

/**
 * Plan the relational write for a graph. The API layer wraps the actual
 * Prisma calls in a transaction.
 */
export function toPrismaWrite(graph: WallGraph): PrismaWritePlan {
  const plan: PrismaWritePlan = {
    floorPlans: [],
    corners: [],
    walls: [],
    openings: [],
    rooms: [],
  };

  for (const floor of graph.floors) {
    plan.floorPlans.push({
      id: floor.id,
      floorIndex: floor.floorIndex,
      floorLabel: floor.floorLabel,
      pxPerMetre: floor.pxPerMetre,
      northRotationDeg: floor.northRotationDeg,
      origin: floor.origin ?? null,
      geoTransform: floor.geoTransform ?? null,
      sourceType: floor.sourceType,
      sourceFootprintId: floor.sourceFootprintId ?? null,
    });
    for (const c of floor.corners) {
      plan.corners.push({ ...c, floorPlanId: floor.id });
    }
    for (const w of floor.walls) {
      plan.walls.push({ ...w, floorPlanId: floor.id });
    }
    for (const o of floor.openings) {
      plan.openings.push({ ...o, floorPlanId: floor.id });
    }
    for (const r of floor.rooms) {
      plan.rooms.push({
        id: r.id,
        floorPlanId: floor.id,
        label: r.label,
        roomType: r.roomType ?? null,
        cornerCycle: r.cornerCycle,
        centroidX: r.centroid.x,
        centroidY: r.centroid.y,
        areaM2: r.areaM2,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      });
    }
  }

  return plan;
}

/* ─── Round-trip helper used by tests + offline-queue ────────────────────── */

export function isParsableWireFormat(value: unknown): boolean {
  try {
    const parsed = fromJSON(value);
    return isValidGraph(parsed) || true; // structural parse succeeded
  } catch {
    return false;
  }
}

/* ─── parsing primitives ─────────────────────────────────────────────────── */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberAt(o: unknown, key: string, path: string): number {
  if (!isObject(o) || typeof o[key] !== "number") {
    throw new WallGraphParseError(`expected number at ${key}`, path);
  }
  return o[key] as number;
}

function stringAt(o: unknown, key: string, path: string): string {
  if (!isObject(o) || typeof o[key] !== "string") {
    throw new WallGraphParseError(`expected string at ${key}`, path);
  }
  return o[key] as string;
}

function parseFloor(input: unknown, path: string): Floor {
  if (!isObject(input)) {
    throw new WallGraphParseError("expected object", path);
  }
  const corners = (input.corners as unknown[]) ?? [];
  const walls = (input.walls as unknown[]) ?? [];
  const openings = (input.openings as unknown[]) ?? [];
  const rooms = (input.rooms as unknown[]) ?? [];

  if (!Array.isArray(corners)) {
    throw new WallGraphParseError("corners must be array", `${path}.corners`);
  }
  if (!Array.isArray(walls)) {
    throw new WallGraphParseError("walls must be array", `${path}.walls`);
  }
  if (!Array.isArray(openings)) {
    throw new WallGraphParseError("openings must be array", `${path}.openings`);
  }
  if (!Array.isArray(rooms)) {
    throw new WallGraphParseError("rooms must be array", `${path}.rooms`);
  }

  return {
    id: stringAt(input, "id", `${path}.id`),
    floorIndex: numberAt(input, "floorIndex", `${path}.floorIndex`),
    floorLabel: stringAt(input, "floorLabel", `${path}.floorLabel`),
    pxPerMetre: numberAt(input, "pxPerMetre", `${path}.pxPerMetre`),
    northRotationDeg: numberAt(
      input,
      "northRotationDeg",
      `${path}.northRotationDeg`,
    ),
    origin: input.origin as Floor["origin"],
    geoTransform: input.geoTransform as Floor["geoTransform"],
    sourceType: stringAt(input, "sourceType", `${path}.sourceType`) as Floor["sourceType"],
    sourceFootprintId:
      typeof input.sourceFootprintId === "string"
        ? input.sourceFootprintId
        : undefined,
    corners: corners.map((c, i) => parseCorner(c, `${path}.corners[${i}]`)),
    walls: walls.map((w, i) => parseWall(w, `${path}.walls[${i}]`)),
    openings: openings.map((o, i) => parseOpening(o, `${path}.openings[${i}]`)),
    rooms: rooms.map((r, i) => parseRoom(r, `${path}.rooms[${i}]`)),
  };
}

function parseCorner(input: unknown, path: string): Corner {
  if (!isObject(input)) throw new WallGraphParseError("expected object", path);
  return {
    id: stringAt(input, "id", `${path}.id`),
    x: numberAt(input, "x", `${path}.x`),
    y: numberAt(input, "y", `${path}.y`),
    locked: typeof input.locked === "boolean" ? input.locked : undefined,
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
}

function parseWall(input: unknown, path: string): Wall {
  if (!isObject(input)) throw new WallGraphParseError("expected object", path);
  return {
    id: stringAt(input, "id", `${path}.id`),
    from: stringAt(input, "from", `${path}.from`),
    to: stringAt(input, "to", `${path}.to`),
    thicknessMm: numberAt(input, "thicknessMm", `${path}.thicknessMm`),
    isExterior:
      typeof input.isExterior === "boolean" ? input.isExterior : false,
    height: typeof input.height === "number" ? input.height : undefined,
    finishLeft:
      typeof input.finishLeft === "string" ? input.finishLeft : undefined,
    finishRight:
      typeof input.finishRight === "string" ? input.finishRight : undefined,
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
}

function parseOpening(input: unknown, path: string): Opening {
  if (!isObject(input)) throw new WallGraphParseError("expected object", path);
  return {
    id: stringAt(input, "id", `${path}.id`),
    wallId: stringAt(input, "wallId", `${path}.wallId`),
    type: stringAt(input, "type", `${path}.type`) as Opening["type"],
    positionM: numberAt(input, "positionM", `${path}.positionM`),
    widthM: numberAt(input, "widthM", `${path}.widthM`),
    heightM: typeof input.heightM === "number" ? input.heightM : undefined,
    sillHeightM:
      typeof input.sillHeightM === "number" ? input.sillHeightM : undefined,
    swingDir:
      typeof input.swingDir === "string"
        ? (input.swingDir as Opening["swingDir"])
        : undefined,
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
}

function parseRoom(input: unknown, path: string): Room {
  if (!isObject(input)) throw new WallGraphParseError("expected object", path);
  const cycle = input.cornerCycle;
  if (!Array.isArray(cycle) || !cycle.every((id) => typeof id === "string")) {
    throw new WallGraphParseError(
      "cornerCycle must be string[]",
      `${path}.cornerCycle`,
    );
  }
  const centroid = input.centroid;
  if (!isObject(centroid)) {
    throw new WallGraphParseError("centroid must be object", `${path}.centroid`);
  }
  return {
    id: stringAt(input, "id", `${path}.id`),
    cornerCycle: cycle as string[],
    label: stringAt(input, "label", `${path}.label`),
    roomType:
      typeof input.roomType === "string" ? input.roomType : undefined,
    areaM2: numberAt(input, "areaM2", `${path}.areaM2`),
    centroid: {
      x: numberAt(centroid, "x", `${path}.centroid.x`),
      y: numberAt(centroid, "y", `${path}.centroid.y`),
    },
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
}

function cloneFloor(floor: Floor): Floor {
  return {
    ...floor,
    origin: floor.origin ? { ...floor.origin } : undefined,
    geoTransform: floor.geoTransform ? { ...floor.geoTransform } : undefined,
    corners: floor.corners.map((c) => ({ ...c })),
    walls: floor.walls.map((w) => ({ ...w })),
    openings: floor.openings.map((o) => ({ ...o })),
    rooms: floor.rooms.map((r) => ({
      ...r,
      cornerCycle: [...r.cornerCycle],
      centroid: { ...r.centroid },
    })),
  };
}
