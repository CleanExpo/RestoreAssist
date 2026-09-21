import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const photoFindFirst = vi.fn();
const photoFindUnique = vi.fn();
const photoUpdate = vi.fn();
const auditLogCreate = vi.fn();
const prismaTransaction = vi.fn();

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
      findUnique: (...args: unknown[]) => photoFindUnique(...args),
      update: (...args: unknown[]) => photoUpdate(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
    $transaction: (...args: unknown[]) => prismaTransaction(...args),
  },
}));

import { POST } from "../route";
import { readPhotoAiMetadata } from "@/lib/services/ai/photo-classification-review";

const ACM_LABELS = {
  damageCategory: "CAT_2",
  secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
  affectedMaterial: ["CARPET"],
  suggestedAreaM2: 12.5,
};

type PhotoRow = {
  id: string;
  aiLabels: Record<string, unknown>;
  metadata: unknown;
  labelledBy: string;
  secondaryDamageIndicators: string[];
  affectedMaterial: string[];
  damageCategory: string | null;
};

let currentPhoto: PhotoRow;

/** Same predicate as the photos page STOP WORK banner (`asbestosCount`). */
function asbestosStopWorkCount(
  photos: Array<{
    secondaryDamageIndicators: string[];
    metadata: unknown;
  }>,
): number {
  return photos.filter(
    (p) =>
      p.secondaryDamageIndicators.includes("ASBESTOS_SUSPECT") ||
      readPhotoAiMetadata(p.metadata).whsLatch.aiRaisedAcm,
  ).length;
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  photoFindFirst.mockReset();
  photoFindUnique.mockReset();
  photoUpdate.mockReset();
  auditLogCreate.mockReset();
  prismaTransaction.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  inspectionFindFirst.mockResolvedValue({ id: "i_1" });
  currentPhoto = {
    id: "p_1",
    aiLabels: ACM_LABELS,
    metadata: {},
    labelledBy: "HUMAN_TECH",
    secondaryDamageIndicators: [],
    affectedMaterial: [],
    damageCategory: null,
  };
  photoFindFirst.mockImplementation(async () => ({ ...currentPhoto }));
  photoFindUnique.mockImplementation(async () => ({ ...currentPhoto }));
  photoUpdate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      currentPhoto = {
        ...currentPhoto,
        labelledBy:
          data.labelledBy === undefined
            ? currentPhoto.labelledBy
            : (data.labelledBy as string),
        metadata:
          data.metadata === undefined ? currentPhoto.metadata : data.metadata,
        secondaryDamageIndicators:
          data.secondaryDamageIndicators === undefined
            ? currentPhoto.secondaryDamageIndicators
            : (data.secondaryDamageIndicators as string[]),
        affectedMaterial:
          data.affectedMaterial === undefined
            ? currentPhoto.affectedMaterial
            : (data.affectedMaterial as string[]),
        damageCategory:
          data.damageCategory === undefined
            ? currentPhoto.damageCategory
            : (data.damageCategory as string | null),
      };
      return { ...currentPhoto };
    },
  );
  prismaTransaction.mockImplementation(
    async (
      fn: (tx: {
        $queryRaw: (query: unknown) => Promise<unknown>;
        inspectionPhoto: {
          findUnique: typeof photoFindUnique;
          update: typeof photoUpdate;
        };
      }) => Promise<unknown>,
    ) =>
      fn({
        $queryRaw: async () => [{ id: currentPhoto.id }],
        inspectionPhoto: {
          findUnique: (...args: unknown[]) => photoFindUnique(...args),
          update: (...args: unknown[]) => photoUpdate(...args),
        },
      }),
  );
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
    currentPhoto = {
      id: "p_1",
      aiLabels: { secondaryDamageIndicators: ["STAINING"] },
      metadata: {
        photoAi: { whsLatch: { aiRaisedAcm: true }, reviewStatus: "accepted" },
      },
      labelledBy: "AI_ASSISTED",
      secondaryDamageIndicators: [],
      affectedMaterial: [],
      damageCategory: null,
    };
    const res = await post("reject");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("rejected");
    expect(body.review.whsLatch.aiRaisedAcm).toBe(true);
    expect(photoUpdate.mock.calls[0][0].data.damageCategory).toBeUndefined();
  });

  it("confirm after accept promotes provenance and may bill the suggested area", async () => {
    currentPhoto = {
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
      secondaryDamageIndicators: [],
      affectedMaterial: [],
      damageCategory: null,
    };
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

  it("accepting AI MOULD_VISIBLE never drops a technician ASBESTOS_SUSPECT or the STOP WORK banner", async () => {
    currentPhoto = {
      id: "p_1",
      aiLabels: { secondaryDamageIndicators: ["MOULD_VISIBLE"] },
      metadata: {},
      labelledBy: "HUMAN_TECH",
      secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
      affectedMaterial: ["CARPET"],
      damageCategory: "CAT_3",
    };
    const beforeCount = asbestosStopWorkCount([currentPhoto]);
    expect(beforeCount).toBe(1);

    const res = await post("accept");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.photo.secondaryDamageIndicators).toContain("ASBESTOS_SUSPECT");
    expect(body.photo.secondaryDamageIndicators).toContain("MOULD_VISIBLE");
    expect(body.photo.damageCategory).toBe("CAT_3");
    expect(body.photo.affectedMaterial).toContain("CARPET");
    expect(asbestosStopWorkCount([body.photo])).toBe(1);
    expect(asbestosStopWorkCount([body.photo])).toBe(beforeCount);
  });

  it("reject does not overwrite a HUMAN_TECH labelledBy with AI_AUTO", async () => {
    currentPhoto = {
      id: "p_1",
      aiLabels: { secondaryDamageIndicators: ["MOULD_VISIBLE"] },
      metadata: {},
      labelledBy: "HUMAN_TECH",
      secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
      affectedMaterial: ["CARPET"],
      damageCategory: "CAT_3",
    };

    const res = await post("reject");
    expect(res.status).toBe(200);
    const body = await res.json();
    const written = photoUpdate.mock.calls[0][0].data.labelledBy;
    expect(written).not.toBe("AI_AUTO");
    expect(body.photo.labelledBy).toBe("HUMAN_TECH");
  });

  it("RA-7618: FOR UPDATE lock runs before the metadata read inside the write transaction", async () => {
    const txOrder: string[] = [];
    const lockQueries: unknown[] = [];
    prismaTransaction.mockImplementation(
      async (
        fn: (tx: {
          $queryRaw: (query: unknown) => Promise<unknown>;
          inspectionPhoto: {
            findUnique: typeof photoFindUnique;
            update: typeof photoUpdate;
          };
        }) => Promise<unknown>,
      ) =>
        fn({
          $queryRaw: async (query: unknown) => {
            txOrder.push("lock");
            lockQueries.push(query);
            return [{ id: currentPhoto.id }];
          },
          inspectionPhoto: {
            findUnique: async (...args: unknown[]) => {
              txOrder.push("read");
              return photoFindUnique(...args);
            },
            update: async (...args: unknown[]) => {
              txOrder.push("write");
              return photoUpdate(...args);
            },
          },
        }),
    );

    const res = await post("accept");
    expect(res.status).toBe(200);
    expect(txOrder).toEqual(["lock", "read", "write"]);
    const lockSql = prismaSqlText(lockQueries[0]);
    expect(lockSql).toContain('SELECT "id" FROM "InspectionPhoto"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(prismaSqlValues(lockQueries[0])).toContain("p_1");
  });
});

function prismaSqlText(query: unknown): string {
  if (!query || typeof query !== "object") return String(query);
  const q = query as { sql?: string; strings?: readonly string[] };
  if (typeof q.sql === "string") return q.sql;
  if (Array.isArray(q.strings)) return q.strings.join(" ");
  return String(query);
}

function prismaSqlValues(query: unknown): unknown[] {
  if (!query || typeof query !== "object") return [];
  const q = query as { values?: unknown[] };
  return Array.isArray(q.values) ? q.values : [];
}
