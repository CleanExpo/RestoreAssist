/**
 * Maps a Fabric.js object (carrying the custom `data` payload) to the
 * SketchSelectionPanel view model. Pure + testable so the canvas selection
 * wiring (which can't be unit-tested without a live Fabric canvas) stays thin.
 */
import type { SelectedObject } from "@/components/sketch/SketchSelectionPanel";
import {
  AI_SUGGESTED_PROVENANCE,
  UNDERLAY_REFERENCE_PROVENANCE,
} from "./measured-provenance";
import {
  canonicalRoomAreaFields,
  resolveRoomAreaM2,
  type RoomGeometryObject,
} from "./room-area-from-geometry";

export interface FabricLike {
  type?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  data?: Record<string, unknown>;
}

/**
 * RA-8237 — the room area the panel shows and checks a measurement against.
 * A room waiting for Confirm uses the figure Confirm will send (the drawing
 * at the floor scale); any other room uses the area that bills. Without a
 * floor scale the cached `data.areaM2` is returned unchanged.
 */
function selectedRoomAreaM2(
  obj: FabricLike,
  data: Record<string, unknown>,
  pxPerMetre: number | undefined,
): number | undefined {
  const cached = typeof data.areaM2 === "number" ? data.areaM2 : undefined;
  if (data.type !== "room" || typeof pxPerMetre !== "number") return cached;
  const geo = obj as unknown as RoomGeometryObject;
  const pendingConfirm =
    data.provenance === AI_SUGGESTED_PROVENANCE ||
    (data.provenance === UNDERLAY_REFERENCE_PROVENANCE &&
      data.captureAdapter === "homeowner");
  const area = pendingConfirm
    ? canonicalRoomAreaFields(geo, pxPerMetre)?.areaM2
    : resolveRoomAreaM2(geo, pxPerMetre);
  return typeof area === "number" ? area : cached;
}

export function fabricObjectToSelected(
  obj: FabricLike | null | undefined,
  pxPerMetre?: number,
): SelectedObject | null {
  const data = obj?.data;
  const id = data?.id;
  if (!data || typeof id !== "string" || id.length === 0) return null;

  return {
    id,
    type: (data.type as string) ?? obj?.type ?? "object",
    label: data.label as string | undefined,
    fill: obj?.fill,
    stroke: obj?.stroke,
    opacity: obj?.opacity,
    materialSlug: data.material as string | undefined,
    whsPathwayNote: data.whsPathwayNote as string | undefined,
    cause: data.cause as SelectedObject["cause"],
    waterCategory: data.waterCategory as SelectedObject["waterCategory"],
    provenance: data.provenance as SelectedObject["provenance"],
    captureAdapter: data.captureAdapter as SelectedObject["captureAdapter"],
    correctionCount: Array.isArray(data.correctionHistory)
      ? data.correctionHistory.length
      : undefined,
    lengthM: typeof data.lengthM === "number" ? data.lengthM : undefined,
    widthM: typeof data.widthM === "number" ? data.widthM : undefined,
    areaM2: selectedRoomAreaM2(obj as FabricLike, data, pxPerMetre),
    dimLocked: data.dimLocked === true,
    openingKind:
      data.openingKind === "door" ||
      data.openingKind === "window" ||
      data.openingKind === "missing"
        ? data.openingKind
        : undefined,
    wallThicknessM:
      typeof data.wallThicknessM === "number" ? data.wallThicknessM : undefined,
    ceilingHeightM:
      typeof data.ceilingHeightM === "number" ? data.ceilingHeightM : undefined,
    ...(data.voiceRaisedAcm === true ? { voiceRaisedAcm: true as const } : {}),
    ...(data.detailsLost === true ? { detailsLost: true as const } : {}),
  };
}

/** Drop the RA-7655 re-entry flag after the technician edits the room. */
export function clearDetailsLostFromRoomData(
  data: Record<string, unknown> | null | undefined,
): void {
  if (!data || data.detailsLost !== true) return;
  delete data.detailsLost;
}

/**
 * RA-7542 — empty-canvas click in Select mode must drop the selection
 * (and the in-flow selection panel). Fabric already fires
 * `selection:cleared` when the click hits the canvas; this helper is the
 * tested contract so the handler cannot silently stop clearing.
 */
export function shouldClearSelectionOnEmptyCanvasClick(input: {
  toolMode: string;
  fabricTarget: unknown;
}): boolean {
  return input.toolMode === "select" && !input.fabricTarget;
}
