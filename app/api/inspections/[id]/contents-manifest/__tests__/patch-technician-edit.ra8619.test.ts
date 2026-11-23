import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8619: a technician's correction on the AI contents screen is saved through
// this one PATCH route, and the inspection report reads exactly what was saved.

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const inspectionUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
      update: (...args: unknown[]) => inspectionUpdate(...args),
    },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: async () => ({
    ok: true,
    data: {
      inspectionManyWhere: { id: "inspection_1" },
      inspectionWhere: { id: "inspection_1" },
    },
  }),
  assertInspectionReadable: async () => ({ ok: true, data: {} }),
}));
vi.mock("@/lib/ai/workspace-byok-dispatch", () => ({
  workspaceRouteAiRequest: vi.fn(),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { PATCH } from "../route";
import {
  applyTechnicianEdit,
  draftItemToVisionItem,
} from "@/lib/ai/contents-manifest-draft-bridge";
import type { ContentsManifestDraft } from "../route";

const aiDraft: ContentsManifestDraft = {
  inspectionId: "inspection_1",
  generatedAt: "2026-11-01T00:00:00.000Z",
  model: "claude-sonnet-4-6",
  provider: "byok",
  imageCount: 2,
  items: [
    {
      id: "a",
      category: "furniture",
      description: "Sofa",
      count: 1,
      condition: "poor",
      restorableStatus: "replace",
      estimatedValue: 1200,
      confidence: 82,
      roomLocation: "Lounge",
      flagForReview: true,
      aiNote: "wet fabric",
    },
  ],
  lowConfidenceCount: 0,
  flaggedForReviewCount: 1,
  disclaimer: "AI-assisted",
};

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  inspectionUpdate.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "tech_1" } });
  inspectionFindFirst.mockResolvedValue({
    id: "inspection_1",
    contentsManifestDraft: JSON.stringify(aiDraft),
  });
  inspectionUpdate.mockResolvedValue({ id: "inspection_1" });
});

function patch(items: unknown) {
  return PATCH(
    new NextRequest(
      "http://localhost/api/inspections/inspection_1/contents-manifest",
      { method: "PATCH", body: JSON.stringify({ items }) },
    ),
    { params: Promise.resolve({ id: "inspection_1" }) },
  );
}

describe("PATCH contents-manifest with an AI-screen edit (RA-8619)", () => {
  it("stores the edited value, quantity, note and verified mark, and the report input carries them", async () => {
    const edited = applyTechnicianEdit(aiDraft.items, "a", {
      description: "Three-seat fabric sofa",
      estimatedValueAud: 850,
      quantity: 2,
      technicianNotes: "receipt sighted",
    });

    const response = await patch(edited);
    expect(response.status).toBe(200);

    const stored = inspectionUpdate.mock.calls[0][0].data
      .contentsManifestDraft as string;
    // generate-inspection-report/route.ts reads the field verbatim:
    // contentsManifest = JSON.parse(report.inspection.contentsManifestDraft)
    const reportInput = JSON.parse(stored) as ContentsManifestDraft;
    expect(reportInput.items[0]).toMatchObject({
      description: "Three-seat fabric sofa",
      estimatedValue: 850,
      count: 2,
      technicianNote: "receipt sighted",
      technicianVerified: true,
      flagForReview: false,
    });

    // After a reload, the AI screen shows the saved row as checked.
    const reloaded = draftItemToVisionItem(reportInput.items[0]);
    expect(reloaded).toMatchObject({
      description: "Three-seat fabric sofa",
      estimatedValueAud: 850,
      quantity: 2,
      verified: true,
      technicianNotes: "receipt sighted",
    });
  });

  it("does not invent a verified mark for a row the technician never checked", async () => {
    await patch(aiDraft.items);
    const stored = JSON.parse(
      inspectionUpdate.mock.calls[0][0].data.contentsManifestDraft,
    ) as ContentsManifestDraft;
    expect(stored.items[0].technicianVerified).toBeUndefined();
  });
});
