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
 */
import type { ToolMode } from "@/components/sketch/SketchCanvas";

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
  | "photo-marker";

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
        data: { type: "room", provenance: "operator_measured" },
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

    // select / freehand / pan are handled natively by the canvas.
    default:
      return null;
  }
}
