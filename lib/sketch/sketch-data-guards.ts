/**
 * Guards against wiping a saved floor plan with an empty Fabric blob
 * (common when flush-on-unmount runs after SketchCanvas.dispose()).
 */

export function sketchObjectCount(sketchData: unknown): number {
  if (!sketchData || typeof sketchData !== "object") return 0;
  const objects = (sketchData as { objects?: unknown }).objects;
  return Array.isArray(objects) ? objects.length : 0;
}

export function isEmptySketchData(sketchData: unknown): boolean {
  if (!sketchData || typeof sketchData !== "object") return true;
  const data = sketchData as {
    objects?: unknown;
    backgroundImage?: unknown;
    background?: unknown;
  };
  const hasObjects = Array.isArray(data.objects) && data.objects.length > 0;
  const hasBackground = Boolean(data.backgroundImage || data.background);
  return !hasObjects && !hasBackground;
}

/** Prefer a non-empty candidate; never let an empty live read clobber a snapshot. */
export function pickSketchDataForSave(
  live: unknown,
  snapshot: unknown,
): Record<string, unknown> | null {
  const liveEmpty = isEmptySketchData(live);
  const snapEmpty = isEmptySketchData(snapshot);
  if (!liveEmpty && live && typeof live === "object") {
    return live as Record<string, unknown>;
  }
  if (!snapEmpty && snapshot && typeof snapshot === "object") {
    return snapshot as Record<string, unknown>;
  }
  if (live && typeof live === "object") return live as Record<string, unknown>;
  if (snapshot && typeof snapshot === "object") {
    return snapshot as Record<string, unknown>;
  }
  return null;
}
