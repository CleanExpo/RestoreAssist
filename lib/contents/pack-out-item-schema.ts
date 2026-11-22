/**
 * Contents pack-out item — the shared request contract (RA-8533).
 *
 * POST /api/inspections/[id]/contents-pack-out validates its body with
 * `packOutItemSchema`, and the Contents form in NIRClaimAssessmentPanel builds
 * its body from the same field names and option lists. Keeping both on this
 * one module is what stops the form drifting from the route again: before
 * RA-8533 the form sent `itemName` / `condition`, the route required
 * `itemDescription`, and every add was refused with a 400.
 *
 * The fields mirror the ContentsPackOutItem model in prisma/schema.prisma.
 * This module adds no field the model cannot store.
 */

import { z } from "zod";

export const CONDITION_GRADES = ["EXCELLENT", "GOOD", "FAIR", "POOR"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const PACK_OUT_DECISIONS = [
  "CLEAN_ONSITE",
  "PACK_OUT",
  "TOTAL_LOSS",
] as const;
export type PackOutDecision = (typeof PACK_OUT_DECISIONS)[number];

export const CONDITION_GRADE_LABELS: Record<ConditionGrade, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
};

export const PACK_OUT_DECISION_LABELS: Record<PackOutDecision, string> = {
  CLEAN_ONSITE: "Clean on-site",
  PACK_OUT: "Pack out",
  TOTAL_LOSS: "Total loss",
};

export const packOutItemSchema = z.object({
  itemDescription: z.string().min(1),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  ageYears: z.number().int().nonnegative().nullable().optional(),
  conditionPreLoss: z.enum(CONDITION_GRADES).nullable().optional(),
  conditionPostLoss: z.enum(CONDITION_GRADES).nullable().optional(),
  replacementValueAud: z.number().nonnegative().nullable().optional(),
  restorationCostEstimate: z.number().nonnegative().nullable().optional(),
  packOutDecision: z.enum(PACK_OUT_DECISIONS).nullable().optional(),
  packOutTag: z.string().nullable().optional(),
  beforePhotoUrl: z.string().url().nullable().optional(),
  afterPhotoUrl: z.string().url().nullable().optional(),
  claimType: z
    .enum([
      "WATER",
      "FIRE",
      "MOULD",
      "STORM",
      "CONTENTS",
      "BIOHAZARD",
      "ODOUR",
      "CARPET",
      "HVAC",
      "ASBESTOS",
    ])
    .nullable()
    .optional(),
});

export type PackOutItemInput = z.infer<typeof packOutItemSchema>;

/**
 * PATCH /api/inspections/[id]/contents-pack-out/[itemId] — RA-8537.
 * Photos only: the before photo is often taken at pack-out and the after
 * photo days later, once the item is restored. Strict, so this body can never
 * change a value, a decision or a description. `null` clears a photo.
 */
export const packOutItemPhotosSchema = z
  .object({
    beforePhotoUrl: z.string().url().nullable().optional(),
    afterPhotoUrl: z.string().url().nullable().optional(),
  })
  .strict()
  .refine(
    (v) => v.beforePhotoUrl !== undefined || v.afterPhotoUrl !== undefined,
    { message: "Send beforePhotoUrl or afterPhotoUrl" },
  );

export type PackOutItemPhotosInput = z.infer<typeof packOutItemPhotosSchema>;
