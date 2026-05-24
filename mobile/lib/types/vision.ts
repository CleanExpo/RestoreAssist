/**
 * Local mobile-side type stubs for the BYOK Vision feature (RA-393).
 *
 * The canonical types live server-side at `lib/ai/byok-vision-client.ts`,
 * but that file has not yet been merged from its development worktree.
 * Until RA-393 lands (tracked as RA-5194), this stub keeps the mobile
 * transport layer (`mobile/lib/api/byok-vision-client.ts`) type-safe in
 * isolation.
 *
 * When the server module merges, delete this file and restore:
 *   import type { S500VisionResult } from "@/lib/ai/byok-vision-client";
 *
 * Source of truth at extraction time: the agent-a027b575 worktree copy.
 */

export const EVIDENCE_CLASSES = [
  "SITE_OVERVIEW",
  "DAMAGE_CLOSE_UP",
  "MOISTURE_READING",
  "THERMAL_IMAGE",
  "EQUIPMENT_PLACEMENT",
  "CONTAINMENT_SETUP",
  "AIR_QUALITY_READING",
  "MATERIAL_SAMPLE",
  "FLOOR_PLAN_ANNOTATION",
  "PROGRESS_PHOTO",
  "COMPLETION_PHOTO",
  "AFFECTED_CONTENTS",
  "STRUCTURAL_ASSESSMENT",
  "SAFETY_HAZARD",
  "UTILITY_STATUS",
  "ENVIRONMENTAL_CONDITION",
  "OTHER",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const DAMAGE_CATEGORIES = [
  "Category 1",
  "Category 2",
  "Category 3",
] as const;

export const DAMAGE_CLASSES = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
] as const;

export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number];
export type DamageClass = (typeof DAMAGE_CLASSES)[number];

/**
 * IICRC S500:2025-compliant structured vision output returned by
 * `/api/ai/vision`. Mirrors the server-side `S500VisionResult` interface.
 */
export interface S500VisionResult {
  damageCategory: DamageCategory | null;
  damageClass: DamageClass | null;
  affectedArea: string;
  moistureIndicators: string[];
  suggestedEvidenceClass: EvidenceClass;
  safetyHazards: string[];
  structuralConcerns: string[];
  materials: string[];
  photoQualityScore: number;
  s500ComplianceNotes: string;
  rawDescription: string;
  confidence: number;
  model: string;
  provider: "anthropic" | "openai" | "gemini";
}
