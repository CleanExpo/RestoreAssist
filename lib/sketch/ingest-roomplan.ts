/**
 * RA-7091 — helpers for ingesting RoomPlan capture into the sketch editor.
 * Pure / dependency-free so jsdom tests can pin provenance + adapter tags
 * without mounting Fabric or Capacitor.
 */
import {
  roomPlanToFabric,
  type CapturedRoom,
  type FabricPolygonElement,
} from "./roomplan-to-fabric";

const CAPTURE_ADAPTERS = new Set([
  "manual",
  "roomplan",
  "cloud_ai",
  "underlay_import",
] as const);

export type ClaimSketchCaptureAdapter =
  | "manual"
  | "roomplan"
  | "cloud_ai"
  | "underlay_import";

/** Narrow an unknown client value to a valid ClaimSketch.captureAdapter. */
export function parseCaptureAdapter(
  value: unknown,
): ClaimSketchCaptureAdapter | undefined {
  if (typeof value !== "string") return undefined;
  if ((CAPTURE_ADAPTERS as Set<string>).has(value)) {
    return value as ClaimSketchCaptureAdapter;
  }
  return undefined;
}

/**
 * Convert a CapturedRoom payload into canvas-ready Fabric descriptors.
 * Returns [] when nothing usable was scanned (caller should toast + abort).
 */
export function prepareRoomPlanIngest(
  captured: CapturedRoom | null | undefined,
): FabricPolygonElement[] {
  return roomPlanToFabric(captured);
}

/**
 * True when Fabric canvas JSON includes at least one room tagged from RoomPlan.
 * Used to set ClaimSketch.captureAdapter on save without a parallel flag.
 */
export function sketchDataHasRoomPlan(sketchData: unknown): boolean {
  if (!sketchData || typeof sketchData !== "object") return false;
  const objects = (sketchData as { objects?: unknown }).objects;
  if (!Array.isArray(objects)) return false;
  return objects.some((obj) => {
    if (!obj || typeof obj !== "object") return false;
    const data = (obj as { data?: unknown }).data;
    if (!data || typeof data !== "object") return false;
    return (data as { captureAdapter?: unknown }).captureAdapter === "roomplan";
  });
}

/** Prefer roomplan when any RoomPlan room is present; otherwise keep existing/manual. */
export function resolveSketchCaptureAdapter(opts: {
  sketchData: unknown;
  explicit?: unknown;
  previous?: string | null;
}): ClaimSketchCaptureAdapter {
  const explicit = parseCaptureAdapter(opts.explicit);
  if (explicit) return explicit;
  if (sketchDataHasRoomPlan(opts.sketchData)) return "roomplan";
  const previous = parseCaptureAdapter(opts.previous);
  return previous ?? "manual";
}
