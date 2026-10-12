/**
 * Report-linked inspection scenarios (RestoreAssist recovery, Indooroopilly case).
 *
 * The live Indooroopilly report has no linked inspection, so evidence cannot
 * be entered against it. Creating that link must:
 *   1. work for an organisation ADMIN or MANAGER on a colleague's report
 *      (founder decision 02/10/2026, RA-7869), and refuse a USER colleague;
 *   2. still refuse anyone outside that organisation;
 *   3. leave exactly one inspection per report when creates race, and answer
 *      the losing request with the existing inspection or a clear 409 -- not a
 *      500 that tells a technician on a bad connection the save failed;
 *   4. never invent an attendance date. An inspection created without one
 *      must store none, rather than the moment the row was written.
 *
 * Requests use the report's own address: a candidate branch refuses an
 * inspection whose property does not match its report (409), which is right.
 *
 * Written to FAIL on main 831eb268f for the ADMIN arm of 1 and for 4. On main, 3 already holds:
 * Inspection.reportId is unique and the losing create is answered with 409. Prisma is not mocked:
 * rows are seeded and the handler's real responses and rows are asserted.
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Lets a test change the database in the window between the route's report
// reach pre-check and its write transaction (review 62c97497 P1).
let afterReachCheck: (() => Promise<void>) | null = null;
vi.mock("@/lib/auth/assert-tenancy", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/assert-tenancy")>();
  return {
    ...real,
    assertReportLinkable: async (
      ...a: Parameters<typeof real.assertReportLinkable>
    ) => {
      const result = await real.assertReportLinkable(...a);
      if (afterReachCheck) await afterReachCheck();
      return result;
    },
  };
});

import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `rlink-${Date.now().toString(36)}`;

const ids = { ownerA: "", managerA: "", techA: "", ownerB: "", orgA: "", orgB: "" };

function makeReport(userId: string, tag: string) {
  return prisma.report.create({
    data: {
      title: `${S}-${tag}`,
      clientName: `${S} client`,
      propertyAddress: "1 Scenario St",
      propertyPostcode: "4068",
      hazardType: "WATER",
      insuranceType: "UNKNOWN",
      userId,
      status: "DRAFT",
    },
    select: { id: true },
  });
}

async function createAs(
  userId: string,
  body: Record<string, unknown>,
  key?: string,
) {
  getServerSession.mockResolvedValueOnce({ user: { id: userId } });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  const res = await POST(
    new NextRequest("http://localhost/api/inspections", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const address = { propertyAddress: "1 Scenario St", propertyPostcode: "4068" };

describe.skipIf(!HAS_DB)("report-linked inspection create (recovery scenarios)", () => {
  beforeAll(async () => {
    const ownerA = await prisma.user.create({
      data: { email: `${S}-ownerA@test.local`, role: "ADMIN" },
    });
    const ownerB = await prisma.user.create({
      data: { email: `${S}-ownerB@test.local`, role: "ADMIN" },
    });
    const orgA = await prisma.organization.create({
      data: { name: `${S}-orgA`, ownerId: ownerA.id },
    });
    const orgB = await prisma.organization.create({
      data: { name: `${S}-orgB`, ownerId: ownerB.id },
    });
    await prisma.user.update({ where: { id: ownerA.id }, data: { organizationId: orgA.id } });
    await prisma.user.update({ where: { id: ownerB.id }, data: { organizationId: orgB.id } });
    const managerA = await prisma.user.create({
      data: { email: `${S}-managerA@test.local`, role: "MANAGER", organizationId: orgA.id },
    });
    const techA = await prisma.user.create({
      data: { email: `${S}-techA@test.local`, role: "USER", organizationId: orgA.id },
    });
    Object.assign(ids, {
      ownerA: ownerA.id,
      ownerB: ownerB.id,
      orgA: orgA.id,
      orgB: orgB.id,
      managerA: managerA.id,
      techA: techA.id,
    });
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({
      where: { report: { title: { startsWith: S } } },
    });
    await prisma.report.deleteMany({ where: { title: { startsWith: S } } });
    await prisma.user.updateMany({
      where: { email: { startsWith: S } },
      data: { organizationId: null },
    });
    await prisma.organization.deleteMany({ where: { name: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  it("lets an organisation ADMIN link an inspection to a colleague's report", async () => {
    // lib/auth/assert-tenancy.ts resolveTenantScope: "Writing beyond your own
    // records remains an ADMIN privilege." An ADMIN who is not the report's
    // creator is still inside that privilege.
    const report = await makeReport(ids.managerA, "admin");
    const res = await createAs(ids.ownerA, { ...address, reportId: report.id });
    expect(res.status).toBe(201);
    const rows = await prisma.inspection.findMany({ where: { reportId: report.id } });
    expect(rows).toHaveLength(1);
    // The job belongs to the report's owner, so they can still save it; the
    // ADMIN who created it is recorded in the audit row.
    expect(rows[0].userId).toBe(ids.managerA);
    const audit = await prisma.auditLog.findFirst({
      where: { inspectionId: rows[0].id, action: "Inspection created" },
    });
    expect(audit?.userId).toBe(ids.ownerA);
  });

  it("lets the ADMIN who linked a colleague's job load it again by report, and nobody outside", async () => {
    // Review of 3a0ba95d (P1): the job is owned by the report owner, so a
    // resume lookup scoped to the caller's own jobs answered 404 and the form
    // started an empty draft whose autosave could replace the owner's work.
    const report = await makeReport(ids.managerA, "resume");
    const created = await createAs(ids.ownerA, { ...address, reportId: report.id });
    expect(created.status).toBe(201);
    const getAs = async (userId: string) => {
      getServerSession.mockResolvedValueOnce({ user: { id: userId } });
      return GET(new NextRequest(`http://localhost/api/inspections?reportId=${report.id}`));
    };
    const asAdmin = await getAs(ids.ownerA);
    expect(asAdmin.status).toBe(200);
    expect((await asAdmin.json()).inspection.id).toBe(created.json.inspection.id);
    expect((await getAs(ids.managerA)).status).toBe(200);
    expect((await getAs(ids.ownerB)).status).toBe(404);
  });

  it("confirms an ADMIN's interrupted create of a colleague's job as complete", async () => {
    // The creation-status check recovers a create whose answer was lost. The
    // job belongs to the report owner, so a lookup on the caller's own jobs
    // reports a saved job as unconfirmed.
    const report = await makeReport(ids.managerA, "status");
    const key = `${S}-status`;
    const created = await createAs(ids.ownerA, { ...address, reportId: report.id }, key);
    expect(created.status).toBe(201);
    const statusAs = async (userId: string) => {
      getServerSession.mockResolvedValueOnce({ user: { id: userId } });
      const res = await GET(
        new NextRequest(
          `http://localhost/api/inspections?creationStatus=1&reportId=${report.id}`,
          { headers: { "Idempotency-Key": key } },
        ),
      );
      return res.json();
    };
    const asAdmin = await statusAs(ids.ownerA);
    expect(asAdmin.state).toBe("complete");
    expect(asAdmin.inspection.id).toBe(created.json.inspection.id);
    // The record is keyed to its caller: nobody else can read it.
    expect((await statusAs(ids.ownerB)).state).toBe("missing");
  });

  it("lets a MANAGER link an inspection to a colleague's report (founder decision 02/10/2026)", async () => {
    // Phill, RA-7869 question 3: "Yes, Manager has that authority".
    const report = await makeReport(ids.ownerA, "mgr");
    const res = await createAs(ids.managerA, { ...address, reportId: report.id });
    expect(res.status).toBe(201);
    const rows = await prisma.inspection.findMany({ where: { reportId: report.id } });
    expect(rows).toHaveLength(1);
    // The job belongs to the report's owner; the MANAGER is the audit actor.
    expect(rows[0].userId).toBe(ids.ownerA);
    const audit = await prisma.auditLog.findFirst({
      where: { inspectionId: rows[0].id, action: "Inspection created" },
    });
    expect(audit?.userId).toBe(ids.managerA);
  });

  it("tells an ADMIN plainly that only the creator can set a colleague's report client, with no write", async () => {
    // The client picker only offers the caller's own clients, so linking one
    // would attach the ADMIN's client to someone else's report. That stays
    // refused, but up front with the reason, not as "client changed; reload".
    const client = await prisma.client.create({
      data: { name: `${S} admin client`, email: `${S}-client@test.local`, userId: ids.ownerA },
    });
    const report = await makeReport(ids.managerA, "admin-client");
    const res = await createAs(ids.ownerA, {
      ...address,
      reportId: report.id,
      clientId: client.id,
      claimType: "WATER",
    });
    expect(res.status).toBe(409);
    expect(res.json?.error?.message ?? res.json?.message).toMatch(/creator/i);
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(0);
    const after = await prisma.report.findUnique({ where: { id: report.id }, select: { clientId: true } });
    expect(after?.clientId).toBeNull();
    await prisma.client.delete({ where: { id: client.id } });
  });

  it("refuses a USER colleague in the same organisation, with no row", async () => {
    const report = await makeReport(ids.ownerA, "user");
    const res = await createAs(ids.techA, { ...address, reportId: report.id });
    expect(res.status).toBe(404);
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(0);
  });

  it("refuses a user from another organisation", async () => {
    const report = await makeReport(ids.ownerA, "xorg");
    const res = await createAs(ids.ownerB, { ...address, reportId: report.id });
    expect(res.status).toBe(404);
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(0);
  });

  it("refuses an ADMIN demoted between the reach check and the write, with no row", async () => {
    const admin2 = await prisma.user.create({
      data: { email: `${S}-adminA2@test.local`, role: "ADMIN", organizationId: ids.orgA },
    });
    const report = await makeReport(ids.managerA, "demoted");
    afterReachCheck = async () => {
      afterReachCheck = null;
      await prisma.user.update({ where: { id: admin2.id }, data: { role: "USER" } });
    };
    try {
      const res = await createAs(admin2.id, { ...address, reportId: report.id });
      expect(res.status).toBe(404);
    } finally {
      afterReachCheck = null;
    }
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(0);
  });

  it("refuses a MANAGER demoted between the reach check and the write, with no row", async () => {
    const manager2 = await prisma.user.create({
      data: { email: `${S}-managerA2@test.local`, role: "MANAGER", organizationId: ids.orgA },
    });
    const report = await makeReport(ids.ownerA, "mgr-demoted");
    afterReachCheck = async () => {
      afterReachCheck = null;
      await prisma.user.update({ where: { id: manager2.id }, data: { role: "USER" } });
    };
    try {
      const res = await createAs(manager2.id, { ...address, reportId: report.id });
      expect(res.status).toBe(404);
    } finally {
      afterReachCheck = null;
    }
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(0);
  });

  it("keeps one inspection per report when two creates race, and never answers with a 500", async () => {
    const report = await makeReport(ids.ownerA, "race");
    const [a, b] = await Promise.all([
      createAs(ids.ownerA, { ...address, reportId: report.id }, `${S}-race-a`),
      createAs(ids.ownerA, { ...address, reportId: report.id }, `${S}-race-b`),
    ]);
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(1);
    for (const r of [a, b]) {
      expect(r.status).not.toBeGreaterThanOrEqual(500);
      expect([200, 201, 409]).toContain(r.status);
    }
  });

  it("answers a second create for an already-linked report with that inspection or a 409, not a 500", async () => {
    const report = await makeReport(ids.ownerA, "relink");
    const first = await createAs(ids.ownerA, { ...address, reportId: report.id }, `${S}-relink-1`);
    expect(first.status).toBe(201);
    const second = await createAs(ids.ownerA, { ...address, reportId: report.id }, `${S}-relink-2`);
    expect([200, 201, 409]).toContain(second.status);
    expect(await prisma.inspection.count({ where: { reportId: report.id } })).toBe(1);
  });

  it("rejects a corrected body under a reused Idempotency-Key instead of replaying the stale result", async () => {
    const report = await makeReport(ids.ownerA, "idem");
    const key = `${S}-idem`;
    const first = await createAs(ids.ownerA, { ...address, reportId: report.id }, key);
    expect(first.status).toBe(201);
    const corrected = await createAs(
      ids.ownerA,
      { ...address, technicianName: "Corrected Name", reportId: report.id },
      key,
    );
    expect(corrected.status).toBe(409);
    const rows = await prisma.inspection.findMany({ where: { reportId: report.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].technicianName).not.toBe("Corrected Name");
  });

  it("stores no attendance date when none was supplied", async () => {
    const report = await makeReport(ids.ownerA, "date");
    const res = await createAs(ids.ownerA, { ...address, reportId: report.id });
    expect(res.status).toBe(201);
    const row = await prisma.inspection.findFirstOrThrow({ where: { reportId: report.id } });
    expect(row.inspectionDate).toBeNull();
  });
});
