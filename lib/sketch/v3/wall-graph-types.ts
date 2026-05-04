/**
 * Wall-graph types for Sketch V3.
 *
 * Topology: corners + walls + openings + derived rooms. Replaces the V2
 * polygon-per-room model so adjacent rooms share walls and openings can be
 * placed on a wall (Encircle-style) instead of being free-floating shapes.
 *
 * Coordinates are canvas pixels at the current floor's `pxPerMetre` scale.
 * Real-world distances are derived; px is authoritative on disk.
 */

export type Cuid = string;

export type OpeningType = "DOOR" | "WINDOW" | "OPEN_PASS" | "GARAGE_DOOR";

export type SwingDir = "LEFT_IN" | "RIGHT_IN" | "LEFT_OUT" | "RIGHT_OUT";

export type SourceType =
  | "manual"
  | "geoscape"
  | "nearmap"
  | "image_import"
  | "v2_migrated";

export type ScaleMethod = "manual" | "geoscape" | "image_import";

export interface LatLng {
  lat: number;
  lng: number;
}

/** 2x3 affine matrix for WGS84 ↔ canvas conversion. */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface Corner {
  id: Cuid;
  x: number;
  y: number;
  /** Pinned during auto-snap and bulk transforms. */
  locked?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Wall {
  id: Cuid;
  from: Cuid;
  to: Cuid;
  /** Stud-wall thickness in millimetres. AU default 110. */
  thicknessMm: number;
  isExterior: boolean;
  /** Floor-to-ceiling height in metres. */
  height?: number;
  finishLeft?: string;
  finishRight?: string;
  metadata?: Record<string, unknown>;
}

export interface Opening {
  id: Cuid;
  wallId: Cuid;
  type: OpeningType;
  /** Distance along the wall from `from` corner, in metres. */
  positionM: number;
  widthM: number;
  heightM?: number;
  /** Window only — sill height above floor in metres. */
  sillHeightM?: number;
  swingDir?: SwingDir;
  metadata?: Record<string, unknown>;
}

export interface Room {
  id: Cuid;
  /** Ordered corner ids forming a closed face. Derived; never authoritative. */
  cornerCycle: Cuid[];
  label: string;
  roomType?: string;
  areaM2: number;
  centroid: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface Floor {
  id: Cuid;
  floorIndex: number;
  floorLabel: string;
  pxPerMetre: number;
  northRotationDeg: number;
  origin?: LatLng;
  geoTransform?: AffineTransform;
  sourceType: SourceType;
  sourceFootprintId?: string;
  corners: Corner[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
}

export interface WallGraph {
  version: 3;
  scale: {
    pxPerMetre: number;
    calibratedAt: string;
    method: ScaleMethod;
  };
  floors: Floor[];
  activeFloorId: Cuid;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

export function emptyFloor(opts: {
  id: Cuid;
  floorIndex?: number;
  floorLabel?: string;
  pxPerMetre?: number;
  sourceType?: SourceType;
}): Floor {
  return {
    id: opts.id,
    floorIndex: opts.floorIndex ?? 0,
    floorLabel: opts.floorLabel ?? "Ground Floor",
    pxPerMetre: opts.pxPerMetre ?? 100,
    northRotationDeg: 0,
    sourceType: opts.sourceType ?? "manual",
    corners: [],
    walls: [],
    openings: [],
    rooms: [],
  };
}

export function emptyGraph(floorId: Cuid, pxPerMetre = 100): WallGraph {
  return {
    version: 3,
    scale: {
      pxPerMetre,
      calibratedAt: new Date().toISOString(),
      method: "manual",
    },
    floors: [emptyFloor({ id: floorId, pxPerMetre })],
    activeFloorId: floorId,
  };
}

export function getActiveFloor(graph: WallGraph): Floor {
  const floor = graph.floors.find((f) => f.id === graph.activeFloorId);
  if (!floor) {
    throw new Error(
      `WallGraph activeFloorId=${graph.activeFloorId} not found in floors`,
    );
  }
  return floor;
}

/* ─── Validation ──────────────────────────────────────────────────────────── */

export interface ValidationIssue {
  code:
    | "ORPHAN_CORNER"
    | "DANGLING_WALL"
    | "OPENING_OFF_WALL"
    | "OPENING_OVERLAPS_END"
    | "DUPLICATE_WALL"
    | "EMPTY_GRAPH";
  message: string;
  refIds: string[];
}

/**
 * Distance between two corners, used by validators.
 * Duplicated in geometry-utils as `distance` — re-exported here to keep the
 * pure-validator file self-contained.
 */
function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Validate a single floor's invariants.
 *
 *  - every corner referenced by ≥1 wall (no orphans)
 *  - every wall references corners that exist
 *  - opening positionM + widthM ≤ wall length
 *  - no duplicate walls (same corner pair, either direction)
 */
export function validateFloor(floor: Floor): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cornerById = new Map(floor.corners.map((c) => [c.id, c]));
  const cornerWallCount = new Map<Cuid, number>();
  const wallKeySet = new Set<string>();

  for (const wall of floor.walls) {
    const from = cornerById.get(wall.from);
    const to = cornerById.get(wall.to);
    if (!from || !to) {
      issues.push({
        code: "DANGLING_WALL",
        message: `Wall ${wall.id} references missing corner(s)`,
        refIds: [wall.id, wall.from, wall.to],
      });
      continue;
    }
    cornerWallCount.set(wall.from, (cornerWallCount.get(wall.from) ?? 0) + 1);
    cornerWallCount.set(wall.to, (cornerWallCount.get(wall.to) ?? 0) + 1);

    const key =
      wall.from < wall.to
        ? `${wall.from}|${wall.to}`
        : `${wall.to}|${wall.from}`;
    if (wallKeySet.has(key)) {
      issues.push({
        code: "DUPLICATE_WALL",
        message: `Duplicate wall between corners ${wall.from} and ${wall.to}`,
        refIds: [wall.id],
      });
    }
    wallKeySet.add(key);
  }

  for (const corner of floor.corners) {
    if (!cornerWallCount.has(corner.id)) {
      issues.push({
        code: "ORPHAN_CORNER",
        message: `Corner ${corner.id} not referenced by any wall`,
        refIds: [corner.id],
      });
    }
  }

  const wallById = new Map(floor.walls.map((w) => [w.id, w]));
  for (const opening of floor.openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) {
      issues.push({
        code: "OPENING_OFF_WALL",
        message: `Opening ${opening.id} references missing wall ${opening.wallId}`,
        refIds: [opening.id, opening.wallId],
      });
      continue;
    }
    const from = cornerById.get(wall.from);
    const to = cornerById.get(wall.to);
    if (!from || !to) continue;
    const wallLengthPx = dist(from, to);
    const wallLengthM = wallLengthPx / floor.pxPerMetre;
    if (opening.positionM < 0 || opening.positionM + opening.widthM > wallLengthM) {
      issues.push({
        code: "OPENING_OVERLAPS_END",
        message: `Opening ${opening.id} (pos=${opening.positionM}m, w=${opening.widthM}m) overflows wall length ${wallLengthM.toFixed(2)}m`,
        refIds: [opening.id, wall.id],
      });
    }
  }

  return issues;
}

/** Validate every floor in the graph. */
export function validateGraph(graph: WallGraph): ValidationIssue[] {
  if (graph.floors.length === 0) {
    return [
      { code: "EMPTY_GRAPH", message: "Graph has no floors", refIds: [] },
    ];
  }
  return graph.floors.flatMap(validateFloor);
}

/** Returns true when the graph passes validation. */
export function isValidGraph(graph: WallGraph): boolean {
  return validateGraph(graph).length === 0;
}
