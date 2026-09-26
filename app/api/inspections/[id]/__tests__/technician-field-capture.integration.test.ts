/**
 * RA-7755 (prelaunch audit J-01) — an invited technician can capture on a
 * colleague's job.
 *
 * An invited technician (role USER) joins the organisation but no workspace,
 * and no create path writes Inspection.workspaceId. The field capture screen's
 * routes checked for the job's creator (or used the narrow write scope), so
 * every reading and photo save, and six reads, came back 404 or 403 for the
 * technician while the owning admin succeeded.
 *
 * Three people: the business owner (ADMIN, creates the job), a technician
 * (USER) in the same organisation, and an ADMIN of a different business. The
 * technician must get through; the outsider must still get 404; and the
 * technician must still be refused on a route that changes existing rows
 * (make-safe PATCH), because only creating and reading were widened.
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
import { POST as postMoisture } from "../moisture/route";
import { GET as getPhotos, POST as postPhoto } from "../photos/route";
import { GET as getSketches } from "../sketches/route";
import { GET as getFieldChecklist } from "../field-evidence-checklist/route";
import { GET as getClientSubmissions } from "../evidence/client-submissions/route";
import { GET as getMakeSafe, PATCH as patchMakeSafe } from "../make-safe/route";
import { GET as getVoiceChecklist } from "../voice/checklist/route";

const S = `ra7755-${Date.now().toString(36)}`;
const ids = { owner: "", tech: "", outsider: "", inspectionId: "", orgs: [] as string[] };

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const READS: Array<[string, Handler, string]> = [
  ["photos GET", getPhotos as Handler, "photos"],
  ["sketches GET", getSketches as Handler, "sketches"],
  ["field-evidence-checklist GET", getFieldChecklist as Handler, "field-evidence-checklist"],
  ["client-submissions GET", getClientSubmissions as Handler, "evidence/client-submissions"],
  ["make-safe GET", getMakeSafe as Handler, "make-safe"],
  ["voice checklist GET", getVoiceChecklist as Handler, "voice/checklist"],
];

function as(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}
const ctx = () => ({ params: Promise.resolve({ id: ids.inspectionId }) });
const url = (path: string) => `http://localhost/api/inspections/${ids.inspectionId}/${path}`;

function moistureReq(location: string) {
  return new NextRequest(url("moisture"), {
    method: "POST",
    body: JSON.stringify({ location, surfaceType: "Drywall", moistureLevel: 22, depth: "Surface" }),
    headers: { "content-type": "application/json" },
  });
}

function photoReq() {
  // No file: the access check runs first, so an admitted caller gets a
  // validation error and a refused caller gets 404.
  return new NextRequest(url("photos"), {
    method: "POST",
    body: new FormData(),
    headers: { "Idempotency-Key": `${S}-${Math.random().toString(36).slice(2)}` },
  });
}

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-7755: invited technician captures on a colleague's job",
  () => {
    beforeAll(async () => {
      const mk = async (suffix: string, role: "ADMIN" | "USER") =>
        prisma.user.create({
          data: { email: `${S}-${suffix}@test.local`, role, subscriptionStatus: "TRIAL" },
        });
      const owner = await mk("owner", "ADMIN");
      const tech = await mk("tech", "USER");
      const outsider = await mk("outsider", "ADMIN");
      Object.assign(ids, { owner: owner.id, tech: tech.id, outsider: outsider.id });

      const orgA = await prisma.organization.create({
        data: { name: `${S} A`, ownerId: owner.id, country: "AU" },
      });
      const orgB = await prisma.organization.create({
        data: { name: `${S} B`, ownerId: outsider.id, country: "AU" },
      });
      ids.orgs = [orgA.id, orgB.id];
      // The technician's state after accepting an invite: organisation set,
      // no workspace membership (app/api/invites/[token]/route.ts).
      await prisma.user.updateMany({
        where: { id: { in: [owner.id, tech.id] } },
        data: { organizationId: orgA.id },
      });
      await prisma.user.update({ where: { id: outsider.id }, data: { organizationId: orgB.id } });

      ids.inspectionId = (
        await prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-insp`,
            propertyAddress: "1 Field St",
            propertyPostcode: "4000",
            userId: owner.id,
            claimType: "WATER",
          },
        })
      ).id;
    });

    afterAll(async () => {
      const users = [ids.owner, ids.tech, ids.outsider].filter(Boolean);
      if (ids.inspectionId) {
        await prisma.moistureReading.deleteMany({ where: { inspectionId: ids.inspectionId } });
        await prisma.auditLog.deleteMany({ where: { inspectionId: ids.inspectionId } });
        await prisma.inspection.deleteMany({ where: { id: ids.inspectionId } });
      }
      await prisma.rateLimitHit.deleteMany({
        where: { OR: users.map((u) => ({ key: { contains: u } })) },
      });
      await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } });
      await prisma.organization.deleteMany({ where: { id: { in: ids.orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    it("the technician can add a moisture reading to the owner's job", async () => {
      as(ids.tech);
      const res = await postMoisture(moistureReq("Hallway wall"), ctx());
      expect(res.status, await res.clone().text()).toBe(201);
      expect(
        await prisma.moistureReading.count({
          where: { inspectionId: ids.inspectionId, location: "Hallway wall" },
        }),
      ).toBe(1);
    });

    it("the technician gets past the access check on photo upload", async () => {
      as(ids.tech);
      const res = await postPhoto(photoReq(), ctx());
      expect(res.status, await res.clone().text()).not.toBe(404);
    });

    it.each(READS)("the technician can open %s", async (_name, handler, path) => {
      as(ids.tech);
      const res = await handler(new NextRequest(url(path)), ctx());
      expect(res.status, await res.clone().text()).toBe(200);
    });

    it("a different business still gets 404 on every capture route", async () => {
      as(ids.outsider);
      expect((await postMoisture(moistureReq("Outsider wall"), ctx())).status).toBe(404);
      expect((await postPhoto(photoReq(), ctx())).status).toBe(404);
      for (const [name, handler, path] of READS) {
        const res = await handler(new NextRequest(url(path)), ctx());
        expect(res.status, name).toBe(404);
      }
      expect(
        await prisma.moistureReading.count({
          where: { inspectionId: ids.inspectionId, location: "Outsider wall" },
        }),
      ).toBe(0);
    });

    it("changing existing rows stays owner-only: the technician is refused on make-safe PATCH", async () => {
      as(ids.tech);
      const res = await patchMakeSafe(
        new NextRequest(url("make-safe"), {
          method: "PATCH",
          body: JSON.stringify({ action: "power_isolated", completed: true }),
          headers: { "content-type": "application/json" },
        }),
        ctx(),
      );
      expect(res.status).toBe(404);
    });
  },
);
