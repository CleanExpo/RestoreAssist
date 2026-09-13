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
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const inspectionUpdate = vi.fn();
const evidenceItemGroupBy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
      update: (...args: unknown[]) => inspectionUpdate(...args),
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

import { POST } from "../route";

const INSPECTION_ID = "insp_1";
const params = { params: Promise.resolve({ id: INSPECTION_ID }) };

function postRequest(body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/inspections/${INSPECTION_ID}/insurer-profile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const SEEDED_EVIDENCE_COUNTS = [
  { evidenceClass: "MOISTURE_READING", _count: { id: 3 } },
  { evidenceClass: "PHOTO_DAMAGE", _count: { id: 1 } },
  { evidenceClass: "PHOTO_COMPLETION", _count: { id: 2 } },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockResolvedValue({
    id: INSPECTION_ID,
    jobType: "WATER_DAMAGE",
    metadata: {},
  });
  inspectionUpdate.mockResolvedValue({ id: INSPECTION_ID });
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
