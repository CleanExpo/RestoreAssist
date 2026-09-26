import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7746: the NIR inspection PDF header names the BUSINESS — the workspace
// owner's saved business details — whoever in the workspace wrote the report.
// It used to read the author's own User row, so a technician's report came out
// with no business header at all (their own businessName is empty).

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const inspectionFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...a: unknown[]) => inspectionFindFirst(...a),
    },
  },
}));

const generateNIRPDF = vi.fn();
vi.mock("@/lib/nir-report-generation", () => ({
  generateNIRPDF: (...a: unknown[]) => generateNIRPDF(...a),
}));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/reports/append-sketch-pages", () => ({
  appendSketchPages: vi.fn(async (bytes: Uint8Array) => bytes),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { status: number }) =>
    new Response("e", { status: o.status }),
  fromException: () => new Response("e", { status: 500 }),
}));

import { GET } from "../route";

const req = () =>
  new NextRequest("http://localhost/api/inspections/insp-1/report?format=pdf");
const ctx = { params: Promise.resolve({ id: "insp-1" }) };

type FindArgs = {
  include: { report: { include: { user: { select: Record<string, unknown> } } } };
};

// The inspection row as the DB returns it for the route's own include: the
// report author is projected through whatever select the route asks for.
function serveReportAuthoredBy(
  authorId: string,
  fixture = makeTwoWorkspaces(),
) {
  inspectionFindFirst.mockImplementation(async (args: FindArgs) => ({
    id: "insp-1",
    inspectionNumber: "NIR-1",
    propertyAddress: "1 Test Street",
    status: "COMPLETED",
    environmentalData: null,
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    classifications: [],
    costEstimates: [],
    photos: [],
    claimSketches: [],
    floorPlanImageUrl: null,
    report: {
      id: "r1",
      user: project(
        fixture.userRow(authorId),
        args.include.report.include.user.select,
      ),
    },
  }));
}

function headerBusiness() {
  return generateNIRPDF.mock.calls[0][0].report.user as Record<string, unknown>;
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  generateNIRPDF.mockReset();
  generateNIRPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  getServerSession.mockResolvedValue({ user: { id: "tech-a" } });
});

describe("GET /api/inspections/[id]/report?format=pdf — business header (RA-7746)", () => {
  it("control: the owner's own report is headed with the owner's business", async () => {
    serveReportAuthoredBy("owner-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(headerBusiness().businessName).toBe("Harbour Restorations");
  });

  it("a technician's report is headed with the workspace owner's business", async () => {
    serveReportAuthoredBy("tech-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(headerBusiness().businessName).toBe("Harbour Restorations");
    expect(headerBusiness().businessABN).toBe("11 111 111 111");
    expect(headerBusiness().businessPhone).toBe("0400 000 001");
    expect(headerBusiness().businessEmail).toBe("office@harbour.example");
  });

  it("never takes another workspace's business details", async () => {
    serveReportAuthoredBy("tech-a");
    await GET(req(), ctx);
    expect(JSON.stringify(headerBusiness())).not.toMatch(/Rival/);
  });

  it("falls back to the author's own details when the owner saved none", async () => {
    serveReportAuthoredBy(
      "tech-a",
      makeTwoWorkspaces({
        users: {
          "owner-a": { businessName: null },
          "tech-a": { businessName: "Tess Drying Services" },
        },
      }),
    );
    await GET(req(), ctx);
    expect(headerBusiness().businessName).toBe("Tess Drying Services");
  });
});
