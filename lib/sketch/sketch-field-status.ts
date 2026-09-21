/**
 * Field-complete status for a floor sketch.
 *
 * Honest RestoreAssist analogue of Cotality "lock / sync / release ownership":
 * we persist a local `fieldComplete` flag on the Fabric blob metadata so techs
 * can mark a floor done after scan→confirm→annotate. This is NOT carrier sync
 * and does not invent FML/estimate ownership.
 */

export const SKETCH_META_KEY = "raSketchMeta";

export interface SketchFieldMeta {
  /** Technician marked this floor's sketch as field-complete. */
  fieldComplete?: boolean;
  /** ISO timestamp when marked complete (cleared when unmarked). */
  fieldCompletedAt?: string | null;
  /**
   * RA-7617 — server-authored. Fabric object ids Vision produced on this
   * inspection. A first save cannot claim `operator_measured` for these ids
   * unless the POST lists them in `confirmedFabricObjectIds`. Written by
   * import-from-image; looked up across every floor of the inspection.
   */
  aiSuggestedRoomIds?: string[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function readSketchFieldMeta(sketchData: unknown): SketchFieldMeta {
  const root = asRecord(sketchData);
  const meta = asRecord(root?.[SKETCH_META_KEY]);
  if (!meta) return {};
  return {
    fieldComplete: meta.fieldComplete === true,
    fieldCompletedAt:
      typeof meta.fieldCompletedAt === "string" ? meta.fieldCompletedAt : null,
  };
}

export function isSketchFieldComplete(sketchData: unknown): boolean {
  return readSketchFieldMeta(sketchData).fieldComplete === true;
}

function uniqueRoomIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
}

/** Server-remembered Vision room ids stored on the floor's sketch blob. */
export function readAiSuggestedRoomIds(sketchData: unknown): string[] {
  const root = asRecord(sketchData);
  const meta = asRecord(root?.[SKETCH_META_KEY]);
  return uniqueRoomIds(meta?.aiSuggestedRoomIds);
}

/**
 * Union `ids` into `raSketchMeta.aiSuggestedRoomIds`. Never drops ids the
 * server already recorded — a client cannot un-remember an AI room.
 */
export function withAiSuggestedRoomIds(
  sketchData: Record<string, unknown> | null | undefined,
  ids: string[],
): Record<string, unknown> {
  const base: Record<string, unknown> = sketchData ? { ...sketchData } : {};
  const prev = asRecord(base[SKETCH_META_KEY]) ?? {};
  const merged = uniqueRoomIds([
    ...readAiSuggestedRoomIds(base),
    ...ids,
  ]);
  base[SKETCH_META_KEY] = {
    ...prev,
    aiSuggestedRoomIds: merged,
  };
  return base;
}

/**
 * Return a shallow-cloned sketch blob with updated field-complete meta.
 * Preserves Fabric `objects` / background; never invents empty objects.
 */
export function withSketchFieldComplete(
  sketchData: Record<string, unknown> | null | undefined,
  complete: boolean,
  now = new Date(),
): Record<string, unknown> {
  const base: Record<string, unknown> = sketchData ? { ...sketchData } : {};
  const prev = asRecord(base[SKETCH_META_KEY]) ?? {};
  base[SKETCH_META_KEY] = {
    ...prev,
    fieldComplete: complete,
    fieldCompletedAt: complete ? now.toISOString() : null,
  };
  return base;
}
