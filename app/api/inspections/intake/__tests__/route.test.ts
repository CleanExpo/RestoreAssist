/**
 * RA-8495 — office intake routes with Prisma mocked. These run without a
 * database (C2). The database guarantees (row lock, rollback, unique index,
 * real idempotency replay) are proved in lib/jobs/__tests__.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const m = vi.hoisted(() => {
  const tx = {
    inspection: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    getServerSession: vi.fn(),
    tx,
    prismaMock: {
      user: { findUnique: vi.fn() },
      organization: { update: vi.fn(), findUnique: vi.fn() },
      organizationJobSequence: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    completeInTx: vi.fn(async (..._a: unknown[]) => true),
    allocate: vi.fn(),
    zohoPush: vi.fn(),
    seed: vi.fn(async (..._a: unknown[]) => true),
    reportError: vi.fn(),
  };
});
const { getServerSession, tx, prismaMock, completeInTx, allocate, zohoPush, seed, reportError } = m;

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => m.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: m.prismaMock }));
vi.mock("@/lib/idempotency", async () => {
  const real = await vi.importActual<typeof import("@/lib/idempotency")>("@/lib/idempotency");
  return {
    getIdempotencyKey: real.getIdempotencyKey,
    completeIdempotentSuccessInTransaction: (...a: unknown[]) => m.completeInTx(...a),
    withIdempotency: async (req: NextRequest, _scope: string, handler: (b: string) => unknown) =>
      handler(await req.text()),
  };
});
vi.mock("@/lib/jobs/job-number", async () => {
  const real = await vi.importActual<typeof import("@/lib/jobs/job-number")>("@/lib/jobs/job-number");
  return { ...real, allocateJobNumber: (...a: unknown[]) => m.allocate(...a) };
});
vi.mock("@/lib/integrations/zoho/queue", () => ({
  scheduleZohoInspectionPush: (...a: unknown[]) => m.zohoPush(...a),
}));
vi.mock("@/lib/compliance/seed-make-safe", () => ({
  ensureMakeSafeSeeded: (...a: unknown[]) => m.seed(...a),
}));
vi.mock("@/lib/observability", () => ({
  reportError: (...a: unknown[]) => m.reportError(...a),
}));

import { POST } from "../route";
import { GET as GET_SETTINGS, PATCH as PATCH_SETTINGS } from "../settings/route";

const DB_ORG = "org-from-database";
const SECRET_PHONE = "0412 345 678";
const SECRET_EMAIL = "insured.person@example.com";
const SECRET_NAME = "Pat Insured";

const validBody = {
  propertyAddress: "12 Example Street, Penrith NSW",
  propertyPostcode: "2750",
  policyNumber: "POL-123",
  claimNumber: "CLM-987",
  clientType: "LOSS_ADJUSTER",
  insuredName: SECRET_NAME,
  insuredPhone: SECRET_PHONE,
  insuredEmail: SECRET_EMAIL,
  claimType: "WATER",
  officeNotes: "Key under the mat",
};

function post(body: unknown, key: string | null = "11111111-2222-4333-8444-555555555555") {
  return new NextRequest("http://localhost/api/inspections/intake", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  prismaMock.user.findUnique.mockResolvedValue({ organizationId: DB_ORG, role: "USER" });
  allocate.mockResolvedValue({ jobNumber: "DRC-0007", prefix: "DRC", value: 7 });
  tx.inspection.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "insp-1",
    jobNumber: data.jobNumber,
    inspectionNumber: data.inspectionNumber,
    claimType: data.claimType,
  }));
  tx.auditLog.create.mockResolvedValue({});
  completeInTx.mockResolvedValue(true);
});

describe("POST /api/inspections/intake", () => {
  it("refuses an anonymous caller", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(post(validBody));
    expect(res.status).toBe(401);
    expect(allocate).not.toHaveBeenCalled();
  });

  it("refuses a save with no Idempotency-Key", async () => {
    const res = await POST(post(validBody, null));
    expect(res.status).toBe(400);
    expect(allocate).not.toHaveBeenCalled();
  });

  it("names the fields that need fixing", async () => {
    const res = await POST(post({ ...validBody, propertyPostcode: "27", clientType: "PLUMBER", insuredEmail: "nope" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Object.keys(json.error.fields).sort()).toEqual(["clientType", "insuredEmail", "propertyPostcode"]);
    expect(allocate).not.toHaveBeenCalled();
  });

  it("takes the organisation from the database, never from the body", async () => {
    const res = await POST(
      post({
        ...validBody,
        organizationId: "org-from-body",
        jobNumberOrganizationId: "org-from-body",
        jobNumber: "HACK-9999",
        userId: "someone-else",
      }),
    );
    expect(res.status).toBe(201);
    expect(allocate).toHaveBeenCalledWith(tx, DB_ORG);
    const data = tx.inspection.create.mock.calls[0][0].data;
    expect(data.jobNumberOrganizationId).toBe(DB_ORG);
    expect(data.jobNumber).toBe("DRC-0007");
    expect(data.userId).toBe("user-1");
    expect(data.clientType).toBe("LOSS_ADJUSTER");
    expect(data.policyNumber).toBe("POL-123");
    expect(data.claimNumber).toBe("CLM-987");
  });

  it("refuses a caller with no organisation before any number is taken", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: null, role: "ADMIN" });
    const res = await POST(post(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_ORGANISATION");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("reports a job-number collision with its own code and the organisation", async () => {
    tx.inspection.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["jobNumberOrganizationId", "jobNumber"] },
      }),
    );
    const res = await POST(post(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("JOB_NUMBER_COLLISION");
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: DB_ORG, jobNumber: "DRC-0007", code: "JOB_NUMBER_COLLISION" }),
    );
  });

  it("completes the idempotent response inside the transaction and keeps insured details out of it", async () => {
    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    expect(res.headers.get("X-RestoreAssist-Idempotency-Completed-In-Transaction")).toBe("true");
    const json = await res.json();
    expect(json).toEqual({
      inspection: { id: "insp-1", jobNumber: "DRC-0007", inspectionNumber: expect.stringMatching(/^NIR-/) },
      makeSafeSeeded: true,
    });
    expect(completeInTx).toHaveBeenCalledWith(expect.objectContaining({ tx, scope: "user-1", responseStatus: 201 }));
    const cached = (completeInTx.mock.calls[0] as unknown as [{ responseBody: string }])[0].responseBody;
    const audit = JSON.stringify(tx.auditLog.create.mock.calls[0][0]);
    for (const secret of [SECRET_PHONE, SECRET_EMAIL, SECRET_NAME]) {
      expect(cached).not.toContain(secret);
      expect(audit).not.toContain(secret);
      expect(JSON.stringify(json)).not.toContain(secret);
    }
    expect(audit).toContain("DRC-0007");
    expect(zohoPush).toHaveBeenCalledWith("insp-1");
  });

  it("answers 409 and marks the save uncertain when the idempotency reservation is lost", async () => {
    completeInTx.mockResolvedValue(false);
    const res = await POST(post(validBody));
    expect(res.status).toBe(409);
    expect(res.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBe("true");
  });

  it("still returns the saved job when make-safe seeding fails, and says so", async () => {
    seed.mockRejectedValue(new Error("seed down"));
    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    expect((await res.json()).makeSafeSeeded).toBe(false);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: "seed-make-safe", inspectionId: "insp-1" }),
    );
  });
});

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/inspections/intake/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/inspections/intake/settings", () => {
  beforeEach(() => {
    prismaMock.organization.findUnique.mockResolvedValue({ name: "DRC (NSW) Pty Ltd", jobNumberPrefix: null });
    prismaMock.organizationJobSequence.findUnique.mockResolvedValue({ lastValue: 41 });
  });

  it("shows any member the prefix and an estimate of the next number", async () => {
    const res = await GET_SETTINGS(new NextRequest("http://localhost/api/inspections/intake/settings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prefix: "DRC",
      derived: true,
      nextJobNumber: "DRC-0042",
      canEditPrefix: false,
    });
  });

  it.each(["USER", "MANAGER"])("refuses a %s who tries to change the prefix", async (role) => {
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: DB_ORG, role });
    const res = await PATCH_SETTINGS(patch({ prefix: "XYZ" }));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("refuses an admin who has left the organisation", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: null, role: "ADMIN" });
    const res = await PATCH_SETTINGS(patch({ prefix: "XYZ" }));
    expect(res.status).toBe(409);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("lets an admin change the prefix of their own organisation only", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: DB_ORG, role: "ADMIN" });
    const res = await PATCH_SETTINGS(patch({ prefix: " drcn ", organizationId: "org-from-body" }));
    expect(res.status).toBe(200);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: DB_ORG },
      data: { jobNumberPrefix: "DRCN" },
    });
  });

  it("refuses a malformed prefix", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: DB_ORG, role: "ADMIN" });
    const res = await PATCH_SETTINGS(patch({ prefix: "D-R" }));
    expect(res.status).toBe(400);
  });
});
