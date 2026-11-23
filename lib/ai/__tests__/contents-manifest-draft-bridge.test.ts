import { describe, expect, it } from "vitest";
import {
  applyTechnicianEdit,
  draftItemToVisionItem,
  generationNeedsConfirmation,
  storedDraftItemCount,
  visionItemToDraftItem,
  visionManifestToDraft,
} from "../contents-manifest-draft-bridge";
import type { ContentsManifest } from "../contents-manifest";
import type { ContentsManifestItem as DraftItem } from "@/app/api/inspections/[id]/contents-manifest/route";

describe("visionManifestToDraft", () => {
  it("maps vision items into the durable draft shape", () => {
    const vision = {
      inspectionId: "insp_1",
      items: [
        {
          id: "i1",
          description: "Sofa",
          category: "furniture",
          room: "Living",
          condition: "water_damaged",
          restorability: "questionable",
          estimatedValueAud: 1200,
          quantity: 1,
          confidence: 0.82,
          sourcePhotoIndices: [0],
          aiNotes: "wet fabric",
          verified: false,
        },
      ],
      photosAnalysed: 3,
      totalEstimatedValueAud: 1200,
      overallConfidence: 0.82,
      model: "claude-sonnet-4-6",
      tier: "premium" as const,
      durationMs: 100,
      estimatedCostUsd: 0.1,
      generatedAt: "2026-08-02T00:00:00.000Z",
    } satisfies ContentsManifest;

    const draft = visionManifestToDraft(vision);
    expect(draft.inspectionId).toBe("insp_1");
    expect(draft.imageCount).toBe(3);
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      id: "i1",
      description: "Sofa",
      count: 1,
      condition: "poor",
      restorableStatus: "uncertain",
      estimatedValue: 1200,
      confidence: 82,
      roomLocation: "Living",
      flagForReview: true,
    });
    expect(draft.flaggedForReviewCount).toBe(1);
  });

  it("converts 0-100 confidence without double-scaling", () => {
    const item = visionItemToDraftItem({
      id: "i2",
      description: "TV",
      category: "electronics",
      room: "Lounge",
      condition: "undamaged",
      restorability: "restorable",
      estimatedValueAud: 100,
      quantity: 2,
      confidence: 0.95,
      sourcePhotoIndices: [],
      verified: true,
    });
    expect(item.confidence).toBe(95);
    expect(item.flagForReview).toBe(false);
  });
});

// RA-8619: the AI screen saves through the shared PATCH route; these helpers
// are the only mapping between its rows and the stored list.
describe("RA-8619 technician edits and replace guard", () => {
  const stored: DraftItem[] = [
    {
      id: "a",
      category: "Furniture",
      description: "Sofa",
      count: 1,
      condition: "poor",
      restorableStatus: "replace",
      estimatedValue: 1200,
      confidence: 90,
      roomLocation: "Lounge",
      flagForReview: true,
      aiNote: "wet fabric",
    },
    {
      id: "b",
      category: "Electronics",
      description: "TV",
      count: 1,
      condition: "good",
      restorableStatus: "restorable",
      confidence: 95,
      flagForReview: false,
    },
  ];

  it("applies the edit to one row, marks it technician-verified and leaves the other row unchanged", () => {
    const next = applyTechnicianEdit(stored, "a", {
      description: "Three-seat sofa",
      estimatedValueAud: 850,
      quantity: 2,
      technicianNotes: "receipt sighted",
    });
    expect(next).not.toBeNull();
    expect(next![0]).toMatchObject({
      id: "a",
      description: "Three-seat sofa",
      estimatedValue: 850,
      count: 2,
      technicianNote: "receipt sighted",
      technicianVerified: true,
      flagForReview: false,
      aiNote: "wet fabric",
      condition: "poor",
    });
    expect(next![1]).toEqual(stored[1]);
  });

  it("refuses an edit to a row that is not in the stored list", () => {
    expect(
      applyTechnicianEdit(stored, "missing", {
        description: "x",
        estimatedValueAud: 1,
        quantity: 1,
      }),
    ).toBeNull();
  });

  it("shows a row as verified only when the technician verified it, never from the AI flag", () => {
    expect(draftItemToVisionItem(stored[1]).verified).toBe(false);
    const edited = applyTechnicianEdit(stored, "b", {
      description: "TV",
      estimatedValueAud: 400,
      quantity: 1,
    })!;
    const row = draftItemToVisionItem(edited[1]);
    expect(row.verified).toBe(true);
    expect(row.estimatedValueAud).toBe(400);
  });

  it("requires confirmation before a generator replaces a stored list", () => {
    const json = JSON.stringify({ items: stored });
    expect(generationNeedsConfirmation(json, undefined)).toBe(true);
    expect(generationNeedsConfirmation(json, "true")).toBe(true);
    expect(generationNeedsConfirmation(json, true)).toBe(false);
    expect(generationNeedsConfirmation(null, undefined)).toBe(false);
    expect(generationNeedsConfirmation(JSON.stringify({ items: [] }), undefined)).toBe(false);
    // unreadable stored data is never silently overwritten
    expect(storedDraftItemCount("{not json")).toBe(1);
  });
});
