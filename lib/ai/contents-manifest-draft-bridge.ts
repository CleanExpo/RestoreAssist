/**
 * Bridge vision ContentsManifest (lib/ai/contents-manifest) ↔ durable
 * ContentsManifestDraft stored on Inspection.contentsManifestDraft.
 */

import type {
  ContentsManifest,
  ContentsManifestItem as VisionItem,
} from "@/lib/ai/contents-manifest";
import type {
  ContentsManifestDraft,
  ContentsManifestItem as DraftItem,
} from "@/app/api/inspections/[id]/contents-manifest/route";

const CONDITION_MAP: Record<string, DraftItem["condition"]> = {
  undamaged: "good",
  lightly_soiled: "fair",
  water_damaged: "poor",
  smoke_damaged: "poor",
  fire_damaged: "destroyed",
  mould_affected: "poor",
  contaminated: "destroyed",
  structurally_damaged: "destroyed",
  good: "good",
  fair: "fair",
  poor: "poor",
  destroyed: "destroyed",
};

const RESTORABLE_MAP: Record<string, DraftItem["restorableStatus"]> = {
  restorable: "restorable",
  questionable: "uncertain",
  non_restorable: "replace",
  replace: "replace",
  uncertain: "uncertain",
};

export function visionItemToDraftItem(item: VisionItem): DraftItem {
  const confidencePct = Math.round(
    (item.confidence <= 1 ? item.confidence * 100 : item.confidence) || 0,
  );
  const estimatedValue =
    typeof item.estimatedValueAud === "number" && item.estimatedValueAud > 0
      ? item.estimatedValueAud
      : undefined;
  return {
    id: item.id,
    category: String(item.category || "Uncategorised"),
    description: item.description || "Untitled item",
    count: Math.max(1, item.quantity || 1),
    condition: CONDITION_MAP[item.condition] ?? "fair",
    restorableStatus: RESTORABLE_MAP[item.restorability] ?? "uncertain",
    estimatedValue,
    confidence: Math.max(0, Math.min(100, confidencePct)),
    roomLocation: item.room || undefined,
    flagForReview:
      !item.verified ||
      confidencePct < 70 ||
      (typeof estimatedValue === "number" && estimatedValue > 500),
    aiNote: item.aiNotes || item.technicianNotes || undefined,
  };
}

export function visionManifestToDraft(
  manifest: ContentsManifest,
): ContentsManifestDraft {
  const items = (manifest.items ?? []).map(visionItemToDraftItem);
  return {
    inspectionId: manifest.inspectionId,
    generatedAt: manifest.generatedAt || new Date().toISOString(),
    model: manifest.model || "unknown",
    provider: "byok",
    imageCount: manifest.photosAnalysed ?? 0,
    items,
    lowConfidenceCount: items.filter((i) => i.confidence < 70).length,
    flaggedForReviewCount: items.filter((i) => i.flagForReview).length,
    disclaimer:
      "This manifest is AI-assisted and requires review before use in claims. All values are estimates only. Items flagged for review require manual confirmation.",
  };
}
