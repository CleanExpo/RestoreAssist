/**
 * RA-7623 — voice-note suggestions for a room.
 *
 * Mapping stays in mapVoiceTranscriptToFields. This module only turns that
 * result into Accept/Reject cards and applies an accepted card through the
 * caller's existing room fields. Reject writes nothing. An accepted material
 * with isPotentialAcm raises the WHS latch and never clears it.
 */

import { evaluateWhsGate, type WhsGateResult } from "@/lib/anz/whs-gate";
import type { WaterCategory } from "@/lib/anz/water-category";
import type { AnzMaterial } from "@/lib/anz/materials";
import type { VoiceFieldMapping } from "@/lib/services/ai/voice-to-fields";

export interface VoiceJobSnapshot {
  materialSlug?: string;
  waterCategory?: WaterCategory;
  lengthM?: number;
  widthM?: number;
  /** Raise-only. Accept may set this true. Nothing here sets it false. */
  voiceRaisedAcm?: boolean;
  whsPathwayNote?: string;
}

export type VoiceSuggestion =
  | { kind: "material"; material: AnzMaterial }
  | { kind: "waterCategory"; waterCategory: WaterCategory }
  | { kind: "dimensions"; lengthM?: number; widthM?: number }
  | { kind: "unrecognised"; term: string };

export function suggestionsFromMapping(
  mapping: VoiceFieldMapping,
): VoiceSuggestion[] {
  const suggestions: VoiceSuggestion[] = [];
  if (mapping.material) {
    suggestions.push({ kind: "material", material: mapping.material });
  }
  if (mapping.waterCategory) {
    suggestions.push({
      kind: "waterCategory",
      waterCategory: mapping.waterCategory,
    });
  }
  if (
    mapping.dimensions &&
    (mapping.dimensions.lengthM != null || mapping.dimensions.widthM != null)
  ) {
    suggestions.push({
      kind: "dimensions",
      lengthM: mapping.dimensions.lengthM,
      widthM: mapping.dimensions.widthM,
    });
  }
  for (const item of mapping.needsConfirmation) {
    suggestions.push({ kind: "unrecognised", term: item.term });
  }
  return suggestions;
}

function gateForLatch(
  job: VoiceJobSnapshot,
  propertyYearBuilt?: number,
): WhsGateResult | null {
  if (job.voiceRaisedAcm !== true) return null;
  return evaluateWhsGate({
    isPotentialAcm: true,
    materialId: job.materialSlug,
    propertyYearBuilt,
    action: "strip_out",
    whsPathwayNote: job.whsPathwayNote,
  });
}

/**
 * Apply one accepted suggestion. Unrecognised words are not written.
 * A previous voiceRaisedAcm true is preserved; an ACM material may set it.
 */
export function acceptVoiceSuggestion(
  job: VoiceJobSnapshot,
  suggestion: VoiceSuggestion,
  propertyYearBuilt?: number,
): { job: VoiceJobSnapshot; whs: WhsGateResult | null } {
  if (suggestion.kind === "unrecognised") {
    return { job, whs: gateForLatch(job, propertyYearBuilt) };
  }

  const next: VoiceJobSnapshot = { ...job };
  if (suggestion.kind === "material") {
    next.materialSlug = suggestion.material.id;
    if (suggestion.material.isPotentialAcm) next.voiceRaisedAcm = true;
  } else if (suggestion.kind === "waterCategory") {
    next.waterCategory = suggestion.waterCategory;
  } else if (suggestion.kind === "dimensions") {
    if (suggestion.lengthM != null) next.lengthM = suggestion.lengthM;
    if (suggestion.widthM != null) next.widthM = suggestion.widthM;
  }

  return { job: next, whs: gateForLatch(next, propertyYearBuilt) };
}

/** Reject leaves the job as it was. */
export function rejectVoiceSuggestion<T extends VoiceJobSnapshot>(job: T): T {
  return job;
}
