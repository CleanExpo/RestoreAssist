import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8281 B1 class fix: the Excel export prices stored equipment from the
// report business's CURRENT price list. The route must hand that list to the
// workbook builder; without it every equipment rate reads "Rate not set".

const getServerSession = vi.fn();
const reportFindFirst = vi.fn();
const resolveReportPricing = vi.fn();
const generateSingleReportExcel = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportFinancialReach: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));
vi.mock("@/lib/pricing/report-pricing", () => ({
  resolveReportPricing: (...args: unknown[]) => resolveReportPricing(...args),
}));
vi.mock("@/lib/excel-export", () => ({
  generateSingleReportExcel: (...args: unknown[]) => generateSingleReportExcel(...args),
  saveWorkbookAsBuffer: vi.fn().mockResolvedValue(Buffer.from("xlsx")),
}));
vi.mock("@/lib/cloudinary", () => ({
  uploadExcelToCloudinary: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { GET } from "../route";

const OWN = { dehumidifierLGRDailyRate: 55 };
const BUSINESS = { dehumidifierLGRDailyRate: 70 };

beforeEach(() => {
  for (const m of [getServerSession, reportFindFirst, resolveReportPricing, generateSingleReportExcel]) {
    m.mockReset();
  }
  getServerSession.mockResolvedValue({ user: { id: "manager-a" } });
  reportFindFirst.mockResolvedValue({
    id: "report-1",
    userId: "tech-a",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    reportNumber: "R-1",
    user: { name: "Tess", pricingConfig: OWN },
    equipmentSelection: JSON.stringify([{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }]),
  });
  generateSingleReportExcel.mockResolvedValue({});
});

async function exportOnce() {
  const res = await GET(
    new NextRequest("http://localhost/api/reports/report-1/export-excel"),
    { params: Promise.resolve({ id: "report-1" }) },
  );
  return res;
}

describe("GET /api/reports/[id]/export-excel price list", () => {
  it("resolves the creator's business price list and hands it to the workbook", async () => {
    resolveReportPricing.mockResolvedValue({ ok: true, pricingConfig: BUSINESS });
    await exportOnce();
    expect(resolveReportPricing).toHaveBeenCalledWith(
      "tech-a",
      OWN,
      new Date("2026-10-01T00:00:00Z"),
    );
    expect(generateSingleReportExcel).toHaveBeenCalledTimes(1);
    expect(generateSingleReportExcel.mock.calls[0][1].pricingConfig).toBe(BUSINESS);
  });

  it("an unconfirmed business hands no price list (every rate then reads Rate not set)", async () => {
    resolveReportPricing.mockResolvedValue({ ok: false });
    await exportOnce();
    expect(generateSingleReportExcel.mock.calls[0][1].pricingConfig).toBeNull();
  });
});
