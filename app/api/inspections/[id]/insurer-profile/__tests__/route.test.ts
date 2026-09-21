/**
 * RA-7508 / #2190 — POST /api/inspections/[id]/insurer-profile used to
 * call `(prisma as any).inspectionEvidence.groupBy`. There is no
 * InspectionEvidence model, so every caller that reached the evidence-gap
 * branch threw TypeError 500.
 *
 * The schema owner is EvidenceItem (inspectionId + evidenceClass, with
 * @@index([inspectionId, evidenceClass])). These tests pin the document:
 * submittedEvidence must match the seeded EvidenceItem groupBy rows, not
 * merely a 200 status. The prisma mock has no inspectionEvidence delegate,
 * so a revert to the old call 500s again.
 *
 * RA-7570 — the same route selected `{ id, jobType, metadata }` on
 * Inspection with `as any`. Inspection has neither column (job type lives
 * on InspectionWorkflow.jobType; claimType is the fallback equivalent).
 * These tests mock the real Prisma shape and throw if the route asks for
 * the gone columns, so a revert 500s again.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const evidenceItemGroupBy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
    evidenceItem: {
      groupBy: (...args: unknown[]) => evidenceItemGroupBy(...args),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { GET, POST } from "../route";

const INSPECTION_ID = "insp_1";
const params = { params: Promise.resolve({ id: INSPECTION_ID }) };
const listParams = { params: Promise.resolve({ id: "list" }) };

function postRequest(body: Record<string, unknown> | string) {
  return new NextRequest(
    `http://localhost/api/inspections/${INSPECTION_ID}/insurer-profile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function getRequest(id = INSPECTION_ID) {
  return new NextRequest(
    `http://localhost/api/inspections/${id}/insurer-profile`,
    { method: "GET" },
  );
}

const SEEDED_EVIDENCE_COUNTS = [
  { evidenceClass: "MOISTURE_READING", _count: { id: 3 } },
  { evidenceClass: "PHOTO_DAMAGE", _count: { id: 1 } },
  { evidenceClass: "PHOTO_COMPLETION", _count: { id: 2 } },
] as const;

const REAL_INSPECTION = {
  id: INSPECTION_ID,
  claimType: "WATER",
  inspectionWorkflow: { jobType: "WATER_DAMAGE" },
};

function prismaUnknownFieldError(field: string) {
  const err = new Error(
    `Unknown field \`${field}\` for select statement on model \`Inspection\``,
  );
  (err as { code?: string }).code = "P2009";
  return err;
}

function assertRealInspectionSelect(args: unknown) {
  const select = (args as { select?: Record<string, unknown> } | undefined)
    ?.select;
  if (select && "jobType" in select) {
    throw prismaUnknownFieldError("jobType");
  }
  if (select && "metadata" in select) {
    throw prismaUnknownFieldError("metadata");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockImplementation(async (args: unknown) => {
    assertRealInspectionSelect(args);
    return { ...REAL_INSPECTION };
  });
  evidenceItemGroupBy.mockResolvedValue([...SEEDED_EVIDENCE_COUNTS]);
});

describe("POST /api/inspections/[id]/insurer-profile — RA-7508 evidence gap", () => {
  it("maps seeded EvidenceItem rows onto submittedEvidence, not just a 200", async () => {
    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.submittedEvidence).toEqual([
      { evidenceClass: "MOISTURE_READING", count: 3 },
      { evidenceClass: "PHOTO_DAMAGE", count: 1 },
      { evidenceClass: "PHOTO_COMPLETION", count: 2 },
    ]);
    expect(body.evidenceGapAnalysis.totalSubmitted).toBe(3);

    // IAG WATER_DAMAGE requires 3 moisture readings and 4 damage photos.
    // Seeded rows meet moisture, fall short on photos — gap analysis must
    // carry the seeded counts, not a status-code-only success.
    const missing = body.evidenceGapAnalysis.missing as Array<{
      evidenceClass: string;
      required: number;
      submitted: number;
    }>;
    expect(missing.map((row) => row.evidenceClass)).not.toContain(
      "MOISTURE_READING",
    );
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceClass: "PHOTO_DAMAGE",
          required: 4,
          submitted: 1,
        }),
      ]),
    );

    expect(evidenceItemGroupBy).toHaveBeenCalledWith({
      by: ["evidenceClass"],
      where: { inspectionId: INSPECTION_ID },
      _count: { id: true },
    });
  });

  it("returns an empty submittedEvidence array when no EvidenceItem rows exist", async () => {
    evidenceItemGroupBy.mockResolvedValueOnce([]);

    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.submittedEvidence).toEqual([]);
    expect(body.evidenceGapAnalysis.totalSubmitted).toBe(0);
    expect(body.evidenceGapAnalysis.isComplete).toBe(false);
  });

  it("does not query a non-existent inspectionEvidence delegate", () => {
    const routeSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../route.ts"),
      "utf8",
    );
    expect(routeSource).not.toMatch(/inspectionEvidence/);
    expect(routeSource).toMatch(/prisma\.evidenceItem\.groupBy/);
    expect(routeSource).not.toMatch(/prisma as any/);
  });
});

describe("RA-7570 — job type from InspectionWorkflow, not Inspection.jobType", () => {
  it("happy path returns a valid insurer profile and workflow job type", async () => {
    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.insurerProfile).toEqual(
      expect.objectContaining({ id: "IAG", name: expect.any(String) }),
    );
    expect(body.inspectionJobType).toBe("WATER_DAMAGE");
    expect(body.evidenceRequirements.length).toBeGreaterThan(0);
    expect(body.reportSections).toEqual(
      expect.objectContaining({
        required: expect.any(Array),
        preferred: expect.any(Array),
        order: expect.any(Array),
      }),
    );

    expect(inspectionFindFirst).toHaveBeenCalledWith({
      where: { id: INSPECTION_ID, userId: "user_1" },
      select: {
        id: true,
        claimType: true,
        inspectionWorkflow: { select: { jobType: true } },
      },
    });
  });

  it("falls back to Inspection.claimType when no workflow is attached", async () => {
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      assertRealInspectionSelect(args);
      return {
        id: INSPECTION_ID,
        claimType: "WATER",
        inspectionWorkflow: null,
      };
    });

    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inspectionJobType).toBe("WATER_DAMAGE");
    expect(body.insurerProfile.id).toBe("IAG");
  });

  it("returns 422 when job type cannot be resolved from workflow or claimType", async () => {
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      assertRealInspectionSelect(args);
      return {
        id: INSPECTION_ID,
        claimType: null,
        inspectionWorkflow: null,
      };
    });

    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/no job type/i);
    expect(evidenceItemGroupBy).not.toHaveBeenCalled();
  });

  it("returns 422 rather than inventing a job type for unmapped claimType values", async () => {
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      assertRealInspectionSelect(args);
      return {
        id: INSPECTION_ID,
        claimType: "CONTENTS",
        inspectionWorkflow: { jobType: "not-a-real-job-type" },
      };
    });

    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 400 for invalid insurer IDs", async () => {
    const response = await POST(postRequest({ insurerId: "NOT_AN_INSURER" }), params);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/Invalid insurer ID/);
    expect(inspectionFindFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(postRequest("{"), params);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/Invalid JSON/);
  });

  it("returns 404 when the inspection is missing", async () => {
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      assertRealInspectionSelect(args);
      return null;
    });

    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(inspectionFindFirst).not.toHaveBeenCalled();
  });

  it("does not 500 when Prisma would reject Inspection.jobType / metadata", async () => {
    const response = await POST(postRequest({ insurerId: "IAG" }), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    expect(body.insurerProfile.id).toBe("IAG");
  });

  it("route source does not select gone Inspection columns or use as any", () => {
    const routeSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../route.ts"),
      "utf8",
    );
    expect(routeSource).not.toMatch(/as any/);
    expect(routeSource).not.toMatch(/jobType:\s*true,\s*\n\s*metadata/);
    expect(routeSource).toMatch(/inspectionWorkflow:\s*\{/);
    expect(routeSource).toMatch(/normalizeClaimType/);
  });
});

describe("GET /api/inspections/[id]/insurer-profile", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const response = await GET(getRequest(), params);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("lists catalog profiles without querying Inspection.jobType", async () => {
    const response = await GET(getRequest("list"), listParams);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "IAG", label: expect.any(String) }),
      ]),
    );
    expect(inspectionFindFirst).not.toHaveBeenCalled();
  });

  it("returns a clear unassigned payload for a real inspection (no 500)", async () => {
    const response = await GET(getRequest(), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insurerProfile).toBeNull();
    expect(body.message).toMatch(/No insurer profile assigned/);
    expect(body.availableProfiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "IAG" })]),
    );
    expect(body.inspectionJobType).toBe("WATER_DAMAGE");
    expect(body.error).toBeUndefined();
  });

  it("returns 404 when the inspection is missing", async () => {
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      assertRealInspectionSelect(args);
      return null;
    });

    const response = await GET(getRequest(), params);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
