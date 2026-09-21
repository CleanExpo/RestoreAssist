import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const photoFindFirst = vi.fn();
const photoUpdate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
    inspectionPhoto: {
      findFirst: (...args: unknown[]) => photoFindFirst(...args),
      update: (...args: unknown[]) => photoUpdate(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

import { POST } from "../route";

const ACM_LABELS = {
  damageCategory: "CAT_2",
  secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
  affectedMaterial: ["CARPET"],
  suggestedAreaM2: 12.5,
};

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  photoFindFirst.mockReset();
  photoUpdate.mockReset();
  auditLogCreate.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  inspectionFindFirst.mockResolvedValue({ id: "i_1" });
  photoFindFirst.mockResolvedValue({
    id: "p_1",
    aiLabels: ACM_LABELS,
    metadata: {},
    labelledBy: "HUMAN_TECH",
  });
  photoUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "p_1",
    labelledBy: data.labelledBy,
    metadata: data.metadata,
    secondaryDamageIndicators: data.secondaryDamageIndicators ?? [],
    affectedMaterial: data.affectedMaterial ?? [],
    damageCategory: data.damageCategory ?? null,
    aiLabels: ACM_LABELS,
  }));
  auditLogCreate.mockResolvedValue({ id: "a_1" });
});

function post(decision: string) {
  return POST(
    new NextRequest(
      "http://localhost/api/inspections/i_1/photos/p_1/classification-review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      },
    ),
    { params: Promise.resolve({ id: "i_1", photoId: "p_1" }) },
  );
}

describe("POST photo classification-review (RA-7613)", () => {
  it("accepts labels as ai_suggested with zero billable quantity and raises the ACM latch", async () => {
    const res = await post("accept");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("accepted");
    expect(body.review.provenance).toBe("ai_suggested");
    expect(body.review.billableQuantity).toBe(0);
    expect(body.review.whsLatch.aiRaisedAcm).toBe(true);
    expect(photoUpdate.mock.calls[0][0].data.labelledBy).toBe("AI_ASSISTED");
  });

  it("reject does not copy fields and does not clear a prior ACM latch", async () => {
    photoFindFirst.mockResolvedValueOnce({
      id: "p_1",
      aiLabels: { secondaryDamageIndicators: ["STAINING"] },
      metadata: {
        photoAi: { whsLatch: { aiRaisedAcm: true }, reviewStatus: "accepted" },
      },
      labelledBy: "AI_ASSISTED",
    });
    const res = await post("reject");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("rejected");
    expect(body.review.whsLatch.aiRaisedAcm).toBe(true);
    expect(photoUpdate.mock.calls[0][0].data.damageCategory).toBeUndefined();
  });

  it("confirm after accept promotes provenance and may bill the suggested area", async () => {
    photoFindFirst.mockResolvedValueOnce({
      id: "p_1",
      aiLabels: ACM_LABELS,
      metadata: {
        photoAi: {
          reviewStatus: "accepted",
          provenance: "ai_suggested",
          labelledBy: "AI_ASSISTED",
          acceptedLabels: ACM_LABELS,
          suggestedAreaM2: 12.5,
          whsLatch: { aiRaisedAcm: true },
        },
      },
      labelledBy: "AI_ASSISTED",
    });
    const res = await post("confirm");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("confirmed");
    expect(body.review.provenance).toBe("operator_measured");
    expect(body.review.billableQuantity).toBe(12.5);
  });

  it("401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await post("accept");
    expect(res.status).toBe(401);
  });
});
