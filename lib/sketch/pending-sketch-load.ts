/**
 * Helpers for restoring ClaimSketch.sketchData onto a Fabric canvas after mount.
 *
 * SketchEditorV2 previously called loadFromJSON immediately after setState —
 * before SketchCanvas had assigned the ref — so drawings never reappeared on
 * reload. Pending JSON must be held on FloorData and applied in onReady.
 */

export type StoredSketchData = Record<string, unknown>;

/** Strip editor-only keys (e.g. scaleConfig) before Fabric loadFromJSON. */
export function fabricJsonFromStoredSketchData(
  sketchData: unknown,
): StoredSketchData | null {
  if (!sketchData || typeof sketchData !== "object" || Array.isArray(sketchData)) {
    return null;
  }
  const { scaleConfig: _scaleConfig, ...fabricJson } = sketchData as StoredSketchData;
  // Empty blob — nothing to restore.
  const objects = fabricJson.objects;
  const hasObjects = Array.isArray(objects) && objects.length > 0;
  const hasBackground = Boolean(
    fabricJson.backgroundImage || fabricJson.background,
  );
  if (!hasObjects && !hasBackground) {
    // Still return the blob so viewport/transform fields can apply if present.
    return Object.keys(fabricJson).length > 0 ? fabricJson : null;
  }
  return fabricJson;
}

export function scaleConfigFromStoredSketchData(
  sketchData: unknown,
): unknown | null {
  if (!sketchData || typeof sketchData !== "object") return null;
  const scaleConfig = (sketchData as StoredSketchData).scaleConfig;
  return scaleConfig ?? null;
}
