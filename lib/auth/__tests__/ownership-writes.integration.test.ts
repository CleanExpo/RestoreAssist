/**
 * RA-6800 — Real-database integration tests proving that ownership-scoped Prisma
 * `where` clauses ACTUALLY enforce tenant isolation at runtime (not just the
 * mocked query shape the unit tests assert).
 *
 * These run ONLY when DATABASE_URL is set (CI Quality Checks: migrated DB +
 * `vitest run`, serialized via maxWorkers:1). They are skipped locally.
 *
 * Each block runs the SAME `where` shape used by the production handler (cited
 * inline) against seeded two-tenant data and asserts:
 *   - cross-tenant singular update/delete -> Prisma P2025 (row untouched)
 *   - cross-tenant updateMany/deleteMany  -> { count: 0 }
 *   - same-tenant (or shared/owner)       -> succeeds
 *
 * This is the definitive runtime proof of the extendedWhereUnique scalar +
 * relation + OR + nested-relation filters and the resolveInspectionWrite helper.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  resolveInspectionWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra6800-${Date.now().toString(36)}`; // unique suffix per run

// Identifiers seeded in beforeAll.
const ids = {
  adminA: "",
  adminB: "",
  userA: "",
  userB: "",
  userC: "",
  orgA: "",
  orgB: "",
  reportA: "",
  reportM: "", // owned by A, manager = B
  costLibA: "",
  costItemA: "",
  inspA: "", // owned by A, no workspace
  inspW: "", // owned by A, in workspace with member C
  wsA: "",
  scopeA: "",
  impA: "", // impersonation started by adminA
  templateT: "",
  formA: "", // on reportM
};

async function expectP2025(p: Promise<unknown>) {
  // Prisma throws PrismaClientKnownRequestError { code: "P2025" } when a scoped
  // update/delete matches no row.
  await expect(p).rejects.toMatchObject({ code: "P2025" });
}

describe.skipIf(!HAS_DB)("ownership-scoped writes enforce at the DB (RA-6800)", () => {
  beforeAll(async () => {
    // --- users + orgs (org FK requires the org row to exist) ---
    const adminA = await prisma.user.create({
      data: { email: `${S}-adminA@test.local`, role: "ADMIN" },
    });
    const adminB = await prisma.user.create({
      data: { email: `${S}-adminB@test.local`, role: "ADMIN" },
    });
    ids.adminA = adminA.id;
    ids.adminB = adminB.id;

    const orgA = await prisma.organization.create({
      data: { name: `${S}-orgA`, ownerId: adminA.id },
    });
    const orgB = await prisma.organization.create({
      data: { name: `${S}-orgB`, ownerId: adminB.id },
    });
    ids.orgA = orgA.id;
    ids.orgB = orgB.id;
    await prisma.user.update({
      where: { id: adminA.id },
      data: { organizationId: orgA.id },
    });
    // adminB is a REAL second tenant, not an org-less admin. Without this the
    // cross-tenant denial below would only prove that a null organisationId
    // falls back to `self` -- a much weaker claim than "org B's admin cannot
    // reach org A's inspection".
    await prisma.user.update({
      where: { id: adminB.id },
      data: { organizationId: orgB.id },
    });

    const userA = await prisma.user.create({
      data: { email: `${S}-userA@test.local`, organizationId: orgA.id },
    });
    const userB = await prisma.user.create({
      data: { email: `${S}-userB@test.local`, organizationId: orgB.id },
    });
    const userC = await prisma.user.create({
      data: { email: `${S}-userC@test.local` },
    });
    ids.userA = userA.id;
    ids.userB = userB.id;
    ids.userC = userC.id;

    const reportData = (userId: string, extra: Record<string, unknown> = {}) => ({
      userId,
      title: "T",
      clientName: "C",
      propertyAddress: "1 St",
      hazardType: "water",
      insuranceType: "home",
      ...extra,
    });

    const reportA = await prisma.report.create({ data: reportData(userA.id) });
    const reportM = await prisma.report.create({
      data: reportData(userA.id, { assignedManagerId: userB.id }),
    });
    ids.reportA = reportA.id;
    ids.reportM = reportM.id;

    // --- one-level relation: CostLibrary -> CostItem ---
    const costLibA = await prisma.costLibrary.create({
      data: { name: "Lib", region: "AU", userId: userA.id },
    });
    const costItemA = await prisma.costItem.create({
      data: {
        category: "Labour",
        description: "d",
        rate: 50,
        unit: "hr",
        libraryId: costLibA.id,
      },
    });
    ids.costLibA = costLibA.id;
    ids.costItemA = costItemA.id;

    // --- inspections (+ workspace for the multi-path helper) ---
    const inspA = await prisma.inspection.create({
      data: {
        inspectionNumber: `${S}-A`,
        propertyAddress: "1 St",
        propertyPostcode: "4000",
        userId: userA.id,
      },
    });
    const wsA = await prisma.workspace.create({
      data: { name: "WS", slug: `${S}-ws`, ownerId: userA.id },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: wsA.id, userId: userC.id, status: "ACTIVE" },
    });
    const inspW = await prisma.inspection.create({
      data: {
        inspectionNumber: `${S}-W`,
        propertyAddress: "2 St",
        propertyPostcode: "4000",
        userId: userA.id,
        workspaceId: wsA.id,
      },
    });
    ids.inspA = inspA.id;
    ids.inspW = inspW.id;
    ids.wsA = wsA.id;

    // --- scope (one per report; reportId is unique) ---
    const scopeA = await prisma.scope.create({
      data: {
        reportId: reportA.id,
        scopeType: "water",
        createdBy: userA.id,
        updatedBy: userA.id,
        userId: userA.id,
      },
    });
    ids.scopeA = scopeA.id;

    // --- authority form (OR relation via report) ---
    const templateT = await prisma.authorityFormTemplate.create({
      data: { name: "T", code: `${S}-code`, formContent: "{}" },
    });
    const formA = await prisma.authorityFormInstance.create({
      data: {
        templateId: templateT.id,
        reportId: reportM.id,
        companyName: "Co",
        clientName: "Cl",
        clientAddress: "1 St",
        authorityDescription: "d",
      },
    });
    ids.templateT = templateT.id;
    ids.formA = formA.id;

    // --- admin impersonation (owner = adminA) ---
    const impA = await prisma.adminImpersonation.create({
      data: {
        adminUserId: adminA.id,
        targetUserId: userA.id,
        tokenId: `${S}-jti`,
        reason: "test",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    ids.impA = impA.id;
  });

  afterAll(async () => {
    // Workspace.ownerId is onDelete: Restrict — delete workspaces before users.
    // Everything else cascades from User / Report.
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.workspace.deleteMany({ where: { slug: `${S}-ws` } }));
    await swallow(
      prisma.authorityFormInstance.deleteMany({ where: { id: ids.formA } }),
    );
    await swallow(
      prisma.authorityFormTemplate.deleteMany({ where: { code: `${S}-code` } }),
    );
    await swallow(
      prisma.user.deleteMany({
        where: {
          id: {
            in: [ids.adminA, ids.adminB, ids.userA, ids.userB, ids.userC],
          },
        },
      }),
    );
    await prisma.$disconnect();
  });

  // 1. Scalar userId — app/api/reports/[id]/route.ts:277,423
  it("scalar userId: cross-tenant report write is blocked; owner succeeds", async () => {
    await expectP2025(
      prisma.report.update({
        where: { id: ids.reportA, userId: ids.userB },
        data: { title: "hacked" },
      }),
    );
    const after = await prisma.report.findUnique({ where: { id: ids.reportA } });
    expect(after?.title).toBe("T"); // untouched

    const ok = await prisma.report.update({
      where: { id: ids.reportA, userId: ids.userA },
      data: { title: "owner-edit" },
    });
    expect(ok.title).toBe("owner-edit");
  });

  // 2. One-level relation — app/api/cost-items/[id]/route.ts:56,106
  it("relation filter: cross-tenant cost-item write is blocked; owner succeeds", async () => {
    await expectP2025(
      prisma.costItem.update({
        where: { id: ids.costItemA, library: { userId: ids.userB } },
        data: { rate: 999 },
      }),
    );
    const after = await prisma.costItem.findUnique({
      where: { id: ids.costItemA },
    });
    expect(after?.rate).toBe(50);

    const ok = await prisma.costItem.update({
      where: { id: ids.costItemA, library: { userId: ids.userA } },
      data: { rate: 75 },
    });
    expect(ok.rate).toBe(75);
  });

  // 3. OR relation — app/api/authority-forms/[id]/route.ts:116
  it("OR relation: intruder blocked; owner and assigned manager allowed", async () => {
    const orFor = (uid: string) => ({
      OR: [
        { userId: uid },
        { assignedManagerId: uid },
        { assignedAdminId: uid },
      ],
    });

    // userC has none of the three relations to reportM -> blocked.
    await expectP2025(
      prisma.authorityFormInstance.update({
        where: { id: ids.formA, report: orFor(ids.userC) },
        data: { companyName: "hacked" },
      }),
    );
    const after = await prisma.authorityFormInstance.findUnique({
      where: { id: ids.formA },
    });
    expect(after?.companyName).toBe("Co");

    // owner (userA)
    const asOwner = await prisma.authorityFormInstance.update({
      where: { id: ids.formA, report: orFor(ids.userA) },
      data: { companyName: "owner-edit" },
    });
    expect(asOwner.companyName).toBe("owner-edit");

    // assigned manager (userB)
    const asManager = await prisma.authorityFormInstance.update({
      where: { id: ids.formA, report: orFor(ids.userB) },
      data: { companyName: "manager-edit" },
    });
    expect(asManager.companyName).toBe("manager-edit");
  });

  // 4. Multi-path helper — lib/auth/assert-tenancy.ts resolveInspectionWrite
  it("resolveInspectionWrite: owner/member/admin allowed, non-member denied", async () => {
    // owner
    const rOwner = await resolveInspectionWrite({ user: { id: ids.userA } }, ids.inspA);
    expect(rOwner.ok).toBe(true);

    // active workspace member (userC) on the workspace-scoped inspection
    const rMember = await resolveInspectionWrite({ user: { id: ids.userC } }, ids.inspW);
    expect(rMember.ok).toBe(true);

    // non-member / non-owner (userB) -> denied 404
    const rDenied = await resolveInspectionWrite({ user: { id: ids.userB } }, ids.inspA);
    expect(rDenied.ok).toBe(false);
    if (!rDenied.ok) expect(rDenied.status).toBe(404);

    // A tenant ADMIN reaches its OWN organisation's records -- and carries the
    // ownership clauses into every write, child writes included. `role: "ADMIN"`
    // is granted to every firm that self-registers, so it is never a global
    // bypass; until commit 5b7a39398 this block asserted the bypass as intended.
    const rAdmin = await resolveInspectionWrite(
      { user: { id: ids.adminA, role: "ADMIN" } },
      ids.inspA,
    );
    expect(rAdmin.ok).toBe(true);
    if (rAdmin.ok) {
      expect(rAdmin.data.childInspectionFilter).toBeDefined();
      expect("OR" in rAdmin.data.inspectionWhere).toBe(true);

      // The scope it hands back must actually claim the row at the DB.
      const claimed = await prisma.inspection.updateMany({
        where: rAdmin.data.inspectionManyWhere,
        data: { propertyAddress: "org-admin-edit" },
      });
      expect(claimed.count).toBe(1);
    }

    // Cross-tenant: org B's ADMIN is denied org A's inspection, 404 not 403 so
    // it cannot learn the id exists.
    const rAdminB = await resolveInspectionWrite(
      { user: { id: ids.adminB, role: "ADMIN" } },
      ids.inspA,
    );
    expect(rAdminB.ok).toBe(false);
    if (!rAdminB.ok) expect(rAdminB.status).toBe(404);

    // The nested workspace relation filter enforces at the DB:
    const blocked = await prisma.inspection.updateMany({
      where: {
        id: ids.inspA,
        OR: [
          { userId: ids.userB },
          {
            workspace: {
              members: { some: { userId: ids.userB, status: "ACTIVE" } },
            },
          },
        ],
      },
      data: { propertyAddress: "hacked" },
    });
    expect(blocked.count).toBe(0);

    if (rMember.ok) {
      const allowed = await prisma.inspection.updateMany({
        where: rMember.data.inspectionManyWhere,
        data: { propertyAddress: "member-edit" },
      });
      expect(allowed.count).toBe(1);
    }
  });

  // 4b. writeWithinInspectionScope at the DB — lib/auth/assert-tenancy.ts
  //
  // The six assessment routes all take the same shape: the scoped parent
  // updateMany IS the gate, and the child upsert runs inside the same
  // transaction. An independent review found the mocked helper tests kill a
  // work-before-gate mutant but cannot prove REAL rollback, because they mock
  // Prisma. This exercises the production shape against Postgres.
  it("writeWithinInspectionScope: denied scope writes no child; a throw rolls the parent back", async () => {
    const hvacUpsert = (tx: Prisma.TransactionClient) =>
      tx.hVACAssessment.upsert({
        where: { inspectionId: ids.inspA },
        create: { inspectionId: ids.inspA, hvacSystemInspected: true },
        update: { hvacSystemInspected: true },
      });

    // A scope that claims nothing: userB has no relation to inspA.
    const denied = await writeWithinInspectionScope(
      { id: ids.inspA, OR: [{ userId: ids.userB }] },
      { claimType: "HVAC" },
      hvacUpsert,
    );
    expect(denied).toBeNull();

    // The child row must not exist. This is the assertion the mocked tests
    // cannot make: a work-before-gate ordering bug creates it anyway.
    const noChild = await prisma.hVACAssessment.findUnique({
      where: { inspectionId: ids.inspA },
    });
    expect(noChild).toBeNull();

    // ...and the parent was not touched either.
    const untouched = await prisma.inspection.findUnique({
      where: { id: ids.inspA },
      select: { claimType: true },
    });
    expect(untouched?.claimType).toBeNull();

    // The owner's scope claims the row, so both writes land.
    const rOwner = await resolveInspectionWrite({ user: { id: ids.userA } }, ids.inspA);
    expect(rOwner.ok).toBe(true);
    if (!rOwner.ok) return;

    const allowed = await writeWithinInspectionScope(
      rOwner.data.inspectionManyWhere,
      { claimType: "HVAC" },
      hvacUpsert,
    );
    expect(allowed).not.toBeNull();
    const child = await prisma.hVACAssessment.findUnique({
      where: { inspectionId: ids.inspA },
    });
    expect(child?.hvacSystemInspected).toBe(true);
    const parent = await prisma.inspection.findUnique({
      where: { id: ids.inspA },
      select: { claimType: true },
    });
    expect(parent?.claimType).toBe("HVAC");

    // A failure inside the child work must undo the parent update too --
    // real rollback, not a mocked one.
    await expect(
      writeWithinInspectionScope(
        rOwner.data.inspectionManyWhere,
        { claimType: "MOULD" },
        async () => {
          throw new Error("child write failed");
        },
      ),
    ).rejects.toThrow("child write failed");

    const afterRollback = await prisma.inspection.findUnique({
      where: { id: ids.inspA },
      select: { claimType: true },
    });
    expect(afterRollback?.claimType).toBe("HVAC");
  });

  // 5. IDOR gate + relation update — app/api/scopes/route.ts:78,120
  it("scopes: ownership gate + relation-scoped update block cross-tenant", async () => {
    // gate: userA does not own report/none -> a foreign reportId yields null
    const gate = await prisma.report.findFirst({
      where: { id: ids.reportA, userId: ids.userB },
      select: { id: true },
    });
    expect(gate).toBeNull();

    await expectP2025(
      prisma.scope.update({
        where: { id: ids.scopeA, report: { userId: ids.userB } },
        data: { scopeType: "hacked" },
      }),
    );
    const ok = await prisma.scope.update({
      where: { id: ids.scopeA, report: { userId: ids.userA } },
      data: { scopeType: "mould" },
    });
    expect(ok.scopeType).toBe("mould");
  });

  // 6. Org boundary + updateMany owner — team/members:109, admin/users:82,
  //    admin/impersonate/stop:90
  it("org boundary: cross-org user write blocked; updateMany owner-scoped", async () => {
    // userA is in orgA; an admin of orgB cannot update them.
    await expectP2025(
      prisma.user.update({
        where: { id: ids.userA, organizationId: ids.orgB },
        data: { role: "MANAGER" },
      }),
    );
    const okUser = await prisma.user.update({
      where: { id: ids.userA, organizationId: ids.orgA },
      data: { role: "MANAGER" },
    });
    expect(okUser.role).toBe("MANAGER");

    // impersonation can only be ended by the originating admin.
    const foreign = await prisma.adminImpersonation.updateMany({
      where: { id: ids.impA, adminUserId: ids.userB },
      data: { endedAt: new Date() },
    });
    expect(foreign.count).toBe(0);

    const owned = await prisma.adminImpersonation.updateMany({
      where: { id: ids.impA, adminUserId: ids.adminA },
      data: { endedAt: new Date() },
    });
    expect(owned.count).toBe(1);
  });
});
