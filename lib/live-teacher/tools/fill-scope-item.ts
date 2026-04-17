import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ScopeItem schema fields (per prisma/schema.prisma):
//   itemType, description, quantity (Float?), unit (String?), justification (String? @db.Text)
// Note: clauseRef is stored in justification (no separate field exists in the schema)

export const fillScopeItemSchema = z.object({
  inspectionId: z.string(),
  itemType: z.string(),
  description: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  clauseRef: z.string().optional(),
});

export type FillScopeItemArgs = z.infer<typeof fillScopeItemSchema>;

export async function fillScopeItem(args: FillScopeItemArgs) {
  const { inspectionId, itemType, description, quantity, unit, clauseRef } =
    fillScopeItemSchema.parse(args);

  const item = await prisma.scopeItem.create({
    data: {
      inspectionId,
      itemType,
      description,
      quantity,
      unit,
      justification: clauseRef ?? null,
    },
    select: {
      id: true,
      itemType: true,
      description: true,
      quantity: true,
      unit: true,
      justification: true,
    },
  });

  return {
    id: item.id,
    itemType: item.itemType,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    clauseRef: item.justification,
  };
}

export const fillScopeItemDefinition = {
  name: "fill_scope_item",
  description:
    "Add a scope of works item to the current inspection. Use when the tech identifies work required on site.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      itemType: {
        type: "string",
        description:
          "e.g. remove_carpet, sanitize_materials, install_dehumidification",
      },
      description: {
        type: "string",
        description: "Human-readable description of the work",
      },
      quantity: { type: "number", description: "Quantity if applicable" },
      unit: { type: "string", description: "e.g. sq ft, days, units" },
      clauseRef: {
        type: "string",
        description: "IICRC clause reference e.g. S500:2025 §7.1",
      },
    },
    required: ["inspectionId", "itemType", "description"],
  },
};
