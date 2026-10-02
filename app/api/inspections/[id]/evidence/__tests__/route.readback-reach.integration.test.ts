/**
 * A technician who can SAVE evidence on a colleague's job must be able to READ
 * it back.
 *
 * POST /api/inspections/[id]/evidence uses assertInspectionCapturable (the
 * organisation, RA-7755) so an invited technician can record evidence on a job
 * they did not create. The guided-capture screen then confirms the save with
 * GET on the same route before it says "captured". That GET used
 * assertInspectionTenancy (creator or workspace member only), so the same
 * technician got 404 on the readback: the screen showed "may have saved"
 * indefinitely, and recapturing created duplicate EvidenceItems.
 *
 * Prisma is not mocked. Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `evrb-${Date.now().toString(36)}`;
const ids = { ownerA: "", techA: "", ownerB: "", inspA: "", evidenceA: "" };

async function readAs(userId: string) {
  getServerSession.mockResolvedValueOnce({ user: { id: userId } });
  const res = await GET(
    new NextRequest(`http://localhost/api/inspections/${ids.inspA}/evidence`),
    { params: Promise.resolve({ id: ids.inspA }) },
  );
  const body = res.status === 200 ? await res.json() : null;
  return { status: res.status, body: JSON.stringify(body) };
}

describe.skipIf(!HAS_DB)("evidence readback reach matches capture reach", () => {
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
    // Role USER, no workspace membership: what the invite flow produces.
    const techA = await prisma.user.create({
      data: { email: `${S}-techA@test.local`, role: "USER", organizationId: orgA.id },
    });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `${S}-A`,
        propertyAddress: "1 Evidence St",
        propertyPostcode: "4068",
        userId: ownerA.id,
      },
    });
    // The technician's own capture on the owner's job.
    const ev = await prisma.evidenceItem.create({
      data: {
        inspectionId: insp.id,
        evidenceClass: "PHOTO_DAMAGE",
        title: `${S} western wall streaks`,
        capturedById: techA.id,
        capturedByName: "Tech A",
      },
    });
    Object.assign(ids, {
      ownerA: ownerA.id,
      techA: techA.id,
      ownerB: ownerB.id,
      inspA: insp.id,
      evidenceA: ev.id,
    });
  });

  afterAll(async () => {
    await prisma.evidenceItem.deleteMany({ where: { title: { startsWith: S } } });
    await prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } });
    await prisma.user.updateMany({
      where: { email: { startsWith: S } },
      data: { organizationId: null },
    });
    await prisma.organization.deleteMany({ where: { name: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  it("lets the technician read back evidence they captured on a colleague's job", async () => {
    const res = await readAs(ids.techA);
    expect(res.status).toBe(200);
    expect(res.body).toContain(ids.evidenceA);
  });

  it("still lets the job's creator read it", async () => {
    const res = await readAs(ids.ownerA);
    expect(res.status).toBe(200);
    expect(res.body).toContain(ids.evidenceA);
  });

  it("refuses another organisation", async () => {
    const res = await readAs(ids.ownerB);
    expect(res.status).toBe(404);
  });
});
