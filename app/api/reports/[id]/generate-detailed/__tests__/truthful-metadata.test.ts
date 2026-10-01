import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), text: [] as string[], rectangles: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mock.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  report: { findFirst: mock.find }, scope: { findFirst: async () => null }, estimate: { findFirst: async () => null },
} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: async (_r: unknown, _u: unknown, cb: () => unknown) => cb() }));
vi.mock("pdf-lib", () => ({
  rgb: (...values: number[]) => values,
  StandardFonts: { Helvetica: "normal", HelveticaBold: "bold" },
  PDFDocument: { create: async () => ({
    embedFont: async () => ({ widthOfTextAtSize: (text: string, size: number) => text.length * size / 2 }),
    addPage: () => ({
      getSize: () => ({ width: 595, height: 842 }),
      drawText: (text: string) => mock.text.push(text),
      drawRectangle: mock.rectangles, drawLine: () => undefined, drawCircle: () => undefined,
    }),
    getPageCount: () => 1,
    save: async () => new Uint8Array([37, 80, 68, 70]),
  }) },
}));
import { POST } from "../route";

let report: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); mock.text.length = 0;
  mock.session.mockResolvedValue({ user: { id: "synthetic-owner" } });
  report = { id: "synthetic-report", reportNumber: "SYN-001", title: "Synthetic Report",
    clientName: "Synthetic Client", propertyAddress: "1 Test Street", inspectionDate: null,
    createdAt: new Date("2021-02-03T04:05:00Z"), insuranceType: "", user: { name: "Synthetic Technician" } };
  mock.find.mockImplementation(async () => report);
});
async function generated() {
  const response = await POST(new NextRequest("http://localhost/api/reports/synthetic-report/generate-detailed", { method: "POST" }),
    { params: Promise.resolve({ id: "synthetic-report" }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(mock.find.mock.calls[0][0].where).toEqual({ id: "synthetic-report", userId: "synthetic-owner" });
}
function valueAfter(label: string) { const index = mock.text.indexOf(label); expect(index).toBeGreaterThan(-1); return mock.text[index + 1]; }
describe("detailed PDF does not claim unrecorded attendance or coverage", () => {
  it("does not label report creation time as inspection/contact attendance", async () => {
    await generated();
    for (const label of ["Date:", "Date On-Site:", "Time On-Site:", "Date Contacted:", "Time Contacted:"]) {
      expect(valueAfter(label)).toBe("N/A");
    }
  });
  it.each(["", "Building and Contents Insurance"])("does not infer claim approval or denial from insurance text %s", async (insuranceType) => {
    report.insuranceType = insuranceType;
    await generated();
    expect(valueAfter("Claim Covered:")).toBe("Not recorded");
  });
  it("preserves a recorded inspection date", async () => {
    report.inspectionDate = new Date("2026-09-01T09:00:00Z");
    await generated();
    expect(valueAfter("Date On-Site:")).toBe((report.inspectionDate as Date).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }));
  });
});
