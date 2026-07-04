/**
 * RA-6759 — pure descriptor factory for the Sketch canvas tools.
 *
 * SketchCanvas declares ToolMode values (room/line/text/arrow/measure/photo)
 * but historically only wired freehand/select/pan. This module defines, in a
 * Fabric-free and therefore unit-testable way, exactly which object each tool
 * produces and which custom `data` it persists.
 *
 * `data.type` is the contract consumed downstream:
 *   - {wall, opening, room, fixture} → decomposed into SketchElement rows
 *     (lib/sketch/decompose-elements.ts) for measured quantities.
 *   - {text, arrow, measure, photo}  → annotations (never measured).
 * `provenance` defaults to "operator_measured" for technician-drawn geometry;
 * RA-6760 tightens imported/AI geometry to a non-measured provenance.
 *
 * The canvas only has to materialize the returned descriptor into a Fabric
 * object — all geometry/units/data logic lives here where it can be tested.
 *
 * RA-6841 [A2]: door + window tools added. Opening descriptors carry
 * `data.type: "opening"` and are EXCLUDED from measured area (the
 * totalMeasuredFloorAreaM2 guard only sums type === "room" elements).
 */
import type { ToolMode } from "@/components/sketch/SketchCanvas";
import { shoelaceAreaPx2, px2ToM2, centroid } from "@/lib/sketch/geometry-utils";
import {
  doorGeometry,
  doorArcPath,
  windowGeometry,
  parametricPositionOnSegment,
  type HingeSide,
} from "@/lib/sketch/opening-geometry";

export interface Point {
  x: number;
  y: number;
}

/** Canvas default: 100px = 1m (mirrors lib/sketch decompose + extract-rooms). */
export const DEFAULT_PX_PER_METRE = 100;

/**
 * RA-6840 [A1] — architectural wall thickness presets (metres). Presentation
 * only: rendered as the stroke band width on the room/wall descriptor. The
 * measured centerline geometry (polygon `points` / line endpoints) is never
 * touched, so area/scope decomposition is unchanged.
 */
export const WALL_THICKNESS_INTERNAL_M = 0.11; // ~110mm internal partition
export const WALL_THICKNESS_EXTERNAL_M = 0.23; // ~230mm external/party wall

export function metresToPx(
  m: number,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number {
  const scale = pxPerMetre || DEFAULT_PX_PER_METRE;
  return m * scale;
}

/** Brand palette (CLAUDE.md): primary, secondary, accent. */
const PRIMARY = "#1C2E47";
const SECONDARY = "#8A6B4E";
const ACCENT = "#D4A574";

export type ToolObjectKind =
  | "polygon"
  | "line"
  | "itext"
  | "arrow"
  | "measure"
  | "photo-marker"
  // RA-6841 [A2]: architectural opening symbols
  | "door-opening"
  | "window-opening";

export interface ToolObjectDescriptor {
  kind: ToolObjectKind;
  /** Fabric constructor props (points / x1.. / left,top, styling). */
  props: Record<string, unknown>;
  /** Custom data persisted on the object — drives selection + decomposition. */
  data: Record<string, unknown>;
  /** Secondary label (measure tool draws a dimension caption). */
  label?: { text: string; left: number; top: number };
}

export interface DescribeInput {
  tool: ToolMode;
  points: Point[];
  pxPerMetre?: number;
  /** Initial text for the text tool (defaults to a placeholder). */
  text?: string;
  /**
   * RA-6841 [A2] door tool: which side the hinge is on (default "left").
   * "left" = hinge at the first endpoint along the wall direction; "right" = second.
   */
  hingeSide?: HingeSide;
  /**
   * RA-6841 [A2] door + window: opening width in metres (default 0.82m for
   * doors, 1.0m for windows). Converted to px via pxPerMetre.
   */
  openingWidthM?: number;
  /**
   * RA-6841 [A2] door + window: rendered wall band thickness in px (used to
   * size the glazing lines and opening cut). Defaults to the internal wall
   * thickness (WALL_THICKNESS_INTERNAL_M × pxPerMetre).
   */
  wallThicknessPx?: number;
  /**
   * RA-6841 [A2] door + window: the host wall segment that the opening is
   * placed on. The canvas resolves this by snapping the click point to the
   * nearest wall line and passing its endpoints here. When absent the first
   * two points are treated as the wall segment (wallA = points[0], wallB =
   * points[1]) so a standalone test can call the factory without a live canvas.
   */
  wallSegment?: { a: Point; b: Point };
  /**
   * RA-6980 [A2b] parent–child binding: the stable id of the host wall the
   * opening is placed on. Stored on the opening's `data.hostWallId` so the
   * canvas can re-anchor the opening when that wall is later moved/resized.
   * The factory also derives `data.hostWallT` (parametric position along the
   * wall) from the anchor so the re-anchor is a pure `pointAtParametric` lookup.
   */
  hostWallId?: string;
}

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pxToMetres(
  px: number,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number {
  const scale = pxPerMetre || DEFAULT_PX_PER_METRE;
  return px / scale;
}

export function formatMetres(m: number): string {
  return `${m.toFixed(2)} m`;
}

/**
 * RA-6843 [A4] — on-canvas room caption. Auto-computed area (1dp m²) is always
 * shown; an optional operator-set room name prefixes it as "Name · 14.1 m²".
 * Kept pure so the live-resize sync in SketchCanvas and unit tests share it.
 */
export function formatRoomLabel(
  name: string | null | undefined,
  areaM2: number,
): string {
  const area = `${areaM2.toFixed(1)} m²`;
  const trimmed = (name ?? "").trim();
  return trimmed ? `${trimmed} · ${area}` : area;
}

/**
 * RA-6843 [A4] — measured area for a drawn room polygon, in m². Shoelace over
 * the centerline `points` (identical to decompose-elements / extract-rooms), so
 * the caption can never disagree with the billed/scoped quantity. Returns 0 for
 * degenerate (< 3 vertex) geometry.
 */
export function roomAreaM2(points: Point[], pxPerMetre = DEFAULT_PX_PER_METRE): number {
  if (points.length < 3) return 0;
  return px2ToM2(shoelaceAreaPx2(points), pxPerMetre || DEFAULT_PX_PER_METRE);
}

export function arrowAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a descriptor for the given tool + collected geometry, or null if the
 * geometry is insufficient (e.g. a room with < 3 vertices) or the tool is
 * handled natively (select / freehand / pan).
 */
export function describeToolObject(
  input: DescribeInput,
): ToolObjectDescriptor | null {
  const { tool, points } = input;
  const pxPerMetre = input.pxPerMetre ?? DEFAULT_PX_PER_METRE;

  switch (tool) {
    case "room": {
      if (points.length < 3) return null;
      // RA-6843 [A4]: auto-computed measured area (shoelace) drives a centered
      // "Name · 14.1 m²" caption. Area is persisted on `data` so the canvas
      // live-resize sync and PDF can read it without re-deriving. Only
      // operator_measured rooms get this — the A0 firewall keeps imported
      // (underlay_reference) rooms out of measured quantities.
      const areaM2 = round2(roomAreaM2(points, pxPerMetre));
      const c = centroid(points);
      // RA-6840 [A1]: draw the perimeter as a filled wall band (thick mitred
      // stroke centered on the centerline) so the room reads as an
      // architectural floor plan, not a 2px wireframe. `points` stay the
      // measured centerline — area calc (shoelace) is unaffected.
      return {
        kind: "polygon",
        props: {
          points,
          fill: "rgba(28,46,71,0.08)",
          stroke: PRIMARY,
          strokeWidth: metresToPx(WALL_THICKNESS_INTERNAL_M, pxPerMetre),
          strokeLineJoin: "miter",
          strokeMiterLimit: 10,
          strokeUniform: true,
          objectCaching: false,
        },
        data: { type: "room", provenance: "operator_measured", areaM2 },
        label: {
          text: formatRoomLabel(input.text, areaM2),
          left: c.x,
          top: c.y,
        },
      };
    }

    case "line": {
      if (points.length < 2) return null;
      const [a, b] = points;
      const lengthM = round2(pxToMetres(distancePx(a, b), pxPerMetre));
      // RA-6840 [A1]: render the standalone wall tool with real thickness
      // (square caps so abutting walls overlap cleanly). Endpoints stay the
      // measured centerline; lengthM is unaffected.
      return {
        kind: "line",
        props: {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: PRIMARY,
          strokeWidth: metresToPx(WALL_THICKNESS_INTERNAL_M, pxPerMetre),
          strokeLineCap: "square",
          strokeUniform: true,
        },
        data: { type: "wall", provenance: "operator_measured", lengthM },
      };
    }

    case "measure": {
      if (points.length < 2) return null;
      const [a, b] = points;
      const lengthM = round2(pxToMetres(distancePx(a, b), pxPerMetre));
      return {
        kind: "measure",
        props: {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: SECONDARY,
          strokeWidth: 2,
          strokeDashArray: [6, 4],
        },
        data: { type: "measure", lengthM },
        label: {
          text: formatMetres(lengthM),
          left: (a.x + b.x) / 2,
          top: (a.y + b.y) / 2,
        },
      };
    }

    case "text": {
      if (points.length < 1) return null;
      const [p] = points;
      return {
        kind: "itext",
        props: {
          left: p.x,
          top: p.y,
          text: input.text ?? "Label",
          fontSize: 18,
          fill: PRIMARY,
          fontFamily: "sans-serif",
        },
        data: { type: "text" },
      };
    }

    case "arrow": {
      if (points.length < 2) return null;
      const [a, b] = points;
      return {
        kind: "arrow",
        props: {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: PRIMARY,
          strokeWidth: 3,
        },
        data: { type: "arrow", angle: round2(arrowAngleDeg(a, b)) },
      };
    }

    case "photo": {
      if (points.length < 1) return null;
      const [p] = points;
      return {
        kind: "photo-marker",
        props: {
          left: p.x,
          top: p.y,
          radius: 10,
          fill: ACCENT,
          stroke: PRIMARY,
          strokeWidth: 2,
        },
        data: { type: "photo" },
      };
    }

    // RA-6841 [A2]: Door — opening cut + leaf line + quarter-circle swing arc.
    // points[0] = anchor on the wall. The host wall segment is supplied via
    // `input.wallSegment` (canvas-resolved) or inferred as points[0..1].
    // data.type = "opening" → excluded from measured area by provenance guard.
    case "door": {
      if (points.length < 1) return null;
      const anchor = points[0];
      const wall = input.wallSegment ??
        (points.length >= 2
          ? { a: points[0], b: points[1] }
          : { a: { x: anchor.x, y: anchor.y }, b: { x: anchor.x + 1, y: anchor.y } });
      const widthM = input.openingWidthM ?? 0.82;
      const thick = input.wallThicknessPx ?? metresToPx(WALL_THICKNESS_INTERNAL_M, pxPerMetre);
      const geom = doorGeometry(anchor, wall, widthM, pxPerMetre, input.hingeSide ?? "left");
      const arcPath = doorArcPath(geom);
      return {
        kind: "door-opening",
        props: {
          // Opening cut line (rendered as a gap / highlight on the wall)
          cutStart: geom.cutStart,
          cutEnd: geom.cutEnd,
          // Door leaf line
          hingePoint: geom.hingePoint,
          freeCorner: geom.freeCorner,
          // Swing arc SVG path
          arcPath,
          arcRadiusPx: geom.arcRadiusPx,
          // Visual styling
          stroke: PRIMARY,
          strokeWidth: 2,
          wallThicknessPx: thick,
        },
        data: {
          type: "opening",
          openingKind: "door",
          provenance: "operator_measured",
          widthM,
          hingeSide: input.hingeSide ?? "left",
          // RA-6980 [A2b]: parent–child binding to the host wall.
          ...(input.hostWallId
            ? {
                hostWallId: input.hostWallId,
                hostWallT: parametricPositionOnSegment(anchor, wall),
              }
            : {}),
        },
      };
    }

    // RA-6841 [A2]: Window — opening cut + three glazing lines.
    // data.type = "opening" → excluded from measured area.
    case "window": {
      if (points.length < 1) return null;
      const anchor = points[0];
      const wall = input.wallSegment ??
        (points.length >= 2
          ? { a: points[0], b: points[1] }
          : { a: { x: anchor.x, y: anchor.y }, b: { x: anchor.x + 1, y: anchor.y } });
      const widthM = input.openingWidthM ?? 1.0;
      const thick = input.wallThicknessPx ?? metresToPx(WALL_THICKNESS_INTERNAL_M, pxPerMetre);
      const geom = windowGeometry(anchor, wall, widthM, pxPerMetre, thick);
      return {
        kind: "window-opening",
        props: {
          cutStart: geom.cutStart,
          cutEnd: geom.cutEnd,
          glazingLines: geom.glazingLines,
          stroke: PRIMARY,
          strokeWidth: 2,
          wallThicknessPx: thick,
        },
        data: {
          type: "opening",
          openingKind: "window",
          provenance: "operator_measured",
          widthM,
          // RA-6980 [A2b]: parent–child binding to the host wall.
          ...(input.hostWallId
            ? {
                hostWallId: input.hostWallId,
                hostWallT: parametricPositionOnSegment(anchor, wall),
              }
            : {}),
        },
      };
    }

    // select / freehand / pan are handled natively by the canvas.
    default:
      return null;
  }
}
