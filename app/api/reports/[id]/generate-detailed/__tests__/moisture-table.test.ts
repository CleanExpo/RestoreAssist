/**
 * RA-8548 follow-up — the detailed report's moisture table prints rows only
 * from saved readings. No rows made from scope data, no padding rows, no
 * benchmark that no saved record supports.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  session: vi.fn(),
  find: vi.fn(),
  scope: vi.fn(),
  text: [] as string[],
}));
vi.mock("next-auth", () => ({ getServerSession: mock.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ role: "ADMIN", organizationId: null, organizationLeftAt: null, organizationLeftId: null, organization: null }) },
    report: { findFirst: mock.find },
    scope: { findFirst: mock.scope },
    estimate: { findFirst: async () => null },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (_r: unknown, _u: unknown, cb: () => unknown) => cb(),
}));
vi.mock("pdf-lib", () => ({
  rgb: (...values: number[]) => values,
  StandardFonts: { Helvetica: "normal", HelveticaBold: "bold" },
  PDFDocument: {
    create: async () => ({
      embedFont: async () => ({
        widthOfTextAtSize: (text: string, size: number) =>
          (text.length * size) / 2,
      }),
      addPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
        drawText: (text: string) => mock.text.push(text),
        drawRectangle: () => undefined,
        drawLine: () => undefined,
        drawCircle: () => undefined,
      }),
      getPageCount: () => 1,
      save: async () => new Uint8Array([37, 80, 68, 70]),
    }),
  },
}));
import { POST } from "../route";

const INVENTED = ["100%", "15-17%", "14%", "Downstairs lounge room", "N/A"];
const NONE = "No moisture readings were recorded for this job.";

let report: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  mock.text.length = 0;
  mock.session.mockResolvedValue({ user: { id: "synthetic-owner" } });
  mock.scope.mockResolvedValue(null);
  report = {
    id: "synthetic-report",
    reportNumber: "SYN-001",
    title: "Synthetic Report",
    clientName: "Synthetic Client",
    propertyAddress: "1 Test Street",
    inspectionDate: null,
    createdAt: new Date("2021-02-03T04:05:00Z"),
    insuranceType: "",
    user: { name: "Synthetic Technician" },
  };
  mock.find.mockImplementation(async () => report);
});

/** Every string drawn between the moisture heading and the next section. */
async function moistureSection(): Promise<string[]> {
  const response = await POST(
    new NextRequest(
      "http://localhost/api/reports/synthetic-report/generate-detailed",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "synthetic-report" }) },
  );
  expect(response.status).toBe(200);
  const start = mock.text.indexOf("MOISTURE READINGS:");
  const end = mock.text.indexOf("Other Comments:");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return mock.text.slice(start + 1, end);
}

describe("detailed report moisture table (RA-8548 follow-up)", () => {
  it("states plainly that no readings were recorded when nothing was saved", async () => {
    const section = await moistureSection();
    expect(section).toEqual([NONE]);
  });

  it("builds no rows from scope data alone", async () => {
    mock.scope.mockResolvedValue({
      siteVariables: JSON.stringify({
        structure: "Residential - Single Family Home",
        materials: "Gypsum board walls, carpet",
      }),
    });
    const section = await moistureSection();
    expect(section).toEqual([NONE]);
    for (const invented of INVENTED) {
      expect(section.join(" ")).not.toContain(invented);
    }
    expect(section.join(" ")).not.toContain("Gypsum board walls");
  });

  it("prints one row per saved reading, with no padding rows", async () => {
    report.moistureReadings = JSON.stringify([
      { location: "Kitchen", material: "Timber", moistureContent: 22 },
      {
        location: "Hall",
        surfaceType: "Plasterboard",
        moistureLevel: 0,
        unit: "WME",
        depth: "Surface",
        dryStandard: "12",
      },
    ]);
    const section = await moistureSection();
    expect(section).toEqual([
      "Location",
      "Material",
      "Reading",
      "Depth",
      "Dry standard",
      "Kitchen",
      "Timber",
      "22",
      "Not recorded",
      "Not recorded",
      "Hall",
      "Plasterboard",
      "0 WME",
      "Surface",
      "12",
    ]);
    for (const invented of INVENTED) {
      expect(section).not.toContain(invented);
    }
  });

  it("reads saved readings from the NIR envelope", async () => {
    report.moistureReadings = JSON.stringify({
      moistureReadings: [
        { location: "Lounge", surfaceType: "Carpet", moistureLevel: 35 },
      ],
      affectedAreas: [],
      scopeItems: [],
      photos: [],
    });
    const section = await moistureSection();
    expect(section.slice(5)).toEqual([
      "Lounge",
      "Carpet",
      "35",
      "Not recorded",
      "Not recorded",
    ]);
  });

  it("prints a saved tier 2 free-text answer verbatim instead of the empty statement", async () => {
    report.tier2Responses = JSON.stringify({
      T2_Q1_moistureReadings: "Kitchen subfloor read high at the doorway.",
    });
    const section = await moistureSection();
    expect(section).not.toContain(NONE);
    expect(section.join(" ")).toContain(
      "Kitchen subfloor read high at the doorway.",
    );
  });
});
