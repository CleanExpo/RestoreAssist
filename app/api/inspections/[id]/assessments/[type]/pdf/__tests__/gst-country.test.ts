/**
 * RA-8281 item 3 — the assessment PDF takes GST and currency from the
 * organisation's country via lib/gst-rules (AU 10% AUD, NZ 15% NZD), not
 * a hard-coded 10% AUD. Reads the rendered PDF text, so a wrong rate or
 * currency in the heading is visible to the test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const getServerSession = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const inspectionFindUnique = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assessmentGeneration: { findFirst: (...a: unknown[]) => findFirst(...a) },
    inspection: {
      findUnique: (...a: unknown[]) => inspectionFindUnique(...a),
    },
  },
}));

import { GET } from "../route";

async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    const parts: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) parts.push(item.str);
      }
    }
    return parts.join(" ");
  } finally {
    await task.destroy();
  }
}

function storedGeneration(gstRate: number) {
  const line = (description: string, ex: number) => ({
    description,
    category: "EQUIPMENT",
    quantity: 1,
    unit: "ea",
    rate: ex,
    lineTotalExGst: ex,
    gstAmount: +(ex * gstRate).toFixed(2),
    lineTotalIncGst: +(ex * (1 + gstRate)).toFixed(2),
    pricingStatus: "priced",
  });
  return {
    id: "gen_1",
    generatedAt: new Date("2026-11-10T00:00:00Z"),
    modelUsed: "rule-based",
    latencyMs: 5,
    reportSections: { sections: [{ heading: "Situation", body: "Test." }] },
    scopeItems: [],
    estimateLines: [line("LGR dehumidifier", 200), line("Air mover", 100)],
    citations: [],
  };
}

async function renderFor(country: "AU" | "NZ", gstRate: number) {
  findFirst.mockResolvedValue(storedGeneration(gstRate));
  inspectionFindUnique.mockResolvedValue({
    inspectionNumber: "INS-1",
    propertyAddress: "1 Queen St",
    user: { organization: { country } },
  });
  const res = await GET(
    new NextRequest(
      "http://localhost/api/inspections/i_1/assessments/WATER/pdf",
    ),
    { params: Promise.resolve({ id: "i_1", type: "WATER" }) },
  );
  expect(res.status).toBe(200);
  return pdfText(new Uint8Array(await res.arrayBuffer()));
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  assertInspectionTenancy.mockResolvedValue({ ok: true });
});

describe("assessment PDF GST follows the organisation's country", () => {
  it("an NZ organisation's PDF shows NZD at 15% GST", async () => {
    const text = await renderFor("NZ", 0.15);
    expect(text).toContain("NZD");
    expect(text).toContain("15%");
    expect(text).not.toContain("AUD");
    // 300 ex GST + 45 GST = 345.
    expect(text).toContain("$345.00");
  });

  it("control: an AU organisation's PDF shows AUD at 10% GST", async () => {
    const text = await renderFor("AU", 0.1);
    expect(text).toContain("AUD");
    expect(text).not.toContain("NZD");
    expect(text).toContain("$330.00");
  });
});
