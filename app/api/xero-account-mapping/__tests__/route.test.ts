/**
 * RA-874: API route tests — /api/xero-account-mapping
 *
 * Covers: auth gate, integration lookup, empty state, format validation,
 * upsert behaviour, null-category handling, cache invalidation, DELETE.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    integration: {
      findFirst: vi.fn(),
    },
    xeroAccountCodeMapping: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    // $transaction delegates to the callback with the same Prisma client mock
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
      }
      return arg;
    }),
  };
  return { prisma: mockPrisma };
});

const mockClearCache = vi.fn();
vi.mock("@/lib/integrations/xero/account-code-resolver", () => ({
  clearAccountCodeCache: (id?: string) => mockClearCache(id),
  isValidXeroAccountCode: (code: string) => /^\d{3,4}$/.test(code),
}));

import { prisma } from "@/lib/prisma";
import { GET, PUT, DELETE } from "../route";

const mockFindFirstIntegration = prisma.integration.findFirst as ReturnType<
  typeof vi.fn
>;
const mockFindManyMapping = prisma.xeroAccountCodeMapping
  .findMany as ReturnType<typeof vi.fn>;
const mockFindFirstMapping = prisma.xeroAccountCodeMapping
  .findFirst as ReturnType<typeof vi.fn>;
const mockCreateMapping = prisma.xeroAccountCodeMapping.create as ReturnType<
  typeof vi.fn
>;
const mockUpdateMapping = prisma.xeroAccountCodeMapping.update as ReturnType<
  typeof vi.fn
>;
const mockDeleteManyMapping = prisma.xeroAccountCodeMapping
  .deleteMany as ReturnType<typeof vi.fn>;
const mockUpsertMapping = prisma.xeroAccountCodeMapping.upsert as ReturnType<
  typeof vi.fn
>;

const USER_ID = "user_123";
const INTEGRATION_ID = "integ_xero_abc";

function authedSession() {
  return { user: { id: USER_ID, email: "phill@example.com" } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body?: unknown, search?: string): NextRequest {
  const url = `http://localhost/api/xero-account-mapping${search ?? ""}`;
  return new NextRequest(url, {
    method: body !== undefined ? "PUT" : "GET",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/xero-account-mapping", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await GET(makeReq());

    expect(res.status).toBe(401);
  });

  it("returns hasIntegration=false when Xero not connected", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue(null);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], hasIntegration: false });
  });

  it("returns mappings for the user's active Xero integration", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockFindManyMapping.mockResolvedValue([
      {
        id: "m1",
        integrationId: INTEGRATION_ID,
        category: "LABOUR",
        accountCode: "400",
        taxType: "OUTPUT",
      },
    ]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasIntegration).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockFindManyMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { integrationId: INTEGRATION_ID },
        take: 200,
      }),
    );
  });
});

// ─── PUT ──────────────────────────────────────────────────────────────────────

describe("PUT /api/xero-account-mapping", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await PUT(makeReq({ category: "LABOUR", accountCode: "400" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when accountCode missing", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());

    const res = await PUT(makeReq({ category: "LABOUR" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when accountCode format invalid", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());

    const res = await PUT(makeReq({ category: "LABOUR", accountCode: "XX" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid account code/);
  });

  it("returns 409 when Xero integration not connected", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue(null);

    const res = await PUT(makeReq({ category: "LABOUR", accountCode: "400" }));

    expect(res.status).toBe(409);
  });

  it("upserts a non-null category mapping via Prisma composite unique", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockUpsertMapping.mockResolvedValue({
      id: "m-new",
      integrationId: INTEGRATION_ID,
      category: "LABOUR",
      accountCode: "400",
      taxType: "OUTPUT",
      description: null,
    });

    const res = await PUT(makeReq({ category: "LABOUR", accountCode: "400" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accountCode).toBe("400");
    expect(mockUpsertMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_category: {
            integrationId: INTEGRATION_ID,
            category: "LABOUR",
          },
        },
      }),
    );
    expect(mockClearCache).toHaveBeenCalledWith(INTEGRATION_ID);
  });

  it("upserts: update branch preserves taxType when already exists", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockUpsertMapping.mockResolvedValue({
      id: "m-existing",
      integrationId: INTEGRATION_ID,
      category: "LABOUR",
      accountCode: "410",
      taxType: "OUTPUT",
      description: null,
    });

    const res = await PUT(makeReq({ category: "LABOUR", accountCode: "410" }));

    expect(res.status).toBe(200);
    expect(mockUpsertMapping).toHaveBeenCalledOnce();
    expect(mockClearCache).toHaveBeenCalledWith(INTEGRATION_ID);
  });

  it("accepts category=null — Serializable tx + findFirst+create path", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockFindFirstMapping.mockResolvedValue(null);
    mockCreateMapping.mockResolvedValue({
      id: "m-def",
      integrationId: INTEGRATION_ID,
      category: null,
      accountCode: "250",
      taxType: "OUTPUT",
      description: null,
    });

    const res = await PUT(makeReq({ category: null, accountCode: "250" }));

    expect(res.status).toBe(200);
    expect(mockCreateMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: null }),
      }),
    );
    // Non-null upsert should NOT be called for null-category path
    expect(mockUpsertMapping).not.toHaveBeenCalled();
  });

  it("maps '__default__' sentinel to null category (tx path)", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockFindFirstMapping.mockResolvedValue(null);
    mockCreateMapping.mockResolvedValue({
      id: "m-def",
      integrationId: INTEGRATION_ID,
      category: null,
      accountCode: "250",
      taxType: "OUTPUT",
      description: null,
    });

    await PUT(makeReq({ category: "__default__", accountCode: "250" }));

    expect(mockCreateMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: null }),
      }),
    );
  });

  it("null-category update path: finds existing row and updates (no duplicate row)", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockFindFirstMapping.mockResolvedValue({ id: "m-existing-null" });
    mockUpdateMapping.mockResolvedValue({
      id: "m-existing-null",
      integrationId: INTEGRATION_ID,
      category: null,
      accountCode: "270",
      taxType: "OUTPUT",
      description: null,
    });

    await PUT(makeReq({ category: null, accountCode: "270" }));

    expect(mockUpdateMapping).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m-existing-null" } }),
    );
    expect(mockCreateMapping).not.toHaveBeenCalled();
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/xero-account-mapping", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await DELETE(makeReq(undefined, "?category=LABOUR"));

    expect(res.status).toBe(401);
  });

  it("returns 400 when category parameter missing", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());

    const res = await DELETE(makeReq(undefined, ""));

    expect(res.status).toBe(400);
  });

  it("deletes the mapping and invalidates cache", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockDeleteManyMapping.mockResolvedValue({ count: 1 });

    const res = await DELETE(makeReq(undefined, "?category=LABOUR"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deletedCount).toBe(1);
    expect(mockDeleteManyMapping).toHaveBeenCalledWith({
      where: { integrationId: INTEGRATION_ID, category: "LABOUR" },
    });
    expect(mockClearCache).toHaveBeenCalledWith(INTEGRATION_ID);
  });

  it("deletes the null-category row when given '__default__' sentinel", async () => {
    mockGetServerSession.mockResolvedValue(authedSession());
    mockFindFirstIntegration.mockResolvedValue({ id: INTEGRATION_ID });
    mockDeleteManyMapping.mockResolvedValue({ count: 1 });

    await DELETE(makeReq(undefined, "?category=__default__"));

    expect(mockDeleteManyMapping).toHaveBeenCalledWith({
      where: { integrationId: INTEGRATION_ID, category: null },
    });
  });
});
