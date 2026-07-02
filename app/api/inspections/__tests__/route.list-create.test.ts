import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T1 — main inspections route (GET list + POST create).
// Locks the core CRUD contract: auth gate, tenant scoping, validation, 201 create.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const inspectionFindMany = vi.fn();
const inspectionCount = vi.fn();
const inspectionCreate = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findMany: (...a: unknown[]) => inspectionFindMany(...a),
      count: (...a: unknown[]) => inspectionCount(...a),
      create: (...a: unknown[]) => inspectionCreate(...a),
      findFirst: vi.fn(),
    },
    report: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

// Run the idempotency wrapper's callback directly with the request's raw body.
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _userId: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
}));

// Minimal error helpers so we assert status without pulling the full envelope stack.
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
      headers: { "content-type": "application/json" },
    }),
  fromException: () =>
    new Response(JSON.stringify({ error: "server" }), { status: 500 }),
}));

import { GET, POST } from "../route";

function getReq(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/inspections${qs}`);
}
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inspections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindMany.mockReset();
  inspectionCount.mockReset();
  inspectionCreate.mockReset();
  auditCreate.mockReset();
});

describe("GET /api/inspections", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("lists inspections scoped to the caller with pagination", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?page=1&limit=20"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.inspections).toEqual([]);
    expect(json.pagination).toMatchObject({ page: 1, limit: 20, total: 0 });

    // Tenant scoping: the where clause must pin userId.
    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe("u_1");
  });
});

describe("POST /api/inspections", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(postReq({ propertyAddress: "1 St", propertyPostcode: "4000" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when property address is missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await POST(postReq({ propertyPostcode: "4000" }));
    expect(res.status).toBe(400);
  });

  it("creates a DRAFT inspection owned by the caller and returns 201", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCreate.mockResolvedValueOnce({ id: "i_1", status: "DRAFT" });
    auditCreate.mockResolvedValueOnce({});

    const res = await POST(
      postReq({ propertyAddress: "1 Test St", propertyPostcode: "4000" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.inspection.id).toBe("i_1");

    const data = inspectionCreate.mock.calls[0][0].data;
    expect(data.userId).toBe("u_1");
    expect(data.status).toBe("DRAFT");
    expect(data.inspectionNumber).toMatch(/^NIR-\d{4}-\d{2}-[0-9A-F]{6}$/);
  });
});
