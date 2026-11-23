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

// RA-8619: one owner for the stored contents list. Both contents screens save
// through PATCH /api/inspections/[id]/contents-manifest. These helpers are the
// only mapping between the AI screen's rows and the stored item, and the only
// rule for when a generator may replace a stored list.

/** Rows in a stored draft. Unreadable stored data counts as one row, so a
 * generator never silently overwrites data it could not read. */
export function storedDraftItemCount(stored: string | null | undefined): number {
  if (!stored) return 0;
  try {
    const parsed = JSON.parse(stored) as { items?: unknown };
    return Array.isArray(parsed?.items) ? parsed.items.length : 1;
  } catch {
    return 1;
  }
}

export const REPLACE_CONFIRMATION_MESSAGE =
  "A saved contents list already exists for this inspection. Regenerating replaces every saved row, including technician corrections. Confirm to replace it.";

/** True when generating would drop saved rows the technician has not agreed to lose. */
export function generationNeedsConfirmation(
  stored: string | null | undefined,
  replaceExisting: unknown,
): boolean {
  return storedDraftItemCount(stored) > 0 && replaceExisting !== true;
}

/** Stored item to the AI screen's row. `verified` is only ever the
 * technician's own mark, never inferred from the AI review flag. */
export function draftItemToVisionItem(item: DraftItem): VisionItem {
  return {
    id: item.id,
    description: item.description,
    category: item.category as VisionItem["category"],
    room: item.roomLocation ?? "Unknown",
    condition: item.condition as unknown as VisionItem["condition"],
    restorability:
      item.restorableStatus === "replace"
        ? "non_restorable"
        : item.restorableStatus === "uncertain"
          ? "questionable"
          : "restorable",
    estimatedValueAud: item.estimatedValue ?? 0,
    quantity: item.count,
    confidence: (item.confidence ?? 0) / 100,
    sourcePhotoIndices: [],
    aiNotes: item.aiNote,
    verified: item.technicianVerified === true,
    technicianNotes: item.technicianNote,
  };
}

export interface TechnicianRowEdit {
  description: string;
  estimatedValueAud: number;
  quantity: number;
  technicianNotes?: string;
}

/** Apply one technician edit to the stored list. Returns null when the row is
 * not in the stored list, so a caller never sends a list that silently drops it. */
export function applyTechnicianEdit(
  items: DraftItem[],
  itemId: string,
  edit: TechnicianRowEdit,
): DraftItem[] | null {
  if (!items.some((i) => i.id === itemId)) return null;
  return items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          description: edit.description,
          estimatedValue:
            edit.estimatedValueAud > 0 ? edit.estimatedValueAud : undefined,
          count: Math.max(1, edit.quantity),
          technicianNote: edit.technicianNotes,
          technicianVerified: true,
          flagForReview: false,
        }
      : item,
  );
}
