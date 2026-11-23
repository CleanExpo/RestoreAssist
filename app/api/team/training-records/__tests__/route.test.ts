/**
 * Mining pilot slice 6: /api/team/training-records and /[id].
 *
 * Guard tests use the real access helper (lib/training/register-access.ts)
 * over a mocked Prisma, and assert the exact `where` each query receives: a
 * dropped organisation filter, a dropped technician self filter, or a
 * technician allowed to write each turns a test red.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    staffTrainingRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

type Mock = ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  user: { findUnique: Mock; findFirst: Mock; findMany: Mock };
  staffTrainingRecord: {
    findMany: Mock;
    findFirst: Mock;
    create: Mock;
    updateMany: Mock;
    deleteMany: Mock;
  };
};
const session = getServerSession as unknown as Mock;

const ROW = {
  id: "rec_1",
  staffUserId: "tech1",
  course: "Level 3 Mould Remediation",
  provider: "CARSI",
  completedOn: new Date("2026-10-01T00:00:00.000Z"),
  expiresOn: null,
  evidenceUrl: null,
  carsiCompletionRef: null,
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
  staffUser: { name: "Tech One", email: "tech1@example.test" },
};

function signIn(userId: string, role: string | null, organizationId: string | null) {
  session.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
  p.user.findUnique.mockResolvedValue(role === null ? null : { role, organizationId });
}

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const goodBody = {
  staffUserId: "tech1",
  course: "Level 3 Mould Remediation",
  provider: "CARSI",
  completedOn: "2026-10-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  p.staffTrainingRecord.findMany.mockResolvedValue([]);
  p.user.findMany.mockResolvedValue([]);
  p.staffTrainingRecord.create.mockResolvedValue(ROW);
  p.staffTrainingRecord.findFirst.mockResolvedValue(ROW);
  p.staffTrainingRecord.updateMany.mockResolvedValue({ count: 1 });
  p.staffTrainingRecord.deleteMany.mockResolvedValue({ count: 1 });
  p.user.findFirst.mockResolvedValue({ id: "tech1" });
});

describe("sign-in", () => {
  it("every method is 401 without a session, and nothing is read or written", async () => {
    session.mockResolvedValue(null);
    expect((await GET(req("/api/team/training-records", "GET"))).status).toBe(401);
    expect((await POST(req("/api/team/training-records", "POST", goodBody))).status).toBe(401);
    expect((await PATCH(req("/x", "PATCH", { course: "a" }), params("rec_1"))).status).toBe(401);
    expect((await DELETE(req("/x", "DELETE"), params("rec_1"))).status).toBe(401);
    expect(p.staffTrainingRecord.findMany).not.toHaveBeenCalled();
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
    expect(p.staffTrainingRecord.updateMany).not.toHaveBeenCalled();
    expect(p.staffTrainingRecord.deleteMany).not.toHaveBeenCalled();
  });
});

describe("GET (reading)", () => {
  it("an owner reads every record in their organisation, and only theirs", async () => {
    signIn("owner1", "ADMIN", "org_a");
    p.staffTrainingRecord.findMany.mockResolvedValue([ROW]);
    p.user.findMany.mockResolvedValue([{ id: "tech1", name: "Tech One", email: "t@x" }]);
    const res = await GET(req("/api/team/training-records", "GET"));
    expect(res.status).toBe(200);
    expect(p.staffTrainingRecord.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org_a",
    });
    expect(p.user.findMany.mock.calls[0][0].where).toEqual({ organizationId: "org_a" });
    const json = await res.json();
    expect(json.data.canEdit).toBe(true);
    expect(json.data.records[0]).toMatchObject({ id: "rec_1", completedOn: "2026-10-01", staffName: "Tech One" });
  });

  it("a manager reads the whole organisation too", async () => {
    signIn("mgr1", "MANAGER", "org_a");
    await GET(req("/api/team/training-records", "GET"));
    expect(p.staffTrainingRecord.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org_a",
    });
  });

  it("a technician reads only their own records, in their own organisation, and gets no staff list", async () => {
    signIn("tech1", "USER", "org_a");
    const res = await GET(req("/api/team/training-records", "GET"));
    expect(res.status).toBe(200);
    expect(p.staffTrainingRecord.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org_a",
      staffUserId: "tech1",
    });
    expect(p.user.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.data.canEdit).toBe(false);
    expect(json.data.staff).toEqual([]);
  });

  it("the role comes from the database, not the session (session says ADMIN, database says USER)", async () => {
    signIn("tech1", "USER", "org_a");
    const json = await (await GET(req("/api/team/training-records", "GET"))).json();
    expect(json.data.canEdit).toBe(false);
  });

  it("a user with no organisation reads nothing and the query never runs", async () => {
    signIn("loner", "ADMIN", null);
    const res = await GET(req("/api/team/training-records", "GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ records: [], noOrganisation: true, canEdit: false });
    expect(p.staffTrainingRecord.findMany).not.toHaveBeenCalled();
  });

  it("an empty register (zero records, zero CARSI references) is a normal 200", async () => {
    signIn("owner1", "ADMIN", "org_a");
    const res = await GET(req("/api/team/training-records", "GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.records).toEqual([]);
    expect(json.data.noOrganisation).toBe(false);
  });

  it("the read is bounded", async () => {
    signIn("owner1", "ADMIN", "org_a");
    await GET(req("/api/team/training-records", "GET"));
    expect(p.staffTrainingRecord.findMany.mock.calls[0][0].take).toBe(501);
    expect(p.user.findMany.mock.calls[0][0].take).toBe(500);
  });
});

describe("POST (adding)", () => {
  it("a manager adds a record for a member of their organisation; organisation and recorder come from the server", async () => {
    signIn("mgr1", "MANAGER", "org_a");
    const res = await POST(
      req("/api/team/training-records", "POST", {
        ...goodBody,
        expiresOn: "2028-10-01",
        carsiCompletionRef: "CARSI-2026-00042",
      }),
    );
    expect(res.status).toBe(201);
    expect(p.user.findFirst.mock.calls[0][0].where).toEqual({
      id: "tech1",
      organizationId: "org_a",
    });
    const data = p.staffTrainingRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      organizationId: "org_a",
      staffUserId: "tech1",
      recordedByUserId: "mgr1",
      carsiCompletionRef: "CARSI-2026-00042",
    });
    expect(data.completedOn.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("a technician cannot add a record, not even their own: 403 and no write", async () => {
    signIn("tech1", "USER", "org_a");
    const res = await POST(req("/api/team/training-records", "POST", goodBody));
    expect(res.status).toBe(403);
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
  });

  it("a user with no organisation cannot add: 403 and no write", async () => {
    signIn("loner", "ADMIN", null);
    expect((await POST(req("/api/team/training-records", "POST", goodBody))).status).toBe(403);
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
  });

  it("a staff member outside the caller's organisation is 404 and nothing is written", async () => {
    signIn("owner1", "ADMIN", "org_a");
    p.user.findFirst.mockResolvedValue(null);
    const res = await POST(
      req("/api/team/training-records", "POST", { ...goodBody, staffUserId: "other_org_tech" }),
    );
    expect(res.status).toBe(404);
    expect(p.user.findFirst.mock.calls[0][0].where).toEqual({
      id: "other_org_tech",
      organizationId: "org_a",
    });
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
  });

  it("a body naming another organisation is refused (400) before anything is written", async () => {
    signIn("owner1", "ADMIN", "org_a");
    const res = await POST(
      req("/api/team/training-records", "POST", { ...goodBody, organizationId: "org_b" }),
    );
    expect(res.status).toBe(400);
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
  });

  it("bad links are 400: a script evidence link and a CARSI reference to another site", async () => {
    signIn("owner1", "ADMIN", "org_a");
    for (const extra of [
      { evidenceUrl: "javascript:alert(1)" },
      { carsiCompletionRef: "https://example.com/fake-carsi" },
    ]) {
      const res = await POST(req("/api/team/training-records", "POST", { ...goodBody, ...extra }));
      expect(res.status).toBe(400);
    }
    expect(p.staffTrainingRecord.create).not.toHaveBeenCalled();
  });

  it("broken JSON is 400", async () => {
    signIn("owner1", "ADMIN", "org_a");
    expect((await POST(req("/api/team/training-records", "POST", "{nope"))).status).toBe(400);
  });
});

describe("PATCH (changing)", () => {
  it("an owner changes a record; every read and the write carry the organisation", async () => {
    signIn("owner1", "ADMIN", "org_a");
    const res = await PATCH(req("/x", "PATCH", { course: "Renamed" }), params("rec_1"));
    expect(res.status).toBe(200);
    const scope = { id: "rec_1", organizationId: "org_a" };
    expect(p.staffTrainingRecord.findFirst.mock.calls[0][0].where).toEqual(scope);
    expect(p.staffTrainingRecord.updateMany.mock.calls[0][0].where).toEqual(scope);
    expect(p.staffTrainingRecord.updateMany.mock.calls[0][0].data).toMatchObject({
      course: "Renamed",
      updatedByUserId: "owner1",
    });
  });

  it("another organisation's record is 404 and nothing is written", async () => {
    signIn("owner1", "ADMIN", "org_a");
    p.staffTrainingRecord.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("/x", "PATCH", { course: "x" }), params("rec_org_b"));
    expect(res.status).toBe(404);
    expect(p.staffTrainingRecord.updateMany).not.toHaveBeenCalled();
  });

  it("a technician cannot change a record, even their own: 403 and no read or write", async () => {
    signIn("tech1", "USER", "org_a");
    const res = await PATCH(req("/x", "PATCH", { course: "x" }), params("rec_1"));
    expect(res.status).toBe(403);
    expect(p.staffTrainingRecord.findFirst).not.toHaveBeenCalled();
    expect(p.staffTrainingRecord.updateMany).not.toHaveBeenCalled();
  });

  it("moving a record to another person or organisation is refused (400)", async () => {
    signIn("owner1", "ADMIN", "org_a");
    for (const body of [{ staffUserId: "other" }, { organizationId: "org_b" }]) {
      expect((await PATCH(req("/x", "PATCH", body), params("rec_1"))).status).toBe(400);
    }
    expect(p.staffTrainingRecord.updateMany).not.toHaveBeenCalled();
  });

  it("an expiry before the stored completion date is 400", async () => {
    signIn("owner1", "ADMIN", "org_a");
    const res = await PATCH(req("/x", "PATCH", { expiresOn: "2026-09-01" }), params("rec_1"));
    expect(res.status).toBe(400);
    expect(p.staffTrainingRecord.updateMany).not.toHaveBeenCalled();
  });

  it("an empty change is 400", async () => {
    signIn("owner1", "ADMIN", "org_a");
    expect((await PATCH(req("/x", "PATCH", {}), params("rec_1"))).status).toBe(400);
  });

  it("clearing the CARSI reference stores null", async () => {
    signIn("owner1", "ADMIN", "org_a");
    await PATCH(req("/x", "PATCH", { carsiCompletionRef: "" }), params("rec_1"));
    expect(p.staffTrainingRecord.updateMany.mock.calls[0][0].data.carsiCompletionRef).toBeNull();
  });
});

describe("DELETE (removing)", () => {
  it("a manager removes a record in their organisation; the delete carries the organisation", async () => {
    signIn("mgr1", "MANAGER", "org_a");
    const res = await DELETE(req("/x", "DELETE"), params("rec_1"));
    expect(res.status).toBe(200);
    expect(p.staffTrainingRecord.deleteMany.mock.calls[0][0].where).toEqual({
      id: "rec_1",
      organizationId: "org_a",
    });
  });

  it("another organisation's record is 404", async () => {
    signIn("mgr1", "MANAGER", "org_a");
    p.staffTrainingRecord.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("/x", "DELETE"), params("rec_org_b"))).status).toBe(404);
  });

  it("a technician cannot remove a record: 403 and no delete", async () => {
    signIn("tech1", "USER", "org_a");
    expect((await DELETE(req("/x", "DELETE"), params("rec_1"))).status).toBe(403);
    expect(p.staffTrainingRecord.deleteMany).not.toHaveBeenCalled();
  });
});
