import { z } from "zod";

import { standardCite } from "@/lib/nir-standards-mapping";
import { prisma } from "@/lib/prisma";
import { recommendedEquipment } from "@/lib/sketch/iicrc-utils";

export const recommendMethodSchema = z.object({
  inspectionId: z.string(),
});

export type RecommendMethodArgs = z.infer<typeof recommendMethodSchema>;

const SQFT_TO_SQM = 0.09290304;

export interface MethodCaution {
  text: string;
  citation: string;
}

export type RecommendMethodResult =
  | {
      available: true;
      classification: { category: string; class: string };
      method: { summary: string; citation: string };
      equipment: {
        totalAreaM2: number;
        dehumidifier: number;
        airMover: number;
        airScrubber: number;
        citation: string;
      };
      cautions: MethodCaution[];
    }
  | { available: false; reason: string };

// Read-only: recommends, never writes. The technician commits any resulting
// scope/equipment changes through the normal editable surfaces.
export async function recommendMethod(
  args: RecommendMethodArgs,
): Promise<RecommendMethodResult> {
  const { inspectionId } = recommendMethodSchema.parse(args);

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      classifications: {
        take: 1,
        select: { category: true, class: true },
      },
      affectedAreas: {
        take: 100,
        select: { affectedAreaSqm: true, affectedSquareFootage: true },
      },
    },
  });

  if (!inspection) {
    return { available: false, reason: `Inspection ${inspectionId} not found` };
  }

  const cls = inspection.classifications[0];
  if (!cls?.category || !cls.class) {
    return {
      available: false,
      reason:
        "No IICRC classification recorded yet — determine water category and class first (S500:2021 §10.4), then ask again",
    };
  }

  const totalAreaM2 = inspection.affectedAreas.reduce(
    (sum, a) => sum + (a.affectedAreaSqm ?? a.affectedSquareFootage * SQFT_TO_SQM),
    0,
  );

  const equipment = recommendedEquipment(totalAreaM2);

  const classSummaries: Record<string, string> = {
    "1": "Class 1 (least water): targeted airflow and dehumidification on the affected materials only",
    "2": "Class 2 (significant absorption): full-room airflow with dehumidification sized to the wet-material load",
    "3": "Class 3 (greatest absorption, water from overhead): aggressive whole-room drying — airflow across all wet surfaces plus high-capacity dehumidification",
    "4": "Class 4 (specialty drying / bound water): extended drying with desiccant or low-grain refrigerant dehumidification and vapour-pressure differentials",
  };

  const cautions: MethodCaution[] = [];
  if (cls.category === "2" || cls.category === "3") {
    cautions.push({
      text: `Category ${cls.category} water: evaluate antimicrobial (biocide) application and PPE before drying in place`,
      citation: standardCite("S500", "7.1"),
    });
  }
  if (cls.category === "3") {
    cautions.push({
      text: "Category 3 water: porous materials in the wetted zone generally require removal rather than drying in place",
      citation: standardCite("S500", "10.4.1"),
    });
  }

  return {
    available: true,
    classification: { category: cls.category, class: cls.class },
    method: {
      summary:
        classSummaries[cls.class] ??
        `Class ${cls.class}: dry per the evaporation-load assessment`,
      citation: standardCite("S500", "10.4.3"),
    },
    equipment: {
      totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
      dehumidifier: equipment.dehumidifier,
      airMover: equipment.airMover,
      airScrubber: equipment.airScrubber,
      citation: standardCite("S500", "6"),
    },
    cautions,
  };
}

export const recommendMethodDefinition = {
  name: "recommend_method",
  description:
    "Recommend a drying method and indicative equipment counts for this inspection from its recorded IICRC classification and affected areas. Read-only — the technician reviews and commits any changes. Returns cited recommendations, or an explicit reason when classification is missing.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
    },
    required: ["inspectionId"],
  },
};
