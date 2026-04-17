import { z } from "zod";

// WHSIncident is NOT in the Prisma schema in this worktree.
// The model exists as a TypeScript interface in app/dashboard/whs/page.tsx,
// backed by /api/whs (a route that is also absent from the codebase).
// Per the escape hatch rule: adjust the handler — return graceful degradation
// with the validated args so the caller can log/queue them externally.

export const flagWhsHazardSchema = z.object({
  inspectionId: z.string(),
  hazardType: z.enum(["confined_space", "asbestos", "biohazard", "electrical"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  controls: z.array(z.string()),
  source: z.enum(["teacher_proactive", "user_reported"]),
});

export type FlagWhsHazardArgs = z.infer<typeof flagWhsHazardSchema>;

export async function flagWhsHazard(args: FlagWhsHazardArgs) {
  const validated = flagWhsHazardSchema.parse(args);

  // WHSIncident Prisma model not yet available in this worktree.
  // Return validated payload so the caller can surface the hazard in-session
  // until the model is migrated (tracked in RA-80 / pending schema migration).
  return {
    status: "queued" as const,
    hint: "WHSIncident Prisma model pending migration — hazard captured in-session",
    hazard: validated,
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
        enum: ["low", "medium", "high", "critical"],
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
    },
    required: ["inspectionId", "hazardType", "severity", "controls", "source"],
  },
};
