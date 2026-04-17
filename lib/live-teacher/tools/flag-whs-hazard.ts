import { z } from "zod";
import { prisma } from "@/lib/prisma";

// WHSIncident now in Prisma schema (RA-1140).
// Maps hazardType → incidentType, severity to uppercase, controls array → description bullets

export const flagWhsHazardSchema = z.object({
  inspectionId: z.string(),
  hazardType: z.enum(["confined_space", "asbestos", "biohazard", "electrical"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  controls: z.array(z.string()).optional(),
  source: z.enum(["teacher_proactive", "user_reported"]).optional(),
  location: z.string().optional(),
  injuredParty: z.string().optional(),
  injuryDescription: z.string().optional(),
});

export type FlagWhsHazardArgs = z.infer<typeof flagWhsHazardSchema>;

export async function flagWhsHazard(args: FlagWhsHazardArgs) {
  const {
    inspectionId,
    hazardType,
    severity,
    controls,
    source,
    location,
    injuredParty,
    injuryDescription,
  } = flagWhsHazardSchema.parse(args);

  // Build description from controls array if provided
  const controlsBullets =
    controls && controls.length > 0
      ? "\n" + controls.map((c) => `• ${c}`).join("\n")
      : "";

  const incident = await prisma.wHSIncident.create({
    data: {
      inspectionId,
      incidentType: hazardType,
      severity,
      incidentDate: new Date(),
      location,
      injuredParty,
      injuryDescription,
      description: source
        ? `Flagged by: ${source}${controlsBullets}`
        : controlsBullets || null,
      userId: "system", // TODO: get from session context
    },
    select: {
      id: true,
      incidentType: true,
      severity: true,
      createdAt: true,
    },
  });

  return {
    id: incident.id,
    incidentType: incident.incidentType,
    severity: incident.severity,
    createdAt: incident.createdAt,
  };
}

export const flagWhsHazardDefinition = {
  name: "flag_whs_hazard",
  description:
    "Flag a WHS hazard identified during the inspection. Use for confined spaces, asbestos, biohazards, or electrical risks.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      hazardType: {
        type: "string",
        enum: ["confined_space", "asbestos", "biohazard", "electrical"],
        description: "Category of hazard",
      },
      severity: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        description: "Risk severity level",
      },
      controls: {
        type: "array",
        items: { type: "string" },
        description: "Required control measures",
      },
      source: {
        type: "string",
        enum: ["teacher_proactive", "user_reported"],
        description: "Who identified the hazard",
      },
      location: {
        type: "string",
        description: "Location/zone of the hazard",
      },
      injuredParty: {
        type: "string",
        description: "Person(s) affected if applicable",
      },
      injuryDescription: {
        type: "string",
        description: "Details of injury if applicable",
      },
    },
    required: ["inspectionId", "hazardType", "severity"],
  },
};
