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
// RA-7582: the list handler resolves tenancy through
// lib/auth/assert-tenancy.ts, which reads the caller's role and organisation
// from the database rather than trusting the JWT. Without this stub the route
// answers 500 instead of 200.
const userFindUnique = vi.fn();
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
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
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
  userFindUnique.mockReset();
  // Default caller: a solo operator with no organisation, which is the
  // narrowest reach the resolver can return.
  userFindUnique.mockResolvedValue({ role: "USER", organizationId: null });
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

    // Tenant scoping. This used to assert `whereArg.userId === "u_1"`, which
    // was the defect written down as an expectation (RA-7582): pinning the
    // list to the caller is exactly what showed an invited technician an empty
    // product. A solo operator with no organisation still reaches only their
    // own records, so that guarantee is asserted rather than dropped.
    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.AND[0].OR).toEqual([
      { userId: "u_1" },
      { workspace: { members: { some: { userId: "u_1", status: "ACTIVE" } } } },
    ]);
    expect(JSON.stringify(whereArg)).not.toContain("organizationId");
  });

  it("reaches the organisation when the caller belongs to one", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org_1" });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?page=1&limit=20"));
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.AND[0].OR).toContainEqual({
      user: { organizationId: "org_1" },
    });
  });

  it("keeps the tenancy filter when a search term is supplied", async () => {
    // The search filter assigns `where.OR = [...]`. The tenancy filter lives
    // under `AND`, so the assignment cannot erase it. If this ever fails, the
    // endpoint is returning other tenants' rows to anyone who types in the
    // search box.
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org_1" });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?search=smith"));
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.AND[0].OR).toContainEqual({ userId: "u_1" });
    expect(whereArg.OR).toBeTruthy();
  });

  // RA-7567 — Field Mode sends one query value with several statuses
  // (`?status=DRAFT,SUBMITTED,PROCESSING,CLASSIFIED,SCOPED`). Passing that
  // string through to Prisma as a single InspectionStatus 500s. These cases
  // lock the parse: one value stays equality, a comma list becomes `{ in }`,
  // and an unknown token is 400 before Prisma is called. The comma-list
  // assertion is written to fail on unfixed main.
  it("filters a single status as an equality", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?status=DRAFT"));
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("DRAFT");
  });

  it("parses a comma-joined status list as { in: [...] }", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(
      getReq("?status=DRAFT,SUBMITTED,PROCESSING,CLASSIFIED,SCOPED&take=10"),
    );
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toEqual({
      in: ["DRAFT", "SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED"],
    });
  });

  it("returns 400 for an unknown inspection status instead of querying Prisma", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });

    const res = await GET(getReq("?status=NOT_A_STATUS"));
    expect(res.status).toBe(400);
    expect(inspectionFindMany).not.toHaveBeenCalled();
    expect(inspectionCount).not.toHaveBeenCalled();
  });

  it("keeps the active alias as notIn COMPLETED/REJECTED", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?status=active"));
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toEqual({ notIn: ["COMPLETED", "REJECTED"] });
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
