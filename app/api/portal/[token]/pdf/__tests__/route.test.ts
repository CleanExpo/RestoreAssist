import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/portal/consumer-report", () => ({
  generateConsumerReportPdf: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { verifyPortalToken } from "@/lib/portal-token";
import { applyRateLimit } from "@/lib/rate-limiter";
import { generateConsumerReportPdf } from "@/lib/portal/consumer-report";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mVerify = verifyPortalToken as unknown as ReturnType<typeof vi.fn>;
const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const mPdf = generateConsumerReportPdf as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function inspectionWithReport(status: string | null) {
  return {
    inspectionNumber: "INSP-001",
    propertyAddress: "12 Test St, Brisbane",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    status: "IN_PROGRESS",
    technicianName: "Alex Tech",
    affectedAreas: [{ id: "a1" }],
    scopeItems: [{ id: "s1" }],
    report: status
      ? {
          title: "Water damage report",
          status,
          user: { businessName: "Restore Co", name: "Alex" },
        }
      : null,
  };
}

const req = () =>
  new NextRequest("http://localhost/api/portal/tok/pdf", { method: "GET" });
const params = { params: Promise.resolve({ token: "tok" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
  mLookup.mockResolvedValue(null);
  mVerify.mockReturnValue(null);
  p.inspection.findFirst.mockResolvedValue(null);
  p.inspection.findUnique.mockResolvedValue(null);
  mPdf.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
});

describe("GET /api/portal/[token]/pdf (RA-7575)", () => {
  it("returns not-yet-ready for a valid account-token on a DRAFT report", async () => {
    mLookup.mockResolvedValue({ clientId: "c_1" });
    mVerify.mockReturnValue(null);
    p.inspection.findFirst.mockResolvedValue({ id: "insp_1" });
    p.inspection.findUnique.mockResolvedValue(inspectionWithReport("DRAFT"));

    const res = await GET(req(), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Report is not yet ready for download",
    });
    expect(mPdf).not.toHaveBeenCalled();
  });

  it("returns not-yet-ready for a valid HMAC token on an unfinished report", async () => {
    mLookup.mockResolvedValue(null);
    mVerify.mockReturnValue({ inspectionId: "insp_1" });
    p.inspection.findUnique.mockResolvedValue(inspectionWithReport("DRAFT"));

    const res = await GET(req(), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Report is not yet ready for download",
    });
  });

  it("returns expired/invalid only when neither token type resolves", async () => {
    mLookup.mockResolvedValue(null);
    mVerify.mockReturnValue(null);

    const res = await GET(req(), params);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Link has expired or is invalid",
    });
    expect(p.inspection.findUnique).not.toHaveBeenCalled();
    expect(mPdf).not.toHaveBeenCalled();
  });

  it("returns not-yet-ready when a valid account-token has no inspection yet", async () => {
    mLookup.mockResolvedValue({ clientId: "c_1" });
    mVerify.mockReturnValue(null);
    p.inspection.findFirst.mockResolvedValue(null);

    const res = await GET(req(), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Report is not yet ready for download",
    });
  });

  it("streams a PDF for a valid account-token on a COMPLETED report", async () => {
    mLookup.mockResolvedValue({ clientId: "c_1" });
    mVerify.mockReturnValue(null);
    p.inspection.findFirst.mockResolvedValue({ id: "insp_1" });
    p.inspection.findUnique.mockResolvedValue(
      inspectionWithReport("COMPLETED"),
    );

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(mPdf).toHaveBeenCalledTimes(1);
  });
});
