import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-7727: the signed-in client's report download names the BUSINESS — the
// workspace owner's saved business name — whoever wrote the report.

const reportFindFirst = vi.fn();
const generateConsumerReportPdf = vi.fn();

vi.mock("@/lib/portal/require-client-auth", () => ({
  requireClientAuth: vi
    .fn()
    .mockResolvedValue({ ok: true, claims: { clientId: "client-1" } }),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { status: number }) =>
    new Response("e", { status: o.status }),
  fromException: () => new Response("e", { status: 500 }),
}));
vi.mock("@/lib/portal/consumer-report", () => ({
  generateConsumerReportPdf: (...a: unknown[]) =>
    generateConsumerReportPdf(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
  },
}));

import { GET } from "../route";

function serveReportAuthoredBy(authorId: string) {
  const fixture = makeTwoWorkspaces();
  reportFindFirst.mockImplementation(
    async (args: { select: { user: { select: Record<string, unknown> } } }) => ({
      id: "r1",
      title: "Water damage report",
      status: "COMPLETED",
      propertyAddress: "12 Test St",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      reportNumber: "RPT-1",
      user: project(fixture.userRow(authorId), args.select.user.select),
      inspection: null,
    }),
  );
}

const req = () =>
  new NextRequest("http://localhost/api/portal/reports/r1/download");
const ctx = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  reportFindFirst.mockReset();
  generateConsumerReportPdf.mockReset();
  generateConsumerReportPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("GET /api/portal/reports/[id]/download — business name (RA-7727)", () => {
  it("control: the owner's report names the owner's business", async () => {
    serveReportAuthoredBy("owner-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(generateConsumerReportPdf.mock.calls[0][0].contractorName).toBe(
      "Harbour Restorations",
    );
  });

  it("a technician's report names the workspace owner's business", async () => {
    serveReportAuthoredBy("tech-a");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(generateConsumerReportPdf.mock.calls[0][0].contractorName).toBe(
      "Harbour Restorations",
    );
  });
});
