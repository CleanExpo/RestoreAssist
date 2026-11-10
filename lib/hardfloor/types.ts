/**
 * Hard Floor add-on — shared types.
 *
 * Domain model for the guided hard-floor walkthrough (intake → inspect →
 * test → report → scope → estimate → quote → job → handover → maintain).
 * Source of truth for methods and limits: the CARSI Hard Floor Care SOP
 * Cards v1. v1 of this module is pure logic: no Prisma models, no routes.
 */

export type FloorFamily = "tile_stone" | "resilient" | "timber";

export type FloorType =
  | "glazed_ceramic"
  | "porcelain"
  | "quarry_terracotta"
  | "calcium_stone" // marble, limestone, travertine, terrazzo
  | "silicate_stone" // granite, slate, porphyry
  | "linoleum"
  | "sheet_vinyl_pur"
  | "vct"
  | "lvt"
  | "rubber"
  | "timber_coated";

export type ServiceType =
  | "tile_grout_clean"
  | "tile_wax_removal"
  | "strip_and_seal"
  | "lino_safe"
  | "timber_clean"
  | "scrub_recoat";

/** Machine/pad actions an asbestos "presume" result must lock out. */
export type RestrictedAction =
  | "dry_strip"
  | "black_pad"
  | "brown_pad"
  | "high_speed_burnish"
  | "sanding";

export type WalkthroughStepId =
  | "intake"
  | "inspect"
  | "test"
  | "report"
  | "scope"
  | "estimate"
  | "quote"
  | "job"
  | "handover"
  | "maintain";

export type TrafficLevel = "high" | "medium" | "low";

export interface PhWindow {
  min: number;
  max: number;
}
