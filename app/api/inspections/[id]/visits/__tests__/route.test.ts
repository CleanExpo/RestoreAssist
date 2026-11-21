/**
 * RA-8498 (DRC S5) — site visit routes.
 *
 *   GET   /api/inspections/[id]/visits                    list (organisation read reach)
 *   POST  /api/inspections/[id]/visits                    start a visit
 *   PATCH /api/inspections/[id]/visits/[visitId]          record arrival, departure, who, photo, equipment
 *   POST  /api/inspections/[id]/visits/[visitId]/submit   submit (the mandatory items gate)
 *
 * Tenancy is the helpers' job (proven in technician-field-capture and
 * technician-read-reach); here they are mocked, and the tests prove each
 * route maps a refusal to an opaque 404 and writes nothing, and that every
 * write runs inside writeWithinInspectionScope with the helper's scope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

const SCOPE = { id: "insp_1", technicianId: "tech_1" };

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  assertInspectionReadable: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
  scopeMatches: true,
  scopesSeen: [] as unknown[],
  inspectionFindUnique: vi.fn(),
  visitFindMany: vi.fn(),
  visitFindFirst: vi.fn(),
  visitCreate: vi.fn(),
  visitUpdateMany: vi.fn(),
  photoFindFirst: vi.fn(),
  evidenceFindMany: vi.fn(),
  auditCreate: vi.fn(),
  txInspectionFindUnique: vi.fn(),
  txAuditCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage/sign-stored-url", () => ({
  signStoredMediaUrl: async (u: string | null) => (u ? `signed:${u}` : u),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    siteVisit: {
      findFirst: m.visitFindFirst,
      create: m.visitCreate,
      updateMany: m.visitUpdateMany,
    },
    // RA-8498 review round 1: the job's status is re-read, and the audit row
    // written, inside the locked transaction (separate mocks from the root
    // client so a test can tell which one a route used).
    inspection: { findUnique: m.txInspectionFindUnique },
    auditLog: { create: m.txAuditCreate },
  };
  return {
    prisma: {
      inspection: { findUnique: m.inspectionFindUnique },
      siteVisit: { findMany: m.visitFindMany, findFirst: m.visitFindFirst },
      inspectionPhoto: { findFirst: m.photoFindFirst },
      evidenceItem: { findMany: m.evidenceFindMany },
      auditLog: { create: m.auditCreate },
      __tx: tx,
    },
  };
});
vi.mock("@/lib/auth/assert-tenancy", async () => {
  const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: { __tx: unknown } };
  return {
    assertInspectionReadable: m.assertInspectionReadable,
    assertInspectionAssignedWrite: m.assertInspectionAssignedWrite,
    writeWithinInspectionScope: async (scope: unknown, _data: unknown, work: (tx: unknown) => Promise<unknown>) => {
      m.scopesSeen.push(scope);
      return m.scopeMatches ? work(prisma.__tx) : null;
    },
  };
});

import { GET, POST } from "../route";
import { PATCH } from "../[visitId]/route";
import { POST as SUBMIT } from "../[visitId]/submit/route";

const ctx = { params: Promise.resolve({ id: "insp_1" }) };
const vctx = { params: Promise.resolve({ id: "insp_1", visitId: "v1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/inspections/insp_1/visits", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ARRIVED = new Date("2026-11-21T22:05:00Z");
const openVisit = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  inspectionId: "insp_1",
  visitNumber: 1,
  arrivedAt: ARRIVED,
  departedAt: new Date("2026-11-22T00:40:00Z"),
  metOnSite: "TENANT",
  frontPhotoId: "ph_1",
  equipmentOutcome: "ALL_LEFT",
  equipmentNote: null,
  submittedAt: null,
  updatedAt: new Date("2026-11-22T00:41:00Z"),
  ...over,
});

const writes = () =>
  m.visitCreate.mock.calls.length + m.visitUpdateMany.mock.calls.length +
  m.auditCreate.mock.calls.length +
  m.txAuditCreate.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  m.scopeMatches = true;
  m.scopesSeen.length = 0;
  m.getServerSession.mockResolvedValue({ user: { id: "tech_1" } });
  m.assertInspectionReadable.mockResolvedValue({ ok: true, data: { id: "insp_1" } });
  m.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: SCOPE, inspectionWhere: SCOPE, childInspectionFilter: {}, viaAssignment: true },
  });
  m.inspectionFindUnique.mockResolvedValue({ status: "DRAFT" });
  m.visitFindMany.mockResolvedValue([]);
  m.visitFindFirst.mockResolvedValue(null);
  m.visitCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "v_new", ...data }));
  m.visitUpdateMany.mockResolvedValue({ count: 1 });
  m.photoFindFirst.mockResolvedValue({ id: "ph_1", url: "https://s/ph1.jpg" });
  m.evidenceFindMany.mockResolvedValue([]);
  m.auditCreate.mockResolvedValue({});
  m.txInspectionFindUnique.mockResolvedValue({ status: "DRAFT" });
  m.txAuditCreate.mockResolvedValue({});
});

describe("every visit handler refuses without a session or reach", () => {
  const handlers: Array<[string, () => Promise<Response>]> = [
    ["GET list", () => GET(req("GET"), ctx)],
    ["POST start", () => POST(req("POST", {}), ctx)],
    ["PATCH", () => PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx)],
    ["POST submit", () => SUBMIT(req("POST"), vctx)],
  ];

  it.each(handlers)("%s: 401 with no session", async (_n, call) => {
    m.getServerSession.mockResolvedValue(null);
    m.assertInspectionReadable.mockResolvedValue({ ok: false, status: 401, reason: "Unauthorized" });
    m.assertInspectionAssignedWrite.mockResolvedValue({ ok: false, status: 401, reason: "Unauthorized" });
    await expectRefused((await call()), 401, /Unauthorized/);
    expect(writes()).toBe(0);
  });

  it.each(handlers)("%s: 404 when the job is another business's or an unassigned colleague's", async (_n, call) => {
    m.assertInspectionReadable.mockResolvedValue({ ok: false, status: 404, reason: "Inspection not found" });
    m.assertInspectionAssignedWrite.mockResolvedValue({ ok: false, status: 404, reason: "Inspection not found" });
    await expectRefused((await call()), 404, /Inspection not found/);
    expect(writes()).toBe(0);
  });
});

describe("GET /visits", () => {
  it("lists the job's visits, oldest first, with time on site", async () => {
    m.visitFindMany.mockResolvedValue([{ ...openVisit(), frontPhoto: { id: "ph_1", url: "u", thumbnailUrl: null } }]);
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toMatchObject({ id: "v1", visitNumber: 1, minutesOnSite: 155, metOnSite: "TENANT" });
    // The private bucket's URL is signed, as the photos route does.
    expect(body.data[0].frontPhoto).toEqual({ id: "ph_1", url: "signed:u", thumbnailUrl: null });
    const args = m.visitFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ inspectionId: "insp_1" });
    expect(args.orderBy).toEqual({ visitNumber: "asc" });
  });
});

describe("POST /visits (start)", () => {
  it("201: visit 1, arrival now, started by the caller, inside the scoped write", async () => {
    const res = await POST(req("POST", {}), ctx);
    expect(res.status).toBe(201);
    const data = m.visitCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ inspectionId: "insp_1", visitNumber: 1, technicianId: "tech_1" });
    expect(data.arrivedAt).toBeInstanceOf(Date);
    expect(m.scopesSeen).toEqual([SCOPE]);
  });

  it("numbers a re-attendance after the last visit", async () => {
    m.visitFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "submittedAt" in where ? null : { visitNumber: 3 },
    );
    const res = await POST(req("POST", {}), ctx);
    expect(res.status).toBe(201);
    expect(m.visitCreate.mock.calls[0][0].data.visitNumber).toBe(4);
  });

  it("takes an arrival time from the body", async () => {
    const res = await POST(req("POST", { arrivedAt: "2020-03-02T22:05:00Z" }), ctx);
    expect(res.status).toBe(201);
    expect(m.visitCreate.mock.calls[0][0].data.arrivedAt).toEqual(new Date("2020-03-02T22:05:00Z"));
  });

  it("400 for an arrival far in the future", async () => {
    const res = await POST(req("POST", { arrivedAt: new Date(Date.now() + 3 * 3600_000).toISOString() }), ctx);
    await expectRefused(res, 400, /cannot be in the future/);
    expect(writes()).toBe(0);
  });

  it("400 on a malformed arrival time, and writes nothing", async () => {
    const res = await POST(req("POST", { arrivedAt: "this morning" }), ctx);
    await expectRefused(res, 400, /ISO 8601/);
    expect(writes()).toBe(0);
  });

  it("409 while another visit on the job is still open", async () => {
    m.visitFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "submittedAt" in where ? { id: "v_open", visitNumber: 2 } : { visitNumber: 2 },
    );
    const res = await POST(req("POST", {}), ctx);
    await expectRefused(res, 409, /Visit 2 is still open/);
    expect(m.visitCreate).not.toHaveBeenCalled();
  });

  it.each(["CLOSED", "ARCHIVED", "COMPLETED", "REJECTED"])("409 on a %s job", async (status) => {
    m.inspectionFindUnique.mockResolvedValue({ status });
    const res = await POST(req("POST", {}), ctx);
    await expectRefused(res, 409, /job is closed/);
    expect(writes()).toBe(0);
  });

  it("404 when the scope no longer matches at write time (reassigned in between)", async () => {
    m.scopeMatches = false;
    const res = await POST(req("POST", {}), ctx);
    await expectRefused(res, 404, /Inspection not found/);
    expect(m.visitCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /visits/[visitId]", () => {
  beforeEach(() => {
    m.visitFindFirst.mockResolvedValue(openVisit({ departedAt: null, metOnSite: null }));
  });

  it("200: updates only an open visit of this job, inside the scoped write", async () => {
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    expect(res.status).toBe(200);
    const args = m.visitUpdateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "v1", inspectionId: "insp_1", submittedAt: null });
    expect(args.data).toEqual({ metOnSite: "OWNER" });
    expect(m.scopesSeen).toEqual([SCOPE]);
  });

  it("404 for a visit id that is not on this job", async () => {
    m.visitFindFirst.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    await expectRefused(res, 404, /Site visit not found/);
    expect(m.visitFindFirst.mock.calls[0][0].where).toEqual({ id: "v1", inspectionId: "insp_1" });
    expect(writes()).toBe(0);
  });

  it("409 once the visit is submitted", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit({ submittedAt: new Date() }));
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    await expectRefused(res, 409, /has been submitted/);
    expect(writes()).toBe(0);
  });

  it("409 when a submit lands between the read and the write", async () => {
    m.visitUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    await expectRefused(res, 409, /submitted while you were editing/);
  });

  it("400 for a front photo from another job, and writes nothing", async () => {
    m.photoFindFirst.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { frontPhotoId: "ph_other" }), vctx);
    await expectRefused(res, 400, /must be a photo of this job/);
    expect(m.photoFindFirst.mock.calls[0][0].where).toEqual({ id: "ph_other", inspectionId: "insp_1" });
    expect(writes()).toBe(0);
  });

  it("400 for a departure before the stored arrival", async () => {
    const res = await PATCH(req("PATCH", { departedAt: "2026-11-21T21:00:00Z" }), vctx);
    await expectRefused(res, 400, /Departure time must be after arrival time/);
    expect(writes()).toBe(0);
  });

  it("400 for an unknown field", async () => {
    const res = await PATCH(req("PATCH", { submittedAt: "2026-11-21T21:00:00Z" }), vctx);
    await expectRefused(res, 400, /Unknown field: submittedAt/);
    expect(writes()).toBe(0);
  });

  it("409 on a closed job", async () => {
    m.inspectionFindUnique.mockResolvedValue({ status: "CLOSED" });
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    await expectRefused(res, 409, /job is closed/);
    expect(writes()).toBe(0);
  });
});

describe("POST /visits/[visitId]/submit", () => {
  it("422 listing every missing item, and writes nothing", async () => {
    m.visitFindFirst.mockResolvedValue(
      openVisit({ departedAt: null, metOnSite: null, frontPhotoId: null, equipmentOutcome: null }),
    );
    const res = await SUBMIT(req("POST"), vctx);
    const body = (await expectRefused(res, 422, /cannot be submitted yet/)) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fields)).toEqual(["departedAt", "metOnSite", "frontPhotoId", "equipmentOutcome"]);
    expect(writes()).toBe(0);
  });

  it("422 when the front photo's only evidence record is rejected", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    m.evidenceFindMany.mockResolvedValue([{ fileUrl: "https://s/ph1.jpg", status: "REJECTED" }]);
    const res = await SUBMIT(req("POST"), vctx);
    const body = (await expectRefused(res, 422, /Front of property photo/)) as { error: { fields: Record<string, string> } };
    expect(Object.keys(body.error.fields)).toEqual(["frontPhotoId"]);
  });

  it("422 when the front photo is no longer on this job", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    m.photoFindFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), vctx);
    await expectRefused(res, 422, /Front of property photo/);
  });

  it("200: a complete visit is submitted by the caller, pinned to the version checked, and audited", async () => {
    const visit = openVisit();
    m.visitFindFirst.mockResolvedValue(visit);
    const res = await SUBMIT(req("POST"), vctx);
    expect(res.status).toBe(200);
    const args = m.visitUpdateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "v1", inspectionId: "insp_1", submittedAt: null, updatedAt: visit.updatedAt });
    expect(args.data.submittedById).toBe("tech_1");
    expect(args.data.submittedAt).toBeInstanceOf(Date);
    expect(m.scopesSeen).toEqual([SCOPE]);
    // The audit row is written in the same transaction as the submit, so a
    // failed audit insert rolls the submit back (review round 1, P1).
    expect(m.txAuditCreate).toHaveBeenCalledTimes(1);
    expect(m.auditCreate).not.toHaveBeenCalled();
    // The audit row names the visit, never the personal values.
    const audit = JSON.stringify(m.txAuditCreate.mock.calls[0][0]);
    expect(audit).not.toContain("TENANT");
  });

  it("409 when the visit is already submitted", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit({ submittedAt: new Date() }));
    const res = await SUBMIT(req("POST"), vctx);
    await expectRefused(res, 409, /already been submitted/);
    expect(writes()).toBe(0);
  });

  it("409 when the visit changed after it was checked (lost the race)", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    m.visitUpdateMany.mockResolvedValue({ count: 0 });
    const res = await SUBMIT(req("POST"), vctx);
    await expectRefused(res, 409, /changed or was submitted/);
    expect(m.auditCreate).not.toHaveBeenCalled();
    expect(m.txAuditCreate).not.toHaveBeenCalled();
  });

  it("404 for a visit not on this job", async () => {
    m.visitFindFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), vctx);
    await expectRefused(res, 404, /Site visit not found/);
    expect(writes()).toBe(0);
  });
});

// RA-8498 review round 1, P1: a job closed between the route's first status
// read and the locked write must not take a visit write. Each writer re-reads
// the status inside the transaction, after the job's row lock is held.
describe("a job that becomes inactive before the locked write", () => {
  beforeEach(() => {
    m.inspectionFindUnique.mockResolvedValue({ status: "SUBMITTED" });
    m.txInspectionFindUnique.mockResolvedValue({ status: "CLOSED" });
  });

  it("POST /visits answers 409 and creates no visit", async () => {
    const res = await POST(req("POST", {}), ctx);
    await expectRefused(res, 409, /This job is closed/);
    expect(m.visitCreate).not.toHaveBeenCalled();
  });

  it("PATCH answers 409 and changes nothing", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    const res = await PATCH(req("PATCH", { metOnSite: "OWNER" }), vctx);
    await expectRefused(res, 409, /This job is closed/);
    expect(m.visitUpdateMany).not.toHaveBeenCalled();
  });

  it("submit answers 409, submits nothing and writes no audit row", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    const res = await SUBMIT(req("POST"), vctx);
    await expectRefused(res, 409, /This job is closed/);
    expect(m.visitUpdateMany).not.toHaveBeenCalled();
    expect(m.txAuditCreate).not.toHaveBeenCalled();
  });
});

// RA-8498 review round 1, P1: the submit and its audit row commit together.
describe("POST /visits/[visitId]/submit audit failure", () => {
  it("a failed audit insert fails the request inside the transaction", async () => {
    m.visitFindFirst.mockResolvedValue(openVisit());
    m.txAuditCreate.mockRejectedValue(new Error("audit insert failed"));
    const res = await SUBMIT(req("POST"), vctx);
    expect(res.status).toBe(500);
    // The submit update and the audit insert ran on the same transaction
    // client; the real transaction rolls both back on this throw.
    expect(m.visitUpdateMany).toHaveBeenCalledTimes(1);
    expect(m.txAuditCreate).toHaveBeenCalledTimes(1);
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
});
