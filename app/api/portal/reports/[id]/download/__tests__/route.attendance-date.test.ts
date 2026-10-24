import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

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

const attendance = new Date("2026-10-02T00:00:00.000Z");
const createdAt = new Date("2026-06-01T00:00:00.000Z");

type Args = {
  select: {
    user: { select: Record<string, unknown> };
    inspection: { select: Record<string, unknown> };
  };
};

function serveReport(inspectionDate: Date | null) {
  const fixture = makeTwoWorkspaces();
  reportFindFirst.mockImplementation(async (args: Args) => ({
    id: "r1",
    title: "Water damage report",
    status: "COMPLETED",
    propertyAddress: "12 Test St",
    createdAt,
    reportNumber: "RPT-1",
    user: project(fixture.userRow("owner-a"), args.select.user.select),
    inspection: {
      inspectionNumber: "INSP-1",
      inspectionDate,
      affectedAreas: [],
      scopeItems: [],
    },
  }));
}

const req = () =>
  new NextRequest("http://localhost/api/portal/reports/r1/download");
const ctx = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  reportFindFirst.mockReset();
  generateConsumerReportPdf.mockReset();
  generateConsumerReportPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("GET /api/portal/reports/[id]/download — attendance date", () => {
  it("uses linked inspection inspectionDate for PDF attendanceDate", async () => {
    serveReport(attendance);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const input = generateConsumerReportPdf.mock.calls[0][0] as {
      attendanceDate: Date | null;
    };
    expect(input.attendanceDate).toEqual(attendance);
    expect(input.attendanceDate).not.toEqual(createdAt);
  });

  it("passes null attendance when inspection has no recorded date", async () => {
    serveReport(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const input = generateConsumerReportPdf.mock.calls[0][0] as {
      attendanceDate: Date | null;
    };
    expect(input.attendanceDate).toBeNull();
  });
});
