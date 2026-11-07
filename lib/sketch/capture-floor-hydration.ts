/**
 * RA-8241 — hydrate homeowner capture editor from token GET payload.
 */

export type CaptureHydrationFloor = {
  floorNumber: number;
  floorLabel: string;
  sketchData?: unknown;
  pendingHomeownerCapture?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Prefer quarantined pending blob; fall back to last promoted sketch. */
export function sketchDataForCaptureEditor(
  floor: CaptureHydrationFloor,
): Record<string, unknown> | null {
  const pending = asRecord(floor.pendingHomeownerCapture);
  const fromPending = pending?.sketchData;
  if (fromPending && typeof fromPending === "object" && !Array.isArray(fromPending)) {
    return fromPending as Record<string, unknown>;
  }
  const authoritative = floor.sketchData;
  if (
    authoritative &&
    typeof authoritative === "object" &&
    !Array.isArray(authoritative)
  ) {
    return authoritative as Record<string, unknown>;
  }
  return null;
}

export function captureFloorsHaveDrawableContent(
  floors: CaptureHydrationFloor[],
): boolean {
  return floors.some((f) => {
    const data = sketchDataForCaptureEditor(f);
    if (!data) return false;
    const objects = data.objects;
    return Array.isArray(objects) && objects.length > 0;
  });
}
