/**
 * Review & Submit "Expected Auto-Classification Preview" (NIR technician form).
 *
 * RA-7709: moved out of components/NIRTechnicianInputForm.tsx and routed
 * through classifyInspection, the function the submit route saves with, so
 * the preview shows what will be saved. A technician choice applies only when
 * both category and class are set — the same rule the draft save uses.
 *
 * Areas carry their size in `affectedSquareFootage`, which in the form holds
 * m² (see lib/forms/affected-area-payload.ts).
 */
import { classifyInspection } from "@/lib/nir-classification-engine";

export interface ClassificationPreviewInput {
  affectedAreas: Array<{
    roomZoneId: string;
    affectedSquareFootage: number;
    waterSource: string;
    timeSinceLoss?: number | null;
  }>;
  moistureReadings: Array<{
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: string;
    /** RA-7610: a linked reading is matched to an area by its sketch room. */
    sketchRoomId?: string | null;
    sketchRoom?: { id?: string; name: string } | null;
  }>;
  environmentalData?: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint?: number | null;
  } | null;
  manualClassification?: {
    category?: string | null;
    class?: string | null;
  } | null;
}

export interface ClassificationPreview {
  category: string;
  class: string;
  avgMoisture: number;
  totalArea: number;
}

export function calculateClassificationPreview({
  affectedAreas,
  moistureReadings,
  environmentalData,
  manualClassification,
}: ClassificationPreviewInput): ClassificationPreview | null {
  if (affectedAreas.length === 0 || moistureReadings.length === 0) {
    return null;
  }

  // RA-7709: the same classifier the submit route saves with.
  const result = classifyInspection({
    affectedAreas: affectedAreas.map((a) => ({
      roomZoneId: a.roomZoneId,
      areaSqm: a.affectedSquareFootage, // misnomer: m² in the form
      waterSource: a.waterSource,
      timeSinceLoss: a.timeSinceLoss,
    })),
    moistureReadings,
    environmentalData: environmentalData ?? null,
    manual: manualClassification,
  });

  const avgMoisture =
    moistureReadings.reduce((sum, r) => sum + r.moistureLevel, 0) /
    moistureReadings.length;
  const totalArea = affectedAreas.reduce(
    (sum, a) => sum + a.affectedSquareFootage,
    0,
  ); // Already in m²

  return {
    category: result.category,
    class: result.class,
    avgMoisture,
    totalArea,
  };
}

// ─── Technician choice: resume and draft-save payload (RA-7709) ─────────────

export type ManualChoice = { category: string; class: string };

/**
 * The technician's choice to restore when the form resumes an inspection:
 * the inspection's newest Classification row, when a technician chose it
 * (reviewedBy set — the same signal submit honours). An automatic row is
 * not a choice and restores nothing.
 */
export function resumedManualClassification(inspection: {
  classifications?: Array<{
    category: string;
    class: string;
    reviewedBy?: string | null;
    createdAt?: string | Date;
  }> | null;
}): ManualChoice | null {
  const newest = [...(inspection.classifications ?? [])].sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime(),
  )[0];
  return newest?.reviewedBy
    ? { category: newest.category, class: newest.class }
    : null;
}

/**
 * `manualClassification` for the draft-save body:
 * - a complete choice → the choice;
 * - no complete choice, but the form held one this session (restored or
 *   picked, then cleared) → null, an explicit clear;
 * - otherwise → undefined, so the field is left out and the server keeps any
 *   choice recorded elsewhere (for example the job-page classification tab).
 */
export function manualClassificationPayload(
  manual: { category?: string | null; class?: string | null } | null,
  hadChoice: boolean,
): ManualChoice | null | undefined {
  if (manual?.category && manual.class) {
    return { category: manual.category, class: manual.class };
  }
  return hadChoice ? null : undefined;
}
