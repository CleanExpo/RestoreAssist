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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import {
  GET as getWorkflow,
  POST as postWorkflow,
  PATCH as patchWorkflow,
} from "../workflow/route";
import { GET as getValidate } from "../workflow/validate/route";
import { POST as postEvidence, DELETE as deleteEvidence } from "../evidence/route";
import { POST as postSubmit } from "../submit/route";
import { DELETE as removeTeamMember } from "../../../team/members/[id]/route";
import { buildWorkflowStepsData } from "@/lib/evidence";
// D-028: field-data handlers re-routed to the assigned-write helper.
import { POST as postEnvironmental } from "../environmental/route";
import { POST as postArea } from "../affected-areas/route";
import { PATCH as patchArea, DELETE as deleteArea } from "../affected-areas/[areaId]/route";
import {
  PATCH as patchReading,
  DELETE as deleteReading,
} from "../moisture/[readingId]/route";
import { PATCH as patchPhotoMeta } from "../photos/[photoId]/route";
import { POST as postScopeItem } from "../scope-items/route";
import {
  PATCH as patchScopeItem,
  DELETE as deleteScopeItem,
} from "../scope-items/[itemId]/route";
import { POST as postWaterClass } from "../water-damage-classification/route";
import { PUT as putFloorPlan } from "../floor-plan/route";
import { POST as postBiohazard } from "../biohazard-assessment/route";
import { POST as postPackOut } from "../contents-pack-out/route";
import { PATCH as patchGroupReadings } from "../group-readings/route";
import { DELETE as deleteSketch } from "../sketches/[sketchId]/route";
import { POST as postVoiceSession } from "../voice/session/route";
import { POST as postEquipment } from "../equipment-calculator/route";
import { POST as postDryingGoal } from "../drying-goal/route";

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

// ─── RA-7721: the ASSIGNED technician can run Guided Capture ────────────────
//
// Every case builds its own world (owner O + assigned technician T + an
// unassigned colleague C in org A; X in org B) and its own job, so no case
// depends on another's writes and `--sequence.shuffle` cannot reorder a
// result. Refusal cases name REAL rows, so a 404 comes from the access check
// and not from "row not found".

const S2 = `ra7721-${Date.now().toString(36)}`;
const made = { users: [] as string[], orgs: [] as string[], inspections: [] as string[] };
let seq = 0;

type World = { O: string; T: string; C: string; X: string; orgA: string; orgB: string };

async function mkUser(role: "ADMIN" | "USER", organizationId: string | null) {
  const u = await prisma.user.create({
    data: {
      email: `${S2}-${++seq}@test.local`,
      name: `${S2} user ${seq}`,
      role,
      subscriptionStatus: "TRIAL",
      organizationId,
    },
  });
  made.users.push(u.id);
  return u.id;
}

async function mkWorld(): Promise<World> {
  const O = await mkUser("ADMIN", null);
  const X = await mkUser("USER", null);
  const orgA = (
    await prisma.organization.create({ data: { name: `${S2} A${seq}`, ownerId: O, country: "AU" } })
  ).id;
  const orgB = (
    await prisma.organization.create({ data: { name: `${S2} B${seq}`, ownerId: X, country: "AU" } })
  ).id;
  made.orgs.push(orgA, orgB);
  await prisma.user.update({ where: { id: O }, data: { organizationId: orgA } });
  await prisma.user.update({ where: { id: X }, data: { organizationId: orgB } });
  const T = await mkUser("USER", orgA);
  const C = await mkUser("USER", orgA);
  return { O, T, C, X, orgA, orgB };
}

type Job = { id: string; workflowId: string | null; stepId: string | null };

/** A job owned by O, assigned to `technicianId`, seeded to be submittable. */
async function mkJob(
  w: World,
  opts: { technicianId?: string | null; workflow?: boolean; report?: boolean } = {},
): Promise<Job> {
  const reportId = opts.report
    ? (
        await prisma.report.create({
          data: {
            title: `${S2} report`,
            clientName: "Client",
            propertyAddress: "1 Capture St",
            hazardType: "Water",
            insuranceType: "Building",
            userId: w.O,
          },
        })
      ).id
    : null;
  const insp = await prisma.inspection.create({
    data: {
      inspectionNumber: `${S2}-insp-${++seq}`,
      propertyAddress: "1 Capture St",
      propertyPostcode: "4000",
      // The attendance date the technician recorded. Submit refuses a job
      // with none rather than inventing one (B13), so the fixture states it.
      inspectionDate: new Date("2026-10-01T23:00:00.000Z"),
      userId: w.O,
      claimType: "WATER",
      technicianId: opts.technicianId === undefined ? w.T : opts.technicianId,
      reportId,
      affectedAreas: {
        create: {
          roomZoneId: "Kitchen",
          affectedSquareFootage: 100,
          affectedAreaSqm: 9.29,
          waterSource: "Clean Water",
          timeSinceLoss: 12,
        },
      },
      moistureReadings: {
        create: { location: "Kitchen", surfaceType: "Drywall", moistureLevel: 30, depth: "Surface" },
      },
      photos: { create: { url: "https://example.test/p.jpg" } },
      makeSafeActions: {
        create: [
          { action: "power_isolated", applicable: false },
          { action: "gas_isolated", applicable: false },
          { action: "mould_containment", applicable: false },
          { action: "water_stopped", applicable: true, completed: true, completedAt: new Date() },
          { action: "occupant_briefing", applicable: false },
        ],
      },
    },
  });
  made.inspections.push(insp.id);
  if (opts.workflow === false) return { id: insp.id, workflowId: null, stepId: null };
  const wf = await prisma.inspectionWorkflow.create({
    data: { inspectionId: insp.id, jobType: "WATER_DAMAGE", totalSteps: 1 },
  });
  await prisma.workflowStep.createMany({ data: buildWorkflowStepsData(wf.id, "WATER_DAMAGE") });
  const step = await prisma.workflowStep.findFirst({
    where: { workflowId: wf.id },
    orderBy: { stepOrder: "asc" },
  });
  return { id: insp.id, workflowId: wf.id, stepId: step!.id };
}

async function mkEvidence(inspectionId: string, capturedById: string) {
  return (
    await prisma.evidenceItem.create({
      data: {
        inspectionId,
        evidenceClass: "PHOTO_DAMAGE",
        title: `${S2} evidence`,
        capturedById,
        capturedByName: "Someone",
      },
    })
  ).id;
}

function as2(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId, name: "Test User" } });
}
const c2 = (id: string) => ({ params: Promise.resolve({ id }) });
const u2 = (id: string, path: string) => `http://localhost/api/inspections/${id}/${path}`;
const jsonReq = (id: string, path: string, method: string, body?: unknown) =>
  new NextRequest(u2(id, path), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });

const call = {
  getWorkflow: (id: string) => getWorkflow(new NextRequest(u2(id, "workflow")), c2(id)),
  getValidate: (id: string) => getValidate(new NextRequest(u2(id, "workflow/validate")), c2(id)),
  postWorkflow: (id: string) =>
    postWorkflow(jsonReq(id, "workflow", "POST", { jobType: "WATER_DAMAGE" }), c2(id)),
  patchStep: (id: string, stepId: string, status = "COMPLETED") =>
    patchWorkflow(jsonReq(id, "workflow", "PATCH", { stepId, status }), c2(id)),
  postEvidence: (id: string, title: string) =>
    postEvidence(
      jsonReq(id, "evidence", "POST", { evidenceClass: "PHOTO_DAMAGE", title }),
      c2(id),
    ),
  deleteEvidence: (id: string, evidenceId: string) =>
    deleteEvidence(jsonReq(id, "evidence", "DELETE", { evidenceId }), c2(id)),
  submit: (id: string) => postSubmit(new NextRequest(u2(id, "submit"), { method: "POST" }), c2(id)),
};

const stepStatus = async (stepId: string) =>
  (await prisma.workflowStep.findUnique({ where: { id: stepId } }))!.status;
const inspStatus = async (id: string) =>
  (await prisma.inspection.findUnique({ where: { id } }))!.status;
const evidenceExists = async (id: string) =>
  (await prisma.evidenceItem.count({ where: { id } })) === 1;

/** Status + body in the failure message, so a red case names its cause. */
async function expectStatus(res: Response, status: number) {
  expect(res.status, await res.clone().text()).toBe(status);
}

const ASSIGNEE_REFUSED = "[tenancy.assignee_refused]";
function warnedAssigneeRefusal(spy: ReturnType<typeof vi.spyOn>, reason: string) {
  return spy.mock.calls.some(
    (args) =>
      args[0] === ASSIGNEE_REFUSED &&
      typeof args[1] === "object" &&
      (args[1] as { reason?: string }).reason === reason,
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-7721: the assigned technician can run Guided Capture",
  () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      if (made.inspections.length) {
        await prisma.pilotObservation.deleteMany({ where: { inspectionId: { in: made.inspections } } });
        await prisma.auditLog.deleteMany({ where: { inspectionId: { in: made.inspections } } });
        await prisma.inspection.deleteMany({ where: { id: { in: made.inspections } } });
      }
      if (made.users.length) {
        await prisma.report.deleteMany({ where: { userId: { in: made.users } } });
        await prisma.rateLimitHit.deleteMany({
          where: { OR: made.users.map((u) => ({ key: { contains: u } })) },
        });
        await prisma.user.updateMany({
          where: { id: { in: made.users } },
          data: { organizationId: null },
        });
      }
      await prisma.organization.deleteMany({ where: { id: { in: made.orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    });

    it("case 1: T can load the workflow and its validation", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      as2(w.T);
      await expectStatus(await call.getWorkflow(job.id), 200);
      await expectStatus(await call.getValidate(job.id), 200);
    });

    it("case 2: T can start the workflow", async () => {
      const w = await mkWorld();
      const job = await mkJob(w, { workflow: false });
      as2(w.T);
      await expectStatus(await call.postWorkflow(job.id), 201);
      expect(await prisma.inspectionWorkflow.count({ where: { inspectionId: job.id } })).toBe(1);
    });

    it("case 3: T can change a step", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      as2(w.T);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 200);
      expect(await stepStatus(job.stepId!)).toBe("COMPLETED");
    });

    it("case 4: T can add evidence, credited to T", async () => {
      // The unsigned-manifest policy is a separate gate (RA-7090) and is ON by
      // default; this case measures the tenancy gate, so the policy is off.
      vi.stubEnv("EVIDENCE_REQUIRE_SIGNED_MANIFEST", "false");
      const w = await mkWorld();
      const job = await mkJob(w);
      as2(w.T);
      await expectStatus(await call.postEvidence(job.id, `${S2}-case4`), 201);
      expect(
        await prisma.evidenceItem.count({
          where: { inspectionId: job.id, title: `${S2}-case4`, capturedById: w.T },
        }),
      ).toBe(1);
    });

    it("case 5: T can delete evidence T captured while the job is DRAFT, and it is audited", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      const ev = await mkEvidence(job.id, w.T);
      as2(w.T);
      await expectStatus(await call.deleteEvidence(job.id, ev), 200);
      expect(await evidenceExists(ev)).toBe(false);
      expect(
        await prisma.auditLog.count({
          where: { inspectionId: job.id, userId: w.T, entityType: "EvidenceItem", entityId: ev },
        }),
      ).toBe(1);
    });

    it("case 6: T cannot delete evidence the owner captured", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      const ev = await mkEvidence(job.id, w.O);
      as2(w.T);
      await expectStatus(await call.deleteEvidence(job.id, ev), 404);
      expect(await evidenceExists(ev)).toBe(true);
    });

    it("case 6b: T cannot delete even their own evidence once the job has left DRAFT", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      const ev = await mkEvidence(job.id, w.T);
      await prisma.inspection.update({ where: { id: job.id }, data: { status: "SUBMITTED" } });
      as2(w.T);
      await expectStatus(await call.deleteEvidence(job.id, ev), 404);
      expect(await evidenceExists(ev)).toBe(true);
    });

    it("case 7: T can submit; business side effects go to the owner, the actor record to T", async () => {
      const w = await mkWorld();
      const job = await mkJob(w, { report: true });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}", { status: 200 }));
      const warnSpy = vi.spyOn(console, "warn");
      as2(w.T);
      await expectStatus(await call.submit(job.id), 200);
      expect(await inspStatus(job.id)).not.toBe("DRAFT");
      expect(
        await prisma.auditLog.count({
          where: { inspectionId: job.id, entityType: "Inspection", userId: w.T },
        }),
      ).toBe(1);
      // D2: the accounting sync would forward T's cookie and be refused, so
      // it is skipped for an assignee submit and a warn is written instead.
      const syncCalls = fetchSpy.mock.calls.filter((a) =>
        String(a[0]).includes("/api/integrations/nir-sync"),
      );
      expect(syncCalls).toHaveLength(0);
      expect(
        warnSpy.mock.calls.some((a) => a[0] === "[nir-sync.skipped_assignee_submit]"),
      ).toBe(true);
      // D1: the activation event describes the business, so it is the owner's.
      await vi.waitFor(
        async () =>
          expect(
            await prisma.activationEvent.count({
              where: { userId: w.O, eventName: "first_report_saved" },
            }),
          ).toBe(1),
        { timeout: 5000 },
      );
      expect(
        await prisma.activationEvent.count({
          where: { userId: w.T, eventName: "first_report_saved" },
        }),
      ).toBe(0);
    });

    it("case 8a: an unassigned colleague cannot start the workflow; the owner can", async () => {
      const w = await mkWorld();
      const job = await mkJob(w, { workflow: false });
      as2(w.C);
      await expectStatus(await call.postWorkflow(job.id), 404);
      expect(await prisma.inspectionWorkflow.count({ where: { inspectionId: job.id } })).toBe(0);
      as2(w.O);
      await expectStatus(await call.postWorkflow(job.id), 201);
    });

    it("case 8b: an unassigned colleague cannot change a step; the owner can", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      as2(w.C);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 404);
      expect(await stepStatus(job.stepId!)).toBe("NOT_STARTED");
      as2(w.O);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 200);
      expect(await stepStatus(job.stepId!)).toBe("COMPLETED");
    });

    it("case 8c: an unassigned colleague cannot submit; the owner can", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      as2(w.C);
      await expectStatus(await call.submit(job.id), 404);
      expect(await inspStatus(job.id)).toBe("DRAFT");
      as2(w.O);
      await expectStatus(await call.submit(job.id), 200);
    });

    it("case 8d: an unassigned colleague cannot delete evidence, even their own; the owner can", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      const ev = await mkEvidence(job.id, w.C);
      as2(w.C);
      await expectStatus(await call.deleteEvidence(job.id, ev), 404);
      expect(await evidenceExists(ev)).toBe(true);
      as2(w.O);
      await expectStatus(await call.deleteEvidence(job.id, ev), 200);
      expect(await evidenceExists(ev)).toBe(false);
    });

    it("case 9: a different business gets 404 on all 7 route/method pairs", async () => {
      vi.stubEnv("EVIDENCE_REQUIRE_SIGNED_MANIFEST", "false");
      const w = await mkWorld();
      const job = await mkJob(w);
      const fresh = await mkJob(w, { workflow: false });
      const ev = await mkEvidence(job.id, w.O);
      as2(w.X);
      await expectStatus(await call.getWorkflow(job.id), 404);
      await expectStatus(await call.getValidate(job.id), 404);
      await expectStatus(await call.postWorkflow(fresh.id), 404);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 404);
      await expectStatus(await call.postEvidence(job.id, `${S2}-case9`), 404);
      await expectStatus(await call.deleteEvidence(job.id, ev), 404);
      await expectStatus(await call.submit(job.id), 404);
      expect(await prisma.inspectionWorkflow.count({ where: { inspectionId: fresh.id } })).toBe(0);
      expect(await stepStatus(job.stepId!)).toBe("NOT_STARTED");
      expect(await prisma.evidenceItem.count({ where: { title: `${S2}-case9` } })).toBe(0);
      expect(await evidenceExists(ev)).toBe(true);
      expect(await inspStatus(job.id)).toBe("DRAFT");
    });

    it("case 10: an assigned technician whose organisation changed is refused, with a warn", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      await prisma.user.update({ where: { id: w.T }, data: { organizationId: w.orgB } });
      const warnSpy = vi.spyOn(console, "warn");
      as2(w.T);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 404);
      expect(await stepStatus(job.stepId!)).toBe("NOT_STARTED");
      expect(warnedAssigneeRefusal(warnSpy, "org_mismatch")).toBe(true);
    });

    it("case 10b: an assigned technician with no organisation is refused", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      await prisma.user.update({ where: { id: w.T }, data: { organizationId: null } });
      const warnSpy = vi.spyOn(console, "warn");
      as2(w.T);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 404);
      expect(await stepStatus(job.stepId!)).toBe("NOT_STARTED");
      expect(warnedAssigneeRefusal(warnSpy, "org_null")).toBe(true);
    });

    it("case 11: the owner's own actions are unchanged", async () => {
      vi.stubEnv("EVIDENCE_REQUIRE_SIGNED_MANIFEST", "false");
      const w = await mkWorld();
      const job = await mkJob(w);
      const fresh = await mkJob(w, { workflow: false });
      const ev = await mkEvidence(job.id, w.T);
      as2(w.O);
      await expectStatus(await call.getWorkflow(job.id), 200);
      await expectStatus(await call.getValidate(job.id), 200);
      await expectStatus(await call.postWorkflow(fresh.id), 201);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 200);
      await expectStatus(await call.postEvidence(job.id, `${S2}-case11`), 201);
      await expectStatus(await call.deleteEvidence(job.id, ev), 200);
      expect(await evidenceExists(ev)).toBe(false);
      await expectStatus(await call.submit(job.id), 200);
      expect(await inspStatus(job.id)).not.toBe("DRAFT");
    });

    it("case 12: a reassignment between the check and the write changes 0 rows", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      const ev = await mkEvidence(job.id, w.T);
      const mod = (await import("@/lib/auth/assert-tenancy")) as Record<string, unknown>;
      expect(typeof mod.assertInspectionAssignedWrite).toBe("function");
      const resolve = mod.assertInspectionAssignedWrite as (
        s: { user: { id: string } },
        id: string,
      ) => Promise<
        | { ok: true; data: { inspectionManyWhere: object; childInspectionFilter?: object } }
        | { ok: false }
      >;
      const r = await resolve({ user: { id: w.T } }, job.id);
      if (!r.ok) throw new Error("assigned technician should resolve");
      const { inspectionManyWhere, childInspectionFilter } = r.data;
      // Positive control: before the race the filters DO match the job.
      expect(await prisma.inspection.count({ where: inspectionManyWhere })).toBe(1);

      await prisma.inspection.update({ where: { id: job.id }, data: { technicianId: w.O } });

      expect(await prisma.inspection.count({ where: inspectionManyWhere })).toBe(0);
      const cas = await prisma.inspection.updateMany({
        where: { ...inspectionManyWhere, status: "DRAFT" },
        data: { status: "SUBMITTED" },
      });
      expect(cas.count).toBe(0);
      const del = await prisma.evidenceItem.deleteMany({
        where: { id: ev, inspection: childInspectionFilter },
      });
      expect(del.count).toBe(0);
      const step = await prisma.workflowStep.updateMany({
        where: { id: job.stepId!, workflow: { inspection: childInspectionFilter } },
        data: { status: "COMPLETED" },
      });
      expect(step.count).toBe(0);
      expect(await inspStatus(job.id)).toBe("DRAFT");
      expect(await evidenceExists(ev)).toBe(true);
    });

    it("case 12b: a technician reassigned after the check cannot start the workflow", async () => {
      const w = await mkWorld();
      const job = await mkJob(w, { workflow: false });
      // Deterministic race: the access check has already passed; the owner
      // reassigns the job just before the handler's write transaction opens.
      // `prisma` from @/lib/prisma is a Proxy that reads every property from the
      // real client, so a spy must sit on that client (cached on globalThis
      // outside production), not on the Proxy.
      const client = (globalThis as { prisma?: typeof prisma }).prisma;
      if (!client) throw new Error("real Prisma client not initialised");
      const realTransaction = client.$transaction.bind(client);
      let reassigned = false;
      vi.spyOn(client, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
        await client.inspection.update({ where: { id: job.id }, data: { technicianId: w.O } });
        reassigned = true;
        return (realTransaction as (...a: unknown[]) => unknown)(...args);
      }) as typeof client.$transaction);
      as2(w.T);
      const res = await call.postWorkflow(job.id);
      // Positive control first: the reassignment really ran inside this request.
      expect(reassigned).toBe(true);
      await expectStatus(res, 404);
      expect(await prisma.inspectionWorkflow.count({ where: { inspectionId: job.id } })).toBe(0);
    });

    it("case 13: a user of another business assigned to the job is refused by the organisation rule", async () => {
      const w = await mkWorld();
      const job = await mkJob(w, { technicianId: null });
      await prisma.inspection.update({ where: { id: job.id }, data: { technicianId: w.X } });
      const ev = await mkEvidence(job.id, w.X);
      const warnSpy = vi.spyOn(console, "warn");
      as2(w.X);
      await expectStatus(await call.patchStep(job.id, job.stepId!), 404);
      await expectStatus(await call.submit(job.id), 404);
      await expectStatus(await call.deleteEvidence(job.id, ev), 404);
      expect(await stepStatus(job.stepId!)).toBe("NOT_STARTED");
      expect(await inspStatus(job.id)).toBe("DRAFT");
      expect(await evidenceExists(ev)).toBe(true);
      expect(warnedAssigneeRefusal(warnSpy, "org_mismatch")).toBe(true);
    });

    it("case 14: removing the technician from the team revokes their access", async () => {
      const w = await mkWorld();
      const job = await mkJob(w);
      // Discriminating pair: T gets through first, so the later 404 is the removal.
      as2(w.T);
      await expectStatus(await call.patchStep(job.id, job.stepId!, "IN_PROGRESS"), 200);
      as2(w.O);
      const removed = await removeTeamMember(
        new NextRequest(`http://localhost/api/team/members/${w.T}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: w.T }) },
      );
      await expectStatus(removed, 200);
      as2(w.T);
      await expectStatus(await call.patchStep(job.id, job.stepId!, "COMPLETED"), 404);
      expect(await stepStatus(job.stepId!)).toBe("IN_PROGRESS");
    });

    it("case 15: a technician's submit is priced at the owner's rates", async () => {
      const w = await mkWorld();
      const RATE = 123.45;
      const fields = [
        "masterQualifiedNormalHours", "masterQualifiedSaturday", "masterQualifiedSunday",
        "qualifiedTechnicianNormalHours", "qualifiedTechnicianSaturday", "qualifiedTechnicianSunday",
        "labourerNormalHours", "labourerSaturday", "labourerSunday",
        "airMoverAxialDailyRate", "airMoverCentrifugalDailyRate", "dehumidifierLGRDailyRate",
        "dehumidifierDesiccantDailyRate", "afdUnitLargeDailyRate", "extractionTruckMountedHourlyRate",
        "extractionElectricHourlyRate", "injectionDryingSystemDailyRate", "antimicrobialTreatmentRate",
        "mouldRemediationTreatmentRate", "biohazardTreatmentRate", "administrationFee", "callOutFee",
        "thermalCameraUseCostPerAssessment",
      ];
      await prisma.companyPricingConfig.create({
        data: {
          userId: w.O,
          ...Object.fromEntries(fields.map((f) => [f, RATE])),
        } as Parameters<typeof prisma.companyPricingConfig.create>[0]["data"],
      });
      const job = await mkJob(w);
      as2(w.T);
      await expectStatus(await call.submit(job.id), 200);
      // processInspectionComplete swallows its own errors; prove it finished
      // before reading its output.
      expect(await inspStatus(job.id)).toBe("ESTIMATED");
      expect(
        await prisma.costEstimate.count({ where: { inspectionId: job.id, rate: RATE } }),
      ).toBeGreaterThan(0);
    });
  },
);

// ─── D-028: the assigned technician writes FIELD DATA on the job ────────────
//
// Founder decision 2026-10-11 ("Yes, field data only"), narrowed to create
// and update. Each FIELD_CASES row is one re-routed handler. Four actors per row, each on a fresh job assigned to T:
// T (assigned technician) succeeds AND the row really changed; C (unassigned
// colleague, same organisation) gets 404 and nothing changed; X (another
// business) gets 404 and nothing changed; O (the owner) is unchanged. The
// "row changed" check is what catches the trap this decision is about: a
// handler admitted by the gate whose write still filters on the creator's
// userId answers 200 and changes 0 rows.

type Seeded = {
  areaId: string;
  readingId: string;
  photoId: string;
  scopeItemId: string;
  sketchId: string;
};
type FieldCase = {
  name: string;
  ok: number;
  call: (job: Job, s: Seeded) => Promise<Response>;
  /** False on a freshly seeded job; true once the write has landed. */
  changed: (job: Job, s: Seeded) => Promise<boolean>;
};

type AnyHandler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;
const h = (fn: unknown) => fn as AnyHandler;
const cx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const MARK = `${S2}-d028`;

async function seedFieldRows(job: Job): Promise<Seeded> {
  const [area, reading, photo] = await Promise.all([
    prisma.affectedArea.findFirstOrThrow({ where: { inspectionId: job.id }, select: { id: true } }),
    prisma.moistureReading.findFirstOrThrow({ where: { inspectionId: job.id }, select: { id: true } }),
    prisma.inspectionPhoto.findFirstOrThrow({ where: { inspectionId: job.id }, select: { id: true } }),
  ]);
  const scopeItem = await prisma.scopeItem.create({
    data: { inspectionId: job.id, itemType: "GENERAL", description: "Seeded item" },
    select: { id: true },
  });
  const sketch = await prisma.claimSketch.create({
    data: { inspectionId: job.id, floorNumber: 0 },
    select: { id: true },
  });
  return {
    areaId: area.id,
    readingId: reading.id,
    photoId: photo.id,
    scopeItemId: scopeItem.id,
    sketchId: sketch.id,
  };
}

const FIELD_CASES: FieldCase[] = [
  {
    name: "environmental POST",
    ok: 200,
    call: (job) =>
      h(postEnvironmental)(
        jsonReq(job.id, "environmental", "POST", { ambientTemperature: 21, humidityLevel: 60, notes: MARK }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.environmentalData.count({ where: { inspectionId: job.id, notes: MARK } })) === 1,
  },
  {
    name: "affected-areas POST",
    ok: 201,
    call: (job) =>
      h(postArea)(
        jsonReq(job.id, "affected-areas", "POST", {
          roomZoneId: MARK,
          affectedAreaSqm: 4,
          waterSource: "Clean Water",
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.affectedArea.count({ where: { inspectionId: job.id, roomZoneId: MARK } })) === 1,
  },
  {
    name: "affected-areas/[areaId] PATCH",
    ok: 200,
    call: (job, s) =>
      h(patchArea)(
        jsonReq(job.id, `affected-areas/${s.areaId}`, "PATCH", { description: MARK }),
        cx({ id: job.id, areaId: s.areaId }),
      ),
    changed: async (_job, s) =>
      (await prisma.affectedArea.findUnique({ where: { id: s.areaId } }))?.description === MARK,
  },
  {
    name: "moisture/[readingId] PATCH",
    ok: 200,
    call: (job, s) =>
      h(patchReading)(
        jsonReq(job.id, `moisture/${s.readingId}`, "PATCH", { mapX: 0.25, mapY: 0.75 }),
        cx({ id: job.id, readingId: s.readingId }),
      ),
    changed: async (_job, s) =>
      (await prisma.moistureReading.findUnique({ where: { id: s.readingId } }))?.mapX === 0.25,
  },
  {
    name: "photos/[photoId] PATCH",
    ok: 200,
    call: (job, s) =>
      h(patchPhotoMeta)(
        jsonReq(job.id, `photos/${s.photoId}`, "PATCH", { description: MARK }),
        cx({ id: job.id, photoId: s.photoId }),
      ),
    changed: async (_job, s) =>
      (await prisma.inspectionPhoto.findUnique({ where: { id: s.photoId } }))?.description === MARK,
  },
  {
    name: "make-safe PATCH",
    ok: 200,
    call: (job) =>
      h(patchMakeSafe)(
        jsonReq(job.id, "make-safe", "PATCH", {
          actions: [{ action: "power_isolated", applicable: true, completed: true }],
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.makeSafeAction.count({
        where: { inspectionId: job.id, action: "power_isolated", completed: true },
      })) === 1,
  },
  {
    name: "scope-items POST",
    ok: 201,
    call: (job) =>
      h(postScopeItem)(
        jsonReq(job.id, "scope-items", "POST", { itemType: "GENERAL", description: MARK }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.scopeItem.count({ where: { inspectionId: job.id, description: MARK } })) === 1,
  },
  {
    name: "scope-items/[itemId] PATCH",
    ok: 200,
    call: (job, s) =>
      h(patchScopeItem)(
        jsonReq(job.id, `scope-items/${s.scopeItemId}`, "PATCH", { description: MARK }),
        cx({ id: job.id, itemId: s.scopeItemId }),
      ),
    changed: async (_job, s) =>
      (await prisma.scopeItem.findUnique({ where: { id: s.scopeItemId } }))?.description === MARK,
  },
  {
    name: "water-damage-classification POST",
    ok: 200,
    call: (job) =>
      h(postWaterClass)(
        jsonReq(job.id, "water-damage-classification", "POST", {
          waterCategory: "CAT_1",
          damageClass: "CLASS_2",
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.waterDamageClassification.count({ where: { inspectionId: job.id } })) === 1,
  },
  {
    name: "floor-plan PUT",
    ok: 200,
    call: (job) =>
      h(putFloorPlan)(
        jsonReq(job.id, "floor-plan", "PUT", {
          imageUrl: `https://res.cloudinary.com/demo/image/upload/${MARK}.png`,
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      ((await prisma.inspection.findUnique({ where: { id: job.id } }))?.floorPlanImageUrl ?? "").includes(MARK),
  },
  {
    name: "biohazard-assessment POST",
    ok: 200,
    call: (job) =>
      h(postBiohazard)(
        jsonReq(job.id, "biohazard-assessment", "POST", { contaminationAreaM2: 3 }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.biohazardAssessment.count({ where: { inspectionId: job.id } })) === 1,
  },
  {
    name: "group-readings PATCH",
    ok: 200,
    call: (job, s) =>
      h(patchGroupReadings)(
        jsonReq(job.id, "group-readings", "PATCH", {
          assignments: [{ name: MARK, readingIds: [s.readingId] }],
        }),
        cx({ id: job.id }),
      ),
    changed: async (_job, s) =>
      (await prisma.moistureReading.findUnique({ where: { id: s.readingId } }))?.affectedArea === MARK,
  },
  {
    name: "voice/session POST",
    ok: 200,
    call: (job) =>
      h(postVoiceSession)(jsonReq(job.id, "voice/session", "POST", {}), cx({ id: job.id })),
    changed: async (job) =>
      (await prisma.voiceCopilotSession.count({ where: { inspectionId: job.id } })) === 1,
  },
  {
    name: "equipment-calculator POST",
    ok: 200,
    call: (job) =>
      h(postEquipment)(
        jsonReq(job.id, "equipment-calculator", "POST", {
          affectedAreaM2: 20,
          damageClass: "CLASS_2",
          damageCategory: "CAT_1",
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.scopeItem.count({ where: { inspectionId: job.id, autoDetermined: true } })) > 0,
  },
  {
    name: "drying-goal POST",
    ok: 200,
    call: (job) =>
      h(postDryingGoal)(
        jsonReq(job.id, "drying-goal", "POST", {
          targetCategory: "Category 1",
          targetClass: "Class 2",
        }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await (prisma as any).dryingGoalRecord.count({ where: { inspectionId: job.id } })) === 1,
  },
];

/**
 * Coordinator ruling on D-028: create and update only. Every delete, and
 * contents pack-out (its items carry replacementValueAud and
 * restorationCostEstimate), stays with the owner's reach. The assigned
 * technician is refused here exactly as before D-028.
 */
const OWNER_ONLY_CASES: FieldCase[] = [
  {
    name: "affected-areas/[areaId] DELETE",
    ok: 200,
    call: (job, s) =>
      h(deleteArea)(
        jsonReq(job.id, `affected-areas/${s.areaId}`, "DELETE"),
        cx({ id: job.id, areaId: s.areaId }),
      ),
    changed: async (_job, s) => (await prisma.affectedArea.count({ where: { id: s.areaId } })) === 0,
  },
  {
    name: "moisture/[readingId] DELETE",
    ok: 200,
    call: (job, s) =>
      h(deleteReading)(
        jsonReq(job.id, `moisture/${s.readingId}`, "DELETE"),
        cx({ id: job.id, readingId: s.readingId }),
      ),
    changed: async (_job, s) =>
      (await prisma.moistureReading.count({ where: { id: s.readingId } })) === 0,
  },
  {
    name: "scope-items/[itemId] DELETE",
    ok: 200,
    call: (job, s) =>
      h(deleteScopeItem)(
        jsonReq(job.id, `scope-items/${s.scopeItemId}`, "DELETE"),
        cx({ id: job.id, itemId: s.scopeItemId }),
      ),
    changed: async (_job, s) => (await prisma.scopeItem.count({ where: { id: s.scopeItemId } })) === 0,
  },
  {
    name: "contents-pack-out POST",
    ok: 201,
    call: (job) =>
      h(postPackOut)(
        jsonReq(job.id, "contents-pack-out", "POST", { itemDescription: MARK }),
        cx({ id: job.id }),
      ),
    changed: async (job) =>
      (await prisma.contentsPackOutItem.count({
        where: { inspectionId: job.id, itemDescription: MARK },
      })) === 1,
  },
  {
    name: "sketches/[sketchId] DELETE",
    ok: 200,
    call: (job, s) =>
      h(deleteSketch)(
        jsonReq(job.id, `sketches/${s.sketchId}`, "DELETE"),
        cx({ id: job.id, sketchId: s.sketchId }),
      ),
    changed: async (_job, s) => (await prisma.claimSketch.count({ where: { id: s.sketchId } })) === 0,
  },
];

describe.skipIf(!process.env.DATABASE_URL)(
  "D-028: the assigned technician writes field data on the job",
  () => {
    afterAll(async () => {
      if (made.inspections.length) {
        await prisma.auditLog.deleteMany({ where: { inspectionId: { in: made.inspections } } });
        await prisma.inspection.deleteMany({ where: { id: { in: made.inspections } } });
      }
      // The RA-7721 block's afterAll has already run, so the users,
      // organisations and rate-limit rows this block made are removed here.
      if (made.users.length) {
        await prisma.report.deleteMany({ where: { userId: { in: made.users } } });
        await prisma.rateLimitHit.deleteMany({
          where: { OR: made.users.map((u) => ({ key: { contains: u } })) },
        });
        await prisma.user.updateMany({
          where: { id: { in: made.users } },
          data: { organizationId: null },
        });
      }
      await prisma.organization.deleteMany({ where: { id: { in: made.orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    });

    async function fresh() {
      const w = await mkWorld();
      const job = await mkJob(w, { workflow: false });
      const seeded = await seedFieldRows(job);
      return { w, job, seeded };
    }

    it.each(FIELD_CASES.map((c) => [c.name, c] as const))(
      "%s: the assigned technician succeeds and the row changes",
      async (_name, c) => {
        const { w, job, seeded } = await fresh();
        // Negative control first: the seed has not already satisfied the check.
        expect(await c.changed(job, seeded)).toBe(false);
        as2(w.T);
        await expectStatus(await c.call(job, seeded), c.ok);
        expect(await c.changed(job, seeded)).toBe(true);
      },
    );

    it.each(FIELD_CASES.map((c) => [c.name, c] as const))(
      "%s: an unassigned colleague gets 404 and nothing changes",
      async (_name, c) => {
        const { w, job, seeded } = await fresh();
        as2(w.C);
        await expectStatus(await c.call(job, seeded), 404);
        expect(await c.changed(job, seeded)).toBe(false);
      },
    );

    it.each(FIELD_CASES.map((c) => [c.name, c] as const))(
      "%s: another business gets 404 and nothing changes",
      async (_name, c) => {
        const { w, job, seeded } = await fresh();
        as2(w.X);
        await expectStatus(await c.call(job, seeded), 404);
        expect(await c.changed(job, seeded)).toBe(false);
      },
    );

    it.each(OWNER_ONLY_CASES.map((c) => [c.name, c] as const))(
      "%s stays owner-only: the assigned technician gets 404 and nothing changes",
      async (_name, c) => {
        const { w, job, seeded } = await fresh();
        as2(w.T);
        await expectStatus(await c.call(job, seeded), 404);
        expect(await c.changed(job, seeded)).toBe(false);
        // Positive control: the same request succeeds for the owner.
        as2(w.O);
        await expectStatus(await c.call(job, seeded), c.ok);
        expect(await c.changed(job, seeded)).toBe(true);
      },
    );

    it.each(FIELD_CASES.map((c) => [c.name, c] as const))(
      "%s: the owner is unchanged",
      async (_name, c) => {
        const { w, job, seeded } = await fresh();
        as2(w.O);
        await expectStatus(await c.call(job, seeded), c.ok);
        expect(await c.changed(job, seeded)).toBe(true);
      },
    );
  },
);
