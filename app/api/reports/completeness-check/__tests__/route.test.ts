import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { COMPLETENESS_INSPECTION_INCLUDE } from "@/lib/reports/completeness-inspection-include";
import type { CompletenessInput } from "@/lib/reports/completeness";

const getServerSession = vi.fn();
const reportFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/reports/completeness-check", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function completeReport(): CompletenessInput & {
  id: string;
  reportNumber: string;
} {
  return {
    id: "rep_1",
    reportNumber: "R-1",
    client: {
      name: "Acme Pty Ltd",
      email: "ops@acme.test",
      phone: "0400000000",
    },
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    totalCost: null,
    authorityForms: [{ id: "af1" }],
    inspection: {
      environmentalData: { temp: 22 },
      moistureReadings: [{ id: "m1" }],
      affectedAreas: [{ id: "a1" }],
      classifications: [{ id: "c1" }],
      scopeItems: [{ id: "s1" }],
      costEstimates: [{ id: "ce1" }],
      photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      claimSketches: [
        {
          id: "sk1",
          floorNumber: 0,
          renderedPngUrl: `storage://sketch-media/inspections/i1/exports/verified/floor-0-${"a".repeat(64)}.png`,
        },
      ],
      contentsManifestDraft: "manifest",
      floorPlanImageUrl: null,
      powerCircuits: 2,
      powerCircuitRatingA: 20,
    },
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("POST /api/reports/completeness-check (RA-7571)", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ reportId: "rep_1" }));

    expect(response.status).toBe(401);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when reportId is missing", async () => {
    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the report is not found", async () => {
    reportFindFirst.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ reportId: "missing" }));

    expect(response.status).toBe(404);
  });

  it("fetches inspection via a Prisma-valid include (no scalar contentsManifestDraft)", async () => {
    reportFindFirst.mockResolvedValueOnce(completeReport());

    const response = await POST(postRequest({ reportId: "rep_1" }));
    expect(response.status).toBe(200);

    expect(reportFindFirst).toHaveBeenCalledTimes(1);
    const args = reportFindFirst.mock.calls[0]?.[0] as {
      include?: { inspection?: { include?: Record<string, unknown> } };
    };
    expect(args.include?.inspection?.include).toEqual(
      COMPLETENESS_INSPECTION_INCLUDE,
    );
    expect(args.include?.inspection?.include).not.toHaveProperty(
      "contentsManifestDraft",
    );
  });

  it("returns a completeness result, not 500, when the manifest scalar is present", async () => {
    reportFindFirst.mockResolvedValueOnce(completeReport());

    const response = await POST(postRequest({ reportId: "rep_1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reportId).toBe("rep_1");
    expect(body.reportTitle).toBe("R-1");
    expect(typeof body.overallScore).toBe("number");
    expect(Array.isArray(body.sections)).toBe(true);
    const manifest = body.sections.find(
      (s: { name: string }) => s.name === "Contents Manifest",
    );
    expect(manifest).toMatchObject({ status: "complete", score: 100 });
  });

  it("returns a completeness result when the manifest scalar is absent", async () => {
    const report = completeReport();
    report.inspection!.contentsManifestDraft = null;
    reportFindFirst.mockResolvedValueOnce(report);

    const response = await POST(postRequest({ reportId: "rep_1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    const manifest = body.sections.find(
      (s: { name: string }) => s.name === "Contents Manifest",
    );
    expect(manifest.status).toBe("partial");
    expect(manifest.score).toBe(50);
  });
});
