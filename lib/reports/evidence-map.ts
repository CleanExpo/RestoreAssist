export interface EvidenceMapPin {
  label: string;
  nx: number;
  ny: number;
  caption: string;
  inspectionPhotoId: string | null;
}

export function parseEvidencePins(raw: unknown): EvidenceMapPin[] {
  if (!Array.isArray(raw)) return [];
  const pins: EvidenceMapPin[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const pin = value as Record<string, unknown>;
    if (typeof pin.nx !== "number" || pin.nx < 0 || pin.nx > 1) continue;
    if (typeof pin.ny !== "number" || pin.ny < 0 || pin.ny > 1) continue;
    const room = pin.sketchRoom as { name?: unknown } | null | undefined;
    const caption =
      (typeof pin.caption === "string" && pin.caption.trim()) ||
      (typeof room?.name === "string" && room.name.trim()) ||
      "Inspection evidence";
    pins.push({
      label: `E${pins.length + 1}`,
      nx: pin.nx,
      ny: pin.ny,
      caption,
      inspectionPhotoId:
        typeof pin.inspectionPhotoId === "string"
          ? pin.inspectionPhotoId
          : null,
    });
  }
  return pins;
}

export function placeEvidencePins(
  pins: EvidenceMapPin[],
  image: { x: number; y: number; width: number; height: number },
): Array<EvidenceMapPin & { cx: number; cy: number }> {
  return pins.map((pin) => ({
    ...pin,
    cx: image.x + pin.nx * image.width,
    cy: image.y + (1 - pin.ny) * image.height,
  }));
}

export function crossReferenceEvidencePhotos<
  T extends { evidencePins?: EvidenceMapPin[] | null },
>(
  floors: T[],
): {
  floors: T[];
  labelsByPhotoId: Map<string, string[]>;
} {
  const labelsByPhotoId = new Map<string, string[]>();
  let nextLabel = 1;

  const referencedFloors = floors.map((floor) => ({
    ...floor,
    evidencePins: floor.evidencePins?.map((pin) => {
      const labelledPin = { ...pin, label: `E${nextLabel++}` };
      if (pin.inspectionPhotoId) {
        const labels = labelsByPhotoId.get(pin.inspectionPhotoId) ?? [];
        labelsByPhotoId.set(pin.inspectionPhotoId, [
          ...labels,
          labelledPin.label,
        ]);
      }
      return labelledPin;
    }),
  })) as T[];

  return { floors: referencedFloors, labelsByPhotoId };
}
