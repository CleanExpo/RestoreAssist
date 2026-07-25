import { z } from "zod";
import { S500_FIELD_MAP } from "@/lib/nir-standards-mapping";
import { prisma } from "@/lib/prisma";

export const checkReportGapsSchema = z.object({
  inspectionId: z.string(),
});

export type CheckReportGapsArgs = z.infer<typeof checkReportGapsSchema>;

export interface ReportGap {
  field: string;
  severity: "warn" | "block";
  description: string;
  /** Edition-qualified IICRC clause that makes this a gap (CLAUDE.md rule 12); null when no standard governs the row (e.g. inspection not found). */
  clauseRef: string | null;
}

// Gap field → governing S500 clause, taken from S500_FIELD_MAP directly:
// getStandardsCitation() merges all four field maps and S700 shadows the
// duplicated photoDocumentation key, returning the wrong standard here.
// water_stopped has no field-map entry; its clause is pinned to the same
// S500:2021 §5.1 the description has always cited.
const GAP_CLAUSE_REFS: Record<string, string> = {
  moistureReadings: S500_FIELD_MAP.moistureContent.clauseRef,
  photos: S500_FIELD_MAP.photoDocumentation.clauseRef,
  iicrcClassification: S500_FIELD_MAP.waterCategory.clauseRef,
  "makeSafe.water_stopped": "S500:2021 §5.1",
};

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
        take: 50,
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
          clauseRef: null,
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
      clauseRef: GAP_CLAUSE_REFS.moistureReadings,
    });
  }

  // No photos captured
  if (inspection.photos.length === 0) {
    gaps.push({
      field: "photos",
      severity: "warn",
      description: "No photos captured for this inspection",
      clauseRef: GAP_CLAUSE_REFS.photos,
    });
  }

  // IICRC classification not yet set
  if (inspection.classifications.length === 0) {
    gaps.push({
      field: "iicrcClassification",
      severity: "block",
      description:
        "IICRC S500:2021 water category and class not yet determined",
      clauseRef: GAP_CLAUSE_REFS.iicrcClassification,
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
        "Stabilisation action 'water_stopped' is applicable but not yet completed (IICRC S500:2021 §5.1)",
      clauseRef: GAP_CLAUSE_REFS["makeSafe.water_stopped"],
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
