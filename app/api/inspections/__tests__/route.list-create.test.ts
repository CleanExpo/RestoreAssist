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
const inspectionFindUnique = vi.fn();
const inspectionFindFirst = vi.hoisted(() => vi.fn());
const idempotencyRecordFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportCreate = vi.fn();
const reportUpdateMany = vi.fn();
const clientFindFirst = vi.fn();
const auditCreate = vi.fn();
let transactionDepth = 0;
// RA-7582: the list handler resolves tenancy through
// lib/auth/assert-tenancy.ts, which reads the caller's role and organisation
// from the database rather than trusting the JWT. Without this stub the route
// answers 500 instead of 200.
const userFindUnique = vi.fn();
// Report-link reach is decided by assertReportLinkable (creator, or an ADMIN
// or MANAGER of the creator's organisation). Its own rules are covered against a real
// database in route.report-linked.scenarios.integration.test.ts; here it
// follows the report the route just loaded, creator only.
const assertReportLinkable = vi.fn(
  async (session: { user: { id: string } }, reportId: string) => {
    const last = reportFindUnique.mock.results.at(-1);
    const report = last ? await last.value : null;
    return report && report.userId === session.user.id
      ? { ok: true, data: { id: reportId, userId: report.userId } }
      : { ok: false, status: 404, reason: "Report not found" };
  },
);
vi.mock("@/lib/auth/assert-tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/assert-tenancy")>()),
  assertReportLinkable: (...a: [{ user: { id: string } }, string]) =>
    assertReportLinkable(...a),
  // The in-transaction re-check is proven against a real database in
  // route.report-linked.scenarios.integration.test.ts; here it agrees with
  // the stubbed pre-check above.
  reportLinkableInTx: async () => true,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findMany: (...a: unknown[]) => inspectionFindMany(...a),
      count: (...a: unknown[]) => inspectionCount(...a),
      create: (...a: unknown[]) => inspectionCreate(...a),
      findFirst: inspectionFindFirst,
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
    },
    report: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: (...a: unknown[]) => reportFindUnique(...a),
      create: (...a: unknown[]) => reportCreate(...a),
      updateMany: (...a: unknown[]) => reportUpdateMany(...a),
    },
    client: { findFirst: (...a: unknown[]) => clientFindFirst(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
    idempotencyRecord: { findUnique: (...a: unknown[]) => idempotencyRecordFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionDepth++;
      try {
        return await fn({
        inspection: { create: (...a: unknown[]) => inspectionCreate(...a) },
        report: {
          create: (...a: unknown[]) => reportCreate(...a),
          updateMany: (...a: unknown[]) => reportUpdateMany(...a),
        },
        });
      } finally {
        transactionDepth--;
      }
    },
  },
}));

const idempotencyComplete = vi.fn();
const withIdempotencyMock = vi.fn(async (
  request: { text: () => Promise<string> },
  _userId: string,
  cb: (raw: string) => Promise<unknown>,
) => cb(await request.text()));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (...args: Parameters<typeof withIdempotencyMock>) => withIdempotencyMock(...args),
  getIdempotencyKey: (request: NextRequest) => ({
    ok: true, key: request.headers.get("Idempotency-Key"),
  }),
  completeIdempotentSuccessInTransaction: (...args: unknown[]) => idempotencyComplete(...args),
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
function postReq(body: unknown, idempotencyKey?: string): NextRequest {
  return new NextRequest("http://localhost/api/inspections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

beforeEach(() => {
  transactionDepth = 0;
  withIdempotencyMock.mockReset().mockImplementation(async (request, _userId, cb) =>
    cb(await request.text()));
  idempotencyComplete.mockReset().mockResolvedValue(true);
  getServerSession.mockReset();
  inspectionFindMany.mockReset();
  inspectionCount.mockReset();
  inspectionCreate.mockReset();
  inspectionFindUnique.mockReset().mockResolvedValue(null);
  inspectionFindFirst.mockReset().mockResolvedValue(null);
  idempotencyRecordFindUnique.mockReset().mockResolvedValue(null);
  reportFindUnique.mockReset();
  reportCreate.mockReset();
  reportUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  clientFindFirst.mockReset();
  auditCreate.mockReset();
  userFindUnique.mockReset();
  // Default caller: a solo operator with no organisation, which is the
  // narrowest reach the resolver can return.
  userFindUnique.mockResolvedValue({ role: "USER", organizationId: null });
});

describe("GET /api/inspections", () => {
  it("offers same-key retry only for a fresh missing record, never an expired record", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    const key = `nir-inspection-${Date.now()}-123e4567-e89b-42d3-a456-426614174000`;
    const request = () => new NextRequest("http://localhost/api/inspections?creationStatus=1", {
      headers: { "Idempotency-Key": key },
    });
    expect(await (await GET(request())).json()).toEqual({ state: "retryable_missing" });
    idempotencyRecordFindUnique.mockResolvedValueOnce({
      scope: "owner", key, status: "PENDING", responseStatus: null,
      responseBody: null, expiresAt: new Date(Date.now() - 1000),
    });
    expect(await (await GET(request())).json()).toEqual({ state: "retryable_missing" });
    idempotencyRecordFindUnique.mockResolvedValueOnce({
      scope: "owner", key, status: "COMPLETE", responseStatus: 201,
      responseBody: JSON.stringify({ inspection: { id: "job-1" } }),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await (await GET(request())).json()).toEqual({ state: "missing" });
  });
  it("recovers only the owner's committed client-linked inspection for its exact key", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    const key = "client-draft-1";
    idempotencyRecordFindUnique.mockResolvedValue({
      scope: "owner", key, status: "COMPLETE", responseStatus: 201,
      responseBody: JSON.stringify({ inspection: { id: "job-1" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const saved = {
      id: "job-1", claimType: "MOULD", propertyAddress: "1 Verified St",
      propertyPostcode: "4000", inspectionDate: null,
      lossDescription: "Verified description", technicianName: null,
    };
    inspectionFindFirst.mockResolvedValue(saved);
    const request = new NextRequest("http://localhost/api/inspections?creationStatus=1&clientId=client-1", {
      headers: { "Idempotency-Key": key },
    });
    const response = await GET(request);
    expect(await response.json()).toEqual({ state: "complete", inspection: saved });
    expect(inspectionFindFirst).toHaveBeenCalledWith({
      // The caller's read reach (own rows here; an ADMIN's reaches the
      // report owner's job), AND the recorded id and requested client.
      where: {
        AND: [
          {
            AND: [
              {
                OR: [
                  { userId: "owner" },
                  { workspace: { members: { some: { userId: "owner", status: "ACTIVE" } } } },
                ],
              },
            ],
          },
          { id: "job-1", report: { is: { clientId: "client-1" } } },
        ],
      },
      select: {
        id: true, claimType: true, propertyAddress: true,
        propertyPostcode: true, inspectionDate: true,
        lossDescription: true, technicianName: true,
      },
    });

    inspectionFindFirst.mockResolvedValueOnce(null);
    expect(await (await GET(new NextRequest(request.url, { headers: { "Idempotency-Key": key } }))).json())
      .toEqual({ state: "unconfirmed" });
    idempotencyRecordFindUnique.mockResolvedValueOnce({
      scope: "other", key, status: "COMPLETE", responseStatus: 201,
      responseBody: JSON.stringify({ inspection: { id: "foreign-job" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await (await GET(new NextRequest(request.url, { headers: { "Idempotency-Key": key } }))).json())
      .toEqual({ state: "missing" });
  });
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

  it("does not skip the lookahead inspection between cursor pages", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u_1" } });
    const rows = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    inspectionCount.mockResolvedValue(rows.length);
    inspectionFindMany.mockImplementation(async (args: {
      cursor?: { id: string };
      skip: number;
      take: number;
    }) => {
      const cursorIndex = args.cursor
        ? rows.findIndex((row) => row.id === args.cursor!.id)
        : 0;
      return rows.slice(cursorIndex + args.skip, cursorIndex + args.skip + args.take);
    });

    const first = await (await GET(getReq("?limit=2"))).json();
    const second = await (await GET(getReq(`?limit=2&cursor=${first.nextCursor}`))).json();
    const third = await (await GET(getReq(`?limit=2&cursor=${second.nextCursor}`))).json();

    expect([...first.inspections, ...second.inspections, ...third.inspections].map(
      (inspection: { id: string }) => inspection.id,
    )).toEqual(["a", "b", "c", "d", "e"]);
    expect(first.nextCursor).toBe("b");
    expect(second.nextCursor).toBe("d");
    expect(third.nextCursor).toBeNull();
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

  // RA-7711 — Field Mode lists the signed-in technician's jobs plus the
  // workspace's unassigned ones. The clause must sit under AND so a search
  // (which assigns where.OR) cannot erase it, and must not replace tenancy.
  it("narrows ?assignee=me to the caller's jobs or unassigned ones, under AND", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org_1" });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    const res = await GET(getReq("?assignee=me&search=smith"));
    expect(res.status).toBe(200);

    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.AND[0].OR).toContainEqual({ userId: "u_1" });
    expect(whereArg.AND).toContainEqual({
      OR: [{ technicianId: "u_1" }, { technicianId: null }],
    });
    expect(whereArg.OR).toBeTruthy();
  });

  // RA-7711 (B2) — the reported job had a technician and the viewer was the
  // owner. ADMIN and MANAGER (read from the DB, never the JWT — RULES #3)
  // see every active job in their tenant scope; USER sees own + unassigned.
  // Tenancy (the organisation clause) stays in every case, so no role sees
  // another organisation's jobs.
  for (const role of ["ADMIN", "MANAGER"] as const) {
    it(`?assignee=me does not narrow a DB ${role} (JWT says USER)`, async () => {
      getServerSession.mockResolvedValueOnce({
        user: { id: "u_owner", role: "USER" },
      });
      userFindUnique.mockResolvedValue({ role, organizationId: "org_1" });
      inspectionCount.mockResolvedValueOnce(0);
      inspectionFindMany.mockResolvedValueOnce([]);

      const res = await GET(getReq("?assignee=me&status=ESTIMATED"));
      expect(res.status).toBe(200);

      const whereArg = inspectionFindMany.mock.calls[0][0].where;
      expect(JSON.stringify(whereArg)).not.toContain("technicianId");
      expect(whereArg.AND[0].OR).toContainEqual({
        user: { organizationId: "org_1" },
      });
    });
  }

  it("?assignee=me narrows a DB USER even when the JWT says ADMIN", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org_1" });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    await GET(getReq("?assignee=me&status=ESTIMATED"));
    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(whereArg.AND).toContainEqual({
      OR: [{ technicianId: "u_1" }, { technicianId: null }],
    });
    expect(whereArg.AND[0].OR).toContainEqual({
      user: { organizationId: "org_1" },
    });
  });

  it("does not narrow by assignee unless asked", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(0);
    inspectionFindMany.mockResolvedValueOnce([]);

    await GET(getReq());
    const whereArg = inspectionFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(whereArg)).not.toContain("technicianId");
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

  // RA-7610: the technician form resumes from this response and its
  // classification preview matches a room-linked reading by the room's name,
  // so each reading must arrive with its sketch room, as submit loads it.
  it("returns each moisture reading with its linked sketch room when resuming by reportId", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const { prisma } = await import("@/lib/prisma");
    const inspectionFindFirst = vi.mocked(prisma.inspection.findFirst);
    inspectionFindFirst.mockResolvedValueOnce({ id: "insp-1" } as never);

    const res = await GET(getReq("?reportId=rep-1"));
    expect(res.status).toBe(200);

    const include = inspectionFindFirst.mock.calls[0][0]!.include as {
      moistureReadings: { include?: { sketchRoom?: unknown } };
    };
    // Resume uses the same read reach as the list, plus the report link.
    const { resolveInspectionReach } = await import("@/lib/auth/assert-tenancy");
    const reach = await resolveInspectionReach({ user: { id: "u_1" } });
    expect(reach.ok).toBe(true);
    expect(inspectionFindFirst.mock.calls[0][0]!.where).toEqual({
      AND: [reach.ok ? reach.data : null, { reportId: "rep-1" }],
    });
    expect(include.moistureReadings.include?.sketchRoom).toEqual({
      select: { id: true, name: true },
    });
  });

  it("returns only scalar job fields on the mobile list and keeps tenant reach", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    inspectionCount.mockResolvedValueOnce(1);
    inspectionFindMany.mockResolvedValueOnce([{ id: "job-1", inspectionDate: null }]);
    const res = await GET(getReq("?view=mobile&limit=100"));
    expect(res.status).toBe(200);
    expect((await res.json()).inspections[0].inspectionDate).toBeNull();
    const args = inspectionFindMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select.inspectionNumber).toBe(true);
    expect(args.where.AND[0].OR).toContainEqual({ userId: "u_1" });
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
    expect(data.inspectionDate).toBeNull();
    expect(data.reportId).toBeNull();
    expect(data.lossDescription).toBeNull();
    expect(data.inspectionNumber).toMatch(/^NIR-\d{4}-\d{2}-[0-9A-F]{6}$/);
  });

  it("links an owned existing report and previously unlinked client without cloning either", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "owner" } });
    clientFindFirst.mockResolvedValueOnce({ id: "client-1", name: "Claim client" });
    reportFindUnique.mockResolvedValueOnce({
      id: "report-1", userId: "owner", clientId: null,
      propertyAddress: "1 Test St", propertyPostcode: "4000",
    });
    inspectionCreate.mockResolvedValueOnce({ id: "job-1", status: "DRAFT" });

    const res = await POST(postReq({
      reportId: "report-1", clientId: "client-1",
      propertyAddress: "1 Test St", propertyPostcode: "4000",
      claimType: "WATER", lossDescription: "Source brief only",
    }));
    expect(res.status).toBe(201);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(reportUpdateMany).toHaveBeenCalledWith({
      where: { id: "report-1", userId: "owner", clientId: null },
      data: { clientId: "client-1" },
    });
    expect(inspectionCreate.mock.calls[0][0].data).toMatchObject({
      reportId: "report-1", inspectionDate: null,
      claimType: "WATER", lossDescription: "Source brief only",
    });
    expect(inspectionCreate.mock.calls[0][0].include).toMatchObject({
      affectedAreas: true, moistureReadings: true,
    });
  });

  it("returns an existing report-linked inspection on retry", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "owner" } });
    reportFindUnique.mockResolvedValueOnce({
      id: "report-1", userId: "owner", clientId: "client-1",
      propertyAddress: "1 Test St", propertyPostcode: "4000",
    });
    inspectionFindUnique.mockResolvedValueOnce({ id: "job-1", userId: "owner", status: "DRAFT" });
    const res = await POST(postReq({
      reportId: "report-1", propertyAddress: "1 Test St", propertyPostcode: "4000",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).inspection.id).toBe("job-1");
    expect(inspectionCreate).not.toHaveBeenCalled();
  });

  it("creates one client report and job only with an explicit claim type", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    clientFindFirst.mockResolvedValue({ id: "client-1", name: "Claim client" });
    const input = { clientId: "client-1", propertyAddress: "2 Test St", propertyPostcode: "4000" };
    expect((await POST(postReq({ ...input, claimType: "WATER" }))).status).toBe(400);
    expect(clientFindFirst).not.toHaveBeenCalled();
    expect((await POST(postReq(input, "client-draft-1"))).status).toBe(400);
    expect(reportCreate).not.toHaveBeenCalled();

    reportCreate.mockResolvedValueOnce({ id: "shell-1" });
    inspectionCreate.mockResolvedValueOnce({ id: "job-2", status: "DRAFT" });
    const res = await POST(postReq({
      ...input, claimType: "WATER", lossDescription: "Verified source brief",
    }, "client-draft-1"));
    expect(res.status).toBe(201);
    expect(reportCreate.mock.calls[0][0].data).toMatchObject({
      clientId: "client-1", hazardType: "WATER", description: "Verified source brief",
    });
    expect(inspectionCreate.mock.calls[0][0].data).toMatchObject({
      reportId: "shell-1", inspectionDate: null, claimType: "WATER",
    });
    expect(idempotencyComplete).toHaveBeenCalledWith(expect.objectContaining({
      scope: "owner", key: "client-draft-1", responseStatus: 201,
    }));
  });

  it("replays one shell report and job after their committed response is lost", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    clientFindFirst.mockResolvedValue({ id: "client-1", name: "Claim client" });
    reportCreate.mockResolvedValue({ id: "shell-1" });
    inspectionCreate.mockResolvedValue({ id: "job-1", userId: "owner", status: "DRAFT" });
    let committedBody: string | null = null;
    let loseFirstResponse = true;
    idempotencyComplete.mockImplementation(async ({ responseBody, responseStatus }) => {
      expect(transactionDepth).toBe(1);
      expect(responseStatus).toBe(201);
      committedBody = responseBody;
      return true;
    });
    withIdempotencyMock.mockImplementation(async (request, _userId, handler) => {
      if (committedBody) return new Response(committedBody, { status: 201 });
      const result = await handler(await request.text());
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error("synthetic lost response after commit");
      }
      return result;
    });
    const body = { clientId: "client-1", claimType: "WATER", propertyAddress: "2 Test St", propertyPostcode: "4000" };
    await expect(POST(postReq(body, "client-draft-1"))).rejects.toThrow("synthetic lost response");
    const replay = await POST(postReq(body, "client-draft-1"));
    expect(replay.status).toBe(201);
    expect((await replay.json()).inspection.id).toBe("job-1");
    expect(reportCreate).toHaveBeenCalledTimes(1);
    expect(inspectionCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses an uncertain create if its transaction cannot complete the reservation", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    clientFindFirst.mockResolvedValue({ id: "client-1", name: "Claim client" });
    reportCreate.mockResolvedValue({ id: "shell-1" });
    inspectionCreate.mockResolvedValue({ id: "job-1", status: "DRAFT" });
    idempotencyComplete.mockResolvedValue(false);

    const response = await POST(postReq({
      clientId: "client-1", claimType: "WATER", propertyAddress: "2 Test St", propertyPostcode: "4000",
    }, "client-draft-1"));
    expect(response.status).toBe(409);
    expect(response.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBe("true");
  });

  it("accepts a supplied date and rejects an invalid date", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    inspectionCreate.mockResolvedValueOnce({ id: "job-1", status: "DRAFT" });
    expect((await POST(postReq({
      propertyAddress: "1 Test St", propertyPostcode: "4000", inspectionDate: "2026-10-01",
    }))).status).toBe(201);
    expect(inspectionCreate.mock.calls[0][0].data.inspectionDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect((await POST(postReq({
      propertyAddress: "1 Test St", propertyPostcode: "4000", inspectionDate: "yesterdayish",
    }))).status).toBe(400);
    expect(inspectionCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign report and a different report client", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner" } });
    reportFindUnique.mockResolvedValueOnce({ id: "report-1", userId: "other" });
    const base = { reportId: "report-1", propertyAddress: "1 Test St", propertyPostcode: "4000" };
    expect((await POST(postReq(base))).status).toBe(404);

    reportFindUnique.mockResolvedValueOnce({
      id: "report-1", userId: "owner", clientId: "client-2",
      propertyAddress: "1 Test St", propertyPostcode: "4000",
    });
    clientFindFirst.mockResolvedValueOnce({ id: "client-1", name: "Other" });
    expect((await POST(postReq({ ...base, clientId: "client-1" }))).status).toBe(409);
    expect(inspectionCreate).not.toHaveBeenCalled();
  });

  it("does not return another worker's existing job for an owned report", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "owner" } });
    reportFindUnique.mockResolvedValueOnce({
      id: "report-1", userId: "owner", clientId: null,
      propertyAddress: "1 Test St", propertyPostcode: "4000",
    });
    inspectionFindUnique.mockResolvedValueOnce({ id: "other-job", userId: "other" });
    const res = await POST(postReq({
      reportId: "report-1", propertyAddress: "1 Test St", propertyPostcode: "4000",
    }));
    expect(res.status).toBe(409);
    expect(inspectionCreate).not.toHaveBeenCalled();
  });
});
