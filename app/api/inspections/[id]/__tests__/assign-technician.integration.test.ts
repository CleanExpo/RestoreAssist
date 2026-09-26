/**
 * J-07 (prelaunch audit) — assign a job to a field technician.
 *
 * Nothing wrote Inspection.technicianId, so every job stayed unassigned and
 * Field Mode's "my jobs + unassigned" filter showed every job in the business
 * to every technician. PATCH /api/inspections/[id] now takes technicianId from
 * an owner or manager, for a technician of their own organisation only.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session is mocked;
 * Prisma is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { PATCH } from "../route";
import { GET as listInspections } from "../../route";

const S = `j07-${Date.now().toString(36)}`;
const ids = {
  owner: "",
  manager: "",
  techA: "",
  techB: "",
  outsiderTech: "",
  outsiderOwner: "",
  inspectionId: "",
  orgs: [] as string[],
};

function as(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

function assign(technicianId: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/inspections/${ids.inspectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ technicianId }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: ids.inspectionId }) },
  );
}

async function assignedTo() {
  const row = await prisma.inspection.findUnique({
    where: { id: ids.inspectionId },
    select: { technicianId: true },
  });
  return row?.technicianId ?? null;
}

async function fieldModeIds(userId: string) {
  as(userId);
  const res = await listInspections(
    new NextRequest("http://localhost/api/inspections?assignee=me&limit=100"),
  );
  const body = await res.json();
  const list: Array<{ id: string }> = body.inspections ?? body.data?.inspections ?? [];
  return list.map((i) => i.id);
}

describe.skipIf(!process.env.DATABASE_URL)("J-07: assign a job to a technician", () => {
  beforeAll(async () => {
    const mk = async (suffix: string, role: "ADMIN" | "MANAGER" | "USER") =>
      prisma.user.create({
        data: { email: `${S}-${suffix}@test.local`, role, subscriptionStatus: "TRIAL" },
      });
    const owner = await mk("owner", "ADMIN");
    const manager = await mk("manager", "MANAGER");
    const techA = await mk("tech-a", "USER");
    const techB = await mk("tech-b", "USER");
    const outsiderOwner = await mk("outsider-owner", "ADMIN");
    const outsiderTech = await mk("outsider-tech", "USER");
    Object.assign(ids, {
      owner: owner.id,
      manager: manager.id,
      techA: techA.id,
      techB: techB.id,
      outsiderOwner: outsiderOwner.id,
      outsiderTech: outsiderTech.id,
    });

    const orgA = await prisma.organization.create({
      data: { name: `${S} A`, ownerId: owner.id, country: "AU" },
    });
    const orgB = await prisma.organization.create({
      data: { name: `${S} B`, ownerId: outsiderOwner.id, country: "AU" },
    });
    ids.orgs = [orgA.id, orgB.id];
    await prisma.user.updateMany({
      where: { id: { in: [owner.id, manager.id, techA.id, techB.id] } },
      data: { organizationId: orgA.id },
    });
    await prisma.user.updateMany({
      where: { id: { in: [outsiderOwner.id, outsiderTech.id] } },
      data: { organizationId: orgB.id },
    });

    ids.inspectionId = (
      await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-insp`,
          propertyAddress: "7 Assign St",
          propertyPostcode: "4000",
          userId: owner.id,
          claimType: "WATER",
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (ids.inspectionId) {
      await prisma.inspection.delete({ where: { id: ids.inspectionId } }).catch(() => {});
    }
    const users = [ids.owner, ids.manager, ids.techA, ids.techB, ids.outsiderOwner, ids.outsiderTech].filter(Boolean);
    await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: ids.orgs } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => {});
  });

  it("an unassigned job shows in every technician's Field Mode", async () => {
    expect(await fieldModeIds(ids.techA)).toContain(ids.inspectionId);
    expect(await fieldModeIds(ids.techB)).toContain(ids.inspectionId);
  });

  it("the owner assigns a technician, and only that technician still sees the job in Field Mode", async () => {
    as(ids.owner);
    expect((await assign(ids.techA)).status).toBe(200);
    expect(await assignedTo()).toBe(ids.techA);

    expect(await fieldModeIds(ids.techA)).toContain(ids.inspectionId);
    expect(await fieldModeIds(ids.techB)).not.toContain(ids.inspectionId);
  });

  it("a manager can reassign it", async () => {
    as(ids.manager);
    expect((await assign(ids.techB)).status).toBe(200);
    expect(await assignedTo()).toBe(ids.techB);
  });

  it("refuses a technician from another business, a manager as assignee, and a non-string id", async () => {
    as(ids.owner);
    expect((await assign(ids.outsiderTech)).status).toBe(400);
    expect((await assign(ids.manager)).status).toBe(400);
    expect((await assign(42)).status).toBe(400);
    expect(await assignedTo()).toBe(ids.techB);
  });

  it("a technician cannot assign jobs", async () => {
    as(ids.techB);
    expect((await assign(ids.techA)).status).toBe(403);
    expect(await assignedTo()).toBe(ids.techB);
  });

  it("an owner of another business cannot touch the job", async () => {
    as(ids.outsiderOwner);
    const res = await assign(ids.outsiderTech);
    expect(res.status).toBeGreaterThanOrEqual(403);
    expect(await assignedTo()).toBe(ids.techB);
  });

  it("the owner can unassign it", async () => {
    as(ids.owner);
    expect((await assign(null)).status).toBe(200);
    expect(await assignedTo()).toBeNull();
  });
});
