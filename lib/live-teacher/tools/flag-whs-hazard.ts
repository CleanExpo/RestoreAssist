import { z } from "zod";
import { prisma } from "@/lib/prisma";

// WHSIncident now in Prisma schema (RA-1140).
// Maps hazardType → incidentType, severity to uppercase, controls array → description bullets

// P1 #20 step 1 of 2: WHSIncidentType enum (CLAUDE.md rule #16 — two-step rename).
// Mirrors prisma/schema.prisma `enum WHSIncidentType`. Callers may pass the
// strongly-typed enum alongside the legacy free-text `hazardType`; this tool
// dual-writes both columns. Future PR backfills + drops the free-text column.
export const WHS_INCIDENT_TYPES = [
  "NEAR_MISS",
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "LOST_TIME_INJURY",
  "NOTIFIABLE_INCIDENT",
  "PROPERTY_DAMAGE",
  "ENVIRONMENTAL",
  "BIOHAZARD",
  "OTHER",
] as const;

export const flagWhsHazardSchema = z.object({
  inspectionId: z.string(),
  hazardType: z.enum(["confined_space", "asbestos", "biohazard", "electrical"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  controls: z.array(z.string()).optional(),
  source: z.enum(["teacher_proactive", "user_reported"]).optional(),
  location: z.string().optional(),
  injuredParty: z.string().optional(),
  injuryDescription: z.string().optional(),
  // Optional structured taxonomy (P1 #20 step 1). When supplied, written to
  // the new `incidentTypeEnum` column; the free-text `incidentType` column
  // still receives `hazardType` for backwards compatibility.
  incidentTypeEnum: z.enum(WHS_INCIDENT_TYPES).optional(),
});

export type FlagWhsHazardArgs = z.infer<typeof flagWhsHazardSchema>;

// Owning-user context, threaded from the authenticated turn route so the
// AI-flagged incident is attributed to the real user (not the "system"
// placeholder, which polluted WHSIncident.@@index([userId, createdAt]) and
// the per-user WHS dashboard). Optional + additive so the shared TOOL_HANDLERS
// signature stays intact; falls back to "system" only when genuinely absent.
export interface FlagWhsHazardContext {
  userId?: string;
}

export async function flagWhsHazard(
  args: FlagWhsHazardArgs,
  context?: FlagWhsHazardContext,
) {
  const {
    inspectionId,
    hazardType,
    severity,
    controls,
    source,
    location,
    injuredParty,
    injuryDescription,
    incidentTypeEnum,
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
      // P1 #20 step 1 of 2: dual-write the enum column when caller supplies it.
      // NULL for legacy callers; backfill PR populates this from the free-text col.
      incidentTypeEnum: incidentTypeEnum ?? null,
      severity,
      incidentDate: new Date(),
      location,
      injuredParty,
      injuryDescription,
      description: source
        ? `Flagged by: ${source}${controlsBullets}`
        : controlsBullets || null,
      userId: context?.userId ?? "system",
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
