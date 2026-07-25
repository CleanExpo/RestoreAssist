import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const assertInspectionTenancy = vi.fn();
  const evidenceCreate = vi.fn();
  const clientMutationCreate = vi.fn();
  const clientMutationUpdateMany = vi.fn();
  const signingKeyFindFirst = vi.fn();
  const idempotencyRecords = new Map<string, any>();

  return {
    getServerSession,
    assertInspectionTenancy,
    evidenceCreate,
    clientMutationCreate,
    clientMutationUpdateMany,
    signingKeyFindFirst,
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
      signingKeyFindFirst.mockReset().mockResolvedValue(null);
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
    // The fail-closed policy probes for a live signing key; default: none.
    deviceSigningKey: {
      findFirst: (...args: unknown[]) => mocks.signingKeyFindFirst(...args),
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

// RA-7090 slice 2 (P1): the JSON writer is metadata-only. File-bearing
// fields are rejected (byte uploads go through the signed multipart path), so
// this baseline fixture is a genuinely metadata-only record.
function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      evidenceClass: "TECHNICIAN_NOTE",
      notes: "north wall damp reading",
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
    // The metadata-only mechanics below (mutation ledger) are orthogonal to
    // signing; exercise them under an EXPLICIT policy-OFF. The fail-closed
    // rejection under policy ON is proven in its own describe.
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
  });

  afterEach(() => {
    delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
  });

  it("records the mobile mutation ledger before completing evidence creation (policy OFF)", async () => {
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

  // P0 terminal fix: under the fail-closed policy there is NO unsigned path,
  // so an unsigned metadata-only JSON submission is REJECTED regardless of
  // content. This closes the whole encoding-smuggle class the reviewer
  // ADMITTED against the old heuristic — every one of these now 400s because
  // it is unsigned, not because we tried (and failed) to detect the bytes.
  describe("policy ON: unsigned metadata JSON is rejected regardless of content", () => {
    beforeEach(() => {
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    });

    function jsonPost(body: Record<string, unknown>) {
      return POST(
        new NextRequest("http://localhost/api/inspections/ins_1/evidence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: "ins_1" }) },
      );
    }

    it.each([
      ["a plain text note", { evidenceClass: "TECHNICIAN_NOTE", notes: "hi" }],
      [
        "file provenance fields",
        {
          evidenceClass: "PHOTO_DAMAGE",
          fileUrl: "https://x/p.jpg",
          fileMimeType: "image/jpeg",
          fileSizeBytes: 12345,
          thumbnailUrl: "https://x/t.jpg",
        },
      ],
      // The exact vectors the reviewer admitted defeated the heuristic:
      [
        "a real 1x1 PNG (92 base64 chars, under any threshold)",
        {
          evidenceClass: "PHOTO_DAMAGE",
          structuredData: {
            img: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          },
        },
      ],
      [
        "hex-encoded bytes",
        { evidenceClass: "PHOTO_DAMAGE", structuredData: { hex: "ffd8ffe000104a46" } },
      ],
      [
        "a comma-separated int string",
        { evidenceClass: "PHOTO_DAMAGE", structuredData: { csv: "255,216,255,224" } },
      ],
      [
        "a 63-element byte array (under the old array threshold)",
        {
          evidenceClass: "PHOTO_DAMAGE",
          structuredData: {
            arr: Array.from({ length: 63 }, (_, i) => i % 256),
          },
        },
      ],
      [
        "a data: URL split across two fields",
        {
          evidenceClass: "PHOTO_DAMAGE",
          structuredData: { a: "data:image/jpeg;base64,", b: "/9j/4AAQSkZJRg==" },
        },
      ],
      [
        "bytes carried on an object KEY",
        {
          evidenceClass: "PHOTO_DAMAGE",
          structuredData: { "data:image/jpeg;base64,/9j/4AAQ==": true },
        },
      ],
    ])("REJECTS %s with 400 (unsigned, no smuggle path)", async (_label, body) => {
      const res = await jsonPost(body);
      expect(res.status).toBe(400);
      expect(mocks.evidenceCreate).not.toHaveBeenCalled();
    });
  });
});
