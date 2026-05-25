import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const assertInspectionTenancy = vi.fn();
  const evidenceCreate = vi.fn();
  const clientMutationCreate = vi.fn();
  const clientMutationUpdateMany = vi.fn();
  const idempotencyRecords = new Map<string, any>();

  return {
    getServerSession,
    assertInspectionTenancy,
    evidenceCreate,
    clientMutationCreate,
    clientMutationUpdateMany,
    idempotencyRecord: {
      async create({ data }: { data: any }) {
        if (idempotencyRecords.has(data.cacheKey)) throw { code: "P2002" };
        const record = {
          ...data,
          responseStatus: data.responseStatus ?? null,
          responseBody: data.responseBody ?? null,
          responseContentType: data.responseContentType ?? null,
        };
        idempotencyRecords.set(data.cacheKey, record);
        return record;
      },
      async findUnique({ where }: { where: { cacheKey: string } }) {
        return idempotencyRecords.get(where.cacheKey) ?? null;
      },
      async update({ where, data }: { where: { cacheKey: string }; data: any }) {
        const existing = idempotencyRecords.get(where.cacheKey);
        if (!existing) throw new Error("Missing idempotency record");
        const updated = { ...existing, ...data };
        idempotencyRecords.set(where.cacheKey, updated);
        return updated;
      },
      async deleteMany(args?: any) {
        if (!args?.where) {
          const count = idempotencyRecords.size;
          idempotencyRecords.clear();
          return { count };
        }
        if (args.where.cacheKey) {
          return {
            count: idempotencyRecords.delete(args.where.cacheKey) ? 1 : 0,
          };
        }
        if (args.where.expiresAt?.lt) {
          let count = 0;
          for (const [cacheKey, record] of idempotencyRecords) {
            if (record.expiresAt < args.where.expiresAt.lt) {
              idempotencyRecords.delete(cacheKey);
              count++;
            }
          }
          return { count };
        }
        return { count: 0 };
      },
    },
    reset() {
      idempotencyRecords.clear();
      getServerSession.mockReset();
      assertInspectionTenancy.mockReset();
      evidenceCreate.mockReset();
      clientMutationCreate.mockReset();
      clientMutationUpdateMany.mockReset();
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mocks.getServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...args: unknown[]) =>
    mocks.assertInspectionTenancy(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidenceItem: {
      create: (...args: unknown[]) => mocks.evidenceCreate(...args),
    },
    idempotencyRecord: mocks.idempotencyRecord,
    clientMutation: {
      create: (...args: unknown[]) => mocks.clientMutationCreate(...args),
      updateMany: (...args: unknown[]) =>
        mocks.clientMutationUpdateMany(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      evidenceClass: "PHOTO",
      fileUrl: "https://example.com/photo.jpg",
      fileMimeType: "image/jpeg",
    }),
  });
}

describe("POST /api/inspections/[id]/evidence", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u_1", name: "Tech" },
    });
    mocks.assertInspectionTenancy.mockResolvedValue({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    mocks.evidenceCreate.mockResolvedValue({ id: "ev_1" });
    mocks.clientMutationCreate.mockResolvedValue({ id: "cm_1" });
    mocks.clientMutationUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("records the mobile mutation ledger before completing evidence creation", async () => {
    const response = await POST(
      makeRequest({
        "idempotency-key": "idem-evidence-1",
        "x-restoreassist-mutation-id": "ra-evidence-1",
      }),
      { params: Promise.resolve({ id: "ins_1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.clientMutationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws_1",
        userId: "u_1",
        inspectionId: "ins_1",
        mutationId: "ra-evidence-1",
        mutationType: "evidence-item",
        method: "POST",
        path: "/api/inspections/ins_1/evidence",
        status: "PENDING",
      }),
    });
    expect(mocks.clientMutationUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", mutationId: "ra-evidence-1" },
      data: expect.objectContaining({
        status: "COMPLETE",
        responseStatus: 201,
      }),
    });
  });
});
