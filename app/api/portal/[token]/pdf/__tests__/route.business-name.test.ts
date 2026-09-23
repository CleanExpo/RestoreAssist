import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7727: the client's downloadable summary names the BUSINESS — the
// workspace owner's saved business name — whoever in the workspace wrote the
// report, never a person's name when the business has one.

const inspectionFindUnique = vi.fn();
const generateConsumerReportPdf = vi.fn();

vi.mock("@/lib/portal/resolve-portal-inspection", () => ({
  resolvePortalAccess: vi
    .fn()
    .mockResolvedValue({ kind: "inspection", inspectionId: "insp-1" }),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/portal/consumer-report", () => ({
  generateConsumerReportPdf: (...a: unknown[]) =>
    generateConsumerReportPdf(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
    },
  },
}));

import { GET } from "../route";

type Args = {
  select: { report: { select: { user: { select: Record<string, unknown> } } } };
};

function serveReportAuthoredBy(
  authorId: string,
  fixture = makeTwoWorkspaces(),
) {
  inspectionFindUnique.mockImplementation(async (args: Args) => ({
    inspectionNumber: "INSP-001",
    propertyAddress: "12 Test St, Brisbane",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    status: "IN_PROGRESS",
    technicianName: "Tess Tech",
    affectedAreas: [],
    scopeItems: [],
    report: {
      title: "Water damage report",
      status: "COMPLETED",
      user: project(
        fixture.userRow(authorId),
        args.select.report.select.user.select,
      ),
    },
  }));
}

const req = () =>
  new NextRequest("http://localhost/api/portal/tok/pdf", { method: "GET" });
const params = { params: Promise.resolve({ token: "tok" }) };

function contractorName() {
  return generateConsumerReportPdf.mock.calls[0][0].contractorName;
}

beforeEach(() => {
  inspectionFindUnique.mockReset();
  generateConsumerReportPdf.mockReset();
  generateConsumerReportPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("GET /api/portal/[token]/pdf — business name (RA-7727)", () => {
  it("control: the owner's report names the owner's business", async () => {
    serveReportAuthoredBy("owner-a");
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(contractorName()).toBe("Harbour Restorations");
  });

  it("a technician's report names the workspace owner's business", async () => {
    serveReportAuthoredBy("tech-a");
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(contractorName()).toBe("Harbour Restorations");
  });

  it("falls back to the author's name when no business name is saved", async () => {
    serveReportAuthoredBy(
      "tech-a",
      makeTwoWorkspaces({ users: { "owner-a": { businessName: null } } }),
    );
    await GET(req(), params);
    expect(contractorName()).toBe("Tess Tech");
  });
});
