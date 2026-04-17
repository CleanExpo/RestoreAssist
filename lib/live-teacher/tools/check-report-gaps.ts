import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const checkReportGapsSchema = z.object({
  inspectionId: z.string(),
});

export type CheckReportGapsArgs = z.infer<typeof checkReportGapsSchema>;

export interface ReportGap {
  field: string;
  severity: "warn" | "block";
  description: string;
}

export async function checkReportGaps(
  args: CheckReportGapsArgs,
): Promise<{ gaps: ReportGap[] }> {
  const { inspectionId } = checkReportGapsSchema.parse(args);

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      moistureReadings: { take: 1, select: { id: true } },
      photos: { take: 1, select: { id: true } },
      scopeItems: { take: 1, select: { id: true } },
      classifications: { take: 1, select: { id: true } },
      makeSafeActions: {
        select: { action: true, applicable: true, completed: true },
      },
    },
  });

  if (!inspection) {
    return {
      gaps: [
        {
          field: "inspection",
          severity: "block",
          description: `Inspection ${inspectionId} not found`,
        },
      ],
    };
  }

  const gaps: ReportGap[] = [];

  // No moisture readings captured
  if (inspection.moistureReadings.length === 0) {
    gaps.push({
      field: "moistureReadings",
      severity: "warn",
      description: "No moisture readings captured for this inspection",
    });
  }

  // No photos captured
  if (inspection.photos.length === 0) {
    gaps.push({
      field: "photos",
      severity: "warn",
      description: "No photos captured for this inspection",
    });
  }

  // IICRC classification not yet set
  if (inspection.classifications.length === 0) {
    gaps.push({
      field: "iicrcClassification",
      severity: "block",
      description:
        "IICRC S500:2025 water category and class not yet determined",
    });
  }

  // Make-safe: water_stopped applicable but not completed
  const waterStopped = inspection.makeSafeActions.find(
    (a) => a.action === "water_stopped",
  );
  if (waterStopped && waterStopped.applicable && !waterStopped.completed) {
    gaps.push({
      field: "makeSafe.water_stopped",
      severity: "block",
      description:
        "Stabilisation action 'water_stopped' is applicable but not yet completed (IICRC S500:2025 §5.1)",
    });
  }

  return { gaps };
}

export const checkReportGapsDefinition = {
  name: "check_report_gaps",
  description:
    "Audit the inspection for missing required fields per the Admin-Burden Forensic review. Returns a list of gaps with severity. No data is written.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
    },
    required: ["inspectionId"],
  },
};
