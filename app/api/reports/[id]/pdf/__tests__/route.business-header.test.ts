import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7727: the PDF header names the BUSINESS — the workspace owner's saved
// business details — whoever in the workspace wrote the report. It used to
// read the author's own User row, so a technician's report came out headed
// with nothing (their own businessName is empty).

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const reportFindFirst = vi.fn();
const reportFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...a: unknown[]) => reportFindFirst(...a),
      findUnique: (...a: unknown[]) => reportFindUnique(...a),
    },
  },
}));

const generateIICRCReportPDF = vi.fn();
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: (...a: unknown[]) => generateIICRCReportPDF(...a),
}));

vi.mock("@/lib/portal-token", () => ({ verifyInsurerToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { status: number }) =>
    new Response("e", { status: o.status }),
  fromException: () => new Response("e", { status: 500 }),
}));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/reports/r1/pdf");
const ctx = { params: Promise.resolve({ id: "r1" }) };

// The report row as the DB returns it for the route's own include: the author
// is projected through whatever `include.user.select` the route asks for.
function serveReportAuthoredBy(
  authorId: string,
  fixture = makeTwoWorkspaces(),
) {
  reportFindUnique.mockImplementation(
    async (args: { include: { user: { select: Record<string, unknown> } } }) => ({
      id: "r1",
      reportNumber: "RPT-1",
      moistureReadings: null,
      psychrometricReadings: null,
      psychrometricAssessment: null,
      equipmentSelection: null,
      scopeAreas: null,
      user: project(fixture.userRow(authorId), args.include.user.select),
      client: { name: "Client" },
    }),
  );
}

function headerUser() {
  return generateIICRCReportPDF.mock.calls[0][0].user as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  reportFindUnique.mockReset();
  generateIICRCReportPDF.mockReset();
  generateIICRCReportPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  reportFindFirst.mockResolvedValue({ id: "r1" });
});

describe("GET /api/reports/[id]/pdf — business header (RA-7727)", () => {
  it("control: the owner's own report is headed with the owner's business", async () => {
    serveReportAuthoredBy("owner-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(headerUser().businessName).toBe("Harbour Restorations");
    expect(headerUser().businessABN).toBe("11 111 111 111");
  });

  it("a technician's report is headed with the workspace owner's business", async () => {
    serveReportAuthoredBy("tech-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(headerUser().businessName).toBe("Harbour Restorations");
    expect(headerUser().businessAddress).toBe("1 Harbour St");
    expect(headerUser().businessABN).toBe("11 111 111 111");
    // The technician is still the named author.
    expect(headerUser().name).toBe("Tess Tech");
  });

  it("never takes another workspace's business details", async () => {
    serveReportAuthoredBy("tech-a");
    await GET(req(), ctx);
    expect(JSON.stringify(headerUser())).not.toMatch(/Rival/);
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
    expect(headerUser().businessName).toBe("Tess Drying Services");
  });
});
