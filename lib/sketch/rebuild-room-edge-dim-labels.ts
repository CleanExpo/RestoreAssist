/**
 * Rebuild the per-edge dimension labels for one room from the polygon
 * Fabric actually draws.
 *
 * Typed size, voice Accept, move and scale all fire object:modified after
 * the room geometry changes. Footprint labels are dim-labels with no
 * dimFor, so this leaves them alone.
 */

import { polygonAbsolutePoints } from "@/lib/sketch/fabric-absolute";
import {
  formatDimension,
  segmentLabelPosition,
  shouldShowEdgeDimension,
} from "@/lib/sketch/geometry-utils";
import {
  SHORT_DIM_CTA_TYPE,
  shortEdgeMeasureAffordances,
} from "@/lib/sketch/short-dim-affordance";

export type RoomEdgeLabelRole = "dim-label" | typeof SHORT_DIM_CTA_TYPE;

/** Creates the on-canvas text. The helper assigns `data` afterwards. */
export type RoomEdgeLabelTextFactory = (
  text: string,
  x: number,
  y: number,
  role: RoomEdgeLabelRole,
) => unknown;

interface EdgeLabelCanvas {
  getObjects: () => unknown[];
  remove: (...objects: unknown[]) => void;
  add: (...objects: unknown[]) => void;
  bringObjectToFront?: (object: unknown) => void;
}

interface EdgeLabelData {
  type?: string;
  dimFor?: string;
  roomId?: string;
}

function asCanvas(canvas: unknown): EdgeLabelCanvas {
  return canvas as EdgeLabelCanvas;
}

function labelData(obj: unknown): EdgeLabelData | undefined {
  return (obj as { data?: EdgeLabelData }).data;
}

function roomIdOf(room: unknown): string | null {
  const id = (room as { data?: { id?: unknown } }).data?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Draw per-edge dimension strings (and short-edge measure prompts) for a
 * room polygon. Does not remove existing labels.
 */
export function placeRoomEdgeDimLabels(
  canvas: unknown,
  points: ReadonlyArray<{ x: number; y: number }>,
  roomId: string,
  pxPerMetre: number,
  makeText: RoomEdgeLabelTextFactory,
): void {
  const c = asCanvas(canvas);
  const scale = pxPerMetre;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (shouldShowEdgeDimension(px, scale)) {
      const text = formatDimension(px, scale);
      const { labelPos } = segmentLabelPosition(a, b, 18);
      const lbl = makeText(text, labelPos.x, labelPos.y, "dim-label");
      (lbl as { data?: unknown }).data = {
        type: "dim-label",
        dimFor: roomId,
        edgeIndex: i,
        metres: px / scale,
      };
      c.add(lbl);
      c.bringObjectToFront?.(lbl);
    }
  }
  for (const cta of shortEdgeMeasureAffordances(points, scale)) {
    const lbl = makeText(
      cta.label,
      cta.labelPos.x,
      cta.labelPos.y,
      SHORT_DIM_CTA_TYPE,
    );
    (lbl as { data?: unknown }).data = {
      type: SHORT_DIM_CTA_TYPE,
      roomId,
      edgeIndex: cta.edgeIndex,
      ax: cta.a.x,
      ay: cta.a.y,
      bx: cta.b.x,
      by: cta.b.y,
      metres: cta.metres,
    };
    c.add(lbl);
    c.bringObjectToFront?.(lbl);
  }
}

/**
 * Drop this room's edge dim-labels and short-edge prompts, then redraw
 * them from polygonAbsolutePoints (scene coordinates, including scale).
 */
export function rebuildRoomEdgeDimLabels(
  canvas: unknown,
  room: unknown,
  pxPerMetre: number,
  makeText: RoomEdgeLabelTextFactory,
): void {
  const roomId = roomIdOf(room);
  const points = polygonAbsolutePoints(room);
  if (!roomId || !points) return;
  const c = asCanvas(canvas);
  const stale = c.getObjects().filter((obj) => {
    const data = labelData(obj);
    if (!data) return false;
    if (data.type === "dim-label" && data.dimFor === roomId) return true;
    if (data.type === SHORT_DIM_CTA_TYPE && data.roomId === roomId) return true;
    return false;
  });
  if (stale.length) c.remove(...stale);
  placeRoomEdgeDimLabels(c, points, roomId, pxPerMetre, makeText);
}
