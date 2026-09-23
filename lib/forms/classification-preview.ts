/**
 * Review & Submit "Expected Auto-Classification Preview" (NIR technician form).
 *
 * RA-7709: moved out of components/NIRTechnicianInputForm.tsx unchanged so the
 * preview can be tested against what the submit route persists.
 *
 * Areas carry their size in `affectedSquareFootage`, which in the form holds
 * m² (see lib/forms/affected-area-payload.ts).
 */
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
  }>;
  environmentalData?: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint: number;
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
}: ClassificationPreviewInput): ClassificationPreview | null {
  if (affectedAreas.length === 0 || moistureReadings.length === 0) {
    return null;
  }

  // Get primary water source
  const primaryWaterSource = affectedAreas[0]?.waterSource || "Clean Water";
  const waterSourceLower = primaryWaterSource.toLowerCase();

  // Determine category
  let category = "1";
  if (
    waterSourceLower.includes("black") ||
    waterSourceLower.includes("sewage") ||
    waterSourceLower.includes("contaminated")
  ) {
    category = "3";
  } else if (
    waterSourceLower.includes("grey") ||
    waterSourceLower.includes("washing")
  ) {
    category = "2";
  }

  // Calculate average moisture and affected area
  const avgMoisture =
    moistureReadings.reduce((sum, r) => sum + r.moistureLevel, 0) /
    moistureReadings.length;
  const totalArea = affectedAreas.reduce(
    (sum, a) => sum + a.affectedSquareFootage,
    0,
  ); // Already in m²

  // Determine class based on area
  let classValue = "1";
  if (totalArea > 200) {
    classValue = "4";
  } else if (totalArea > 100) {
    classValue = "3";
  } else if (totalArea > 30) {
    classValue = "2";
  }

  return { category, class: classValue, avgMoisture, totalArea };
}
