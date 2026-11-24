"use client";

import MoistureMappingCanvas, {
  type MoistureMappingCanvasProps,
} from "@/components/inspection/MoistureMappingCanvas";
import { apiErrorMessage } from "@/lib/api-error-message";

/**
 * RA-8605: the one owner of the moisture map's floor plan picture. It draws
 * the inspection's saved `floorPlanImageUrl` and saves a newly chosen picture
 * through `POST /api/inspections/[id]/floor-plan`, so the picture survives a
 * reload and shows on both the job page and the inspection form. Failures are
 * thrown back to the canvas, which shows them (RA-8603); the canvas never
 * falls back to keeping the picture in the browser only.
 *
 * Read-only views that only display a picture may mount MoistureMappingCanvas
 * directly with `readonly`; anything editable goes through here.
 */
export interface FloorPlanMoistureMapProps
  extends Omit<
    MoistureMappingCanvasProps,
    "initialBackgroundImage" | "onImageUpload" | "onBackgroundImageChange"
  > {
  /** The inspection's saved floor plan URL, or null when none is saved. */
  floorPlanImageUrl: string | null;
  /**
   * The inspection to save the picture against. The inspection form may need
   * to create the inspection first; it throws with a user-facing message when
   * it cannot.
   */
  resolveInspectionId: () => string | null | Promise<string | null>;
  /** Called with the stored URL once the server has saved the picture. */
  onFloorPlanSaved?: (imageUrl: string) => void;
}

export async function uploadFloorPlan(
  inspectionId: string,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/inspections/${inspectionId}/floor-plan`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    // RA-8603's uploadFailureMessage replaces this parse when it lands.
    const body = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(body) || "Failed to upload floor plan");
  }
  const data = (await response.json()) as { imageUrl?: unknown };
  if (typeof data.imageUrl !== "string" || !data.imageUrl) {
    throw new Error("Failed to upload floor plan");
  }
  return data.imageUrl;
}

export default function FloorPlanMoistureMap({
  floorPlanImageUrl,
  resolveInspectionId,
  onFloorPlanSaved,
  ...canvasProps
}: FloorPlanMoistureMapProps) {
  return (
    <MoistureMappingCanvas
      {...canvasProps}
      initialBackgroundImage={floorPlanImageUrl}
      onImageUpload={async (file) => {
        const inspectionId = await resolveInspectionId();
        if (!inspectionId) throw new Error("No inspection ID");
        const imageUrl = await uploadFloorPlan(inspectionId, file);
        onFloorPlanSaved?.(imageUrl);
        return imageUrl;
      }}
    />
  );
}
