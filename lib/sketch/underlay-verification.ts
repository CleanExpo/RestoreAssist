import { isSketchFieldComplete } from "@/lib/sketch/sketch-field-status";

const STRUCTURAL_TYPES = new Set(["room", "wall", "opening", "fixture"]);

interface FabricObject {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SketchBlob {
  objects?: FabricObject[];
  scaleConfig?: {
    pxPerMetre?: unknown;
    description?: unknown;
    pointA?: { x?: unknown; y?: unknown };
    pointB?: { x?: unknown; y?: unknown };
    realMetres?: unknown;
  };
  [key: string]: unknown;
}

export type UnderlayVerification =
  | {
      ok: true;
      method: "two_point_scale_and_room_confirmation";
      roomCount: number;
      pxPerMetre: number;
      scaleDescription: string | null;
    }
  | { ok: false; reason: string };

/** Server gate for turning traced reference geometry into measured geometry. */
export function evaluateUnderlayVerification(
  sketchData: unknown,
): UnderlayVerification {
  if (!sketchData || typeof sketchData !== "object") {
    return { ok: false, reason: "Sketch data is missing." };
  }
  const sketch = sketchData as SketchBlob;
  if (!isSketchFieldComplete(sketch)) {
    return {
      ok: false,
      reason: "The technician has not marked the floor complete.",
    };
  }
  const pxPerMetre = Number(sketch.scaleConfig?.pxPerMetre);
  if (!Number.isFinite(pxPerMetre) || pxPerMetre <= 1) {
    return { ok: false, reason: "A two-point scale calibration is required." };
  }
  const pointA = sketch.scaleConfig?.pointA;
  const pointB = sketch.scaleConfig?.pointB;
  const realMetres = Number(sketch.scaleConfig?.realMetres);
  const ax = Number(pointA?.x);
  const ay = Number(pointA?.y);
  const bx = Number(pointB?.x);
  const by = Number(pointB?.y);
  const pixelDistance = Math.hypot(bx - ax, by - ay);
  const derivedPxPerMetre = pixelDistance / realMetres;
  if (
    ![ax, ay, bx, by, realMetres, pixelDistance, derivedPxPerMetre].every(
      Number.isFinite,
    ) ||
    realMetres <= 0 ||
    pixelDistance < 10 ||
    Math.abs(derivedPxPerMetre - pxPerMetre) / pxPerMetre > 0.005
  ) {
    return {
      ok: false,
      reason: "Two calibration endpoints and their real distance are required.",
    };
  }
  const rooms = (sketch.objects ?? []).filter(
    (object) => object.data?.type === "room",
  );
  if (rooms.length === 0) {
    return { ok: false, reason: "At least one traced room is required." };
  }
  const structural = (sketch.objects ?? []).filter((object) => {
    const type = object.data?.type;
    return typeof type === "string" && STRUCTURAL_TYPES.has(type);
  });
  if (
    structural.some(
      (object) => object.data?.provenance !== "operator_measured",
    )
  ) {
    return {
      ok: false,
      reason: "Every traced structural item must be technician-confirmed.",
    };
  }
  return {
    ok: true,
    method: "two_point_scale_and_room_confirmation",
    roomCount: rooms.length,
    pxPerMetre,
    scaleDescription:
      typeof sketch.scaleConfig?.description === "string"
        ? sketch.scaleConfig.description
        : null,
  };
}

/**
 * While a reference is active but unverified, structural geometry is retained
 * for editing but is forced behind the provenance firewall server-side.
 */
export function enforceUnverifiedUnderlayProvenance(
  sketchData: Record<string, unknown>,
): Record<string, unknown> {
  const objects = Array.isArray(sketchData.objects)
    ? (sketchData.objects as FabricObject[])
    : [];
  return {
    ...sketchData,
    objects: objects.map((object) => {
      const type = object.data?.type;
      if (typeof type !== "string" || !STRUCTURAL_TYPES.has(type))
        return object;
      return {
        ...object,
        data: { ...object.data, provenance: "underlay_reference" },
      };
    }),
  };
}
