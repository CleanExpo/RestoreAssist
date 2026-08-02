import { describe, expect, it } from "vitest";
import {
  visionItemToDraftItem,
  visionManifestToDraft,
} from "../contents-manifest-draft-bridge";
import type { ContentsManifest } from "../contents-manifest";

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
