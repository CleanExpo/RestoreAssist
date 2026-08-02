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
