/**
 * RA-7736: ServiceM8 and Ascora also consume NIRJobPayload and must carry the
 * contingency, like the Xero / MYOB / QuickBooks syncs.
 *
 * Neither sends a per-line tax code today: ServiceM8 job materials carry no
 * tax field, and Ascora receives a text scope summary plus job totals. So
 * "taxed like the invoice" here means the contingency line has exactly the
 * same shape as every priced line (no different tax treatment), and the lines
 * add up to the ex-GST total the invoice uses.
 *
 * Same fixture as nir-sync-contingency.test.ts: 2259.00 priced + 271.08
 * contingency = 2530.08 ex-GST.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeGstCents, getGstTreatment, type Country } from "@/lib/gst-rules";

vi.mock("../oauth-handler", () => ({
  getTokens: vi.fn(async () => ({
    accessToken: "tok",
    refreshToken: "ref",
    isExpired: false,
  })),
  markIntegrationError: vi.fn(),
  logSync: vi.fn(),
}));

import type { NIRJobPayload } from "../xero/nir-sync";
import { syncNIRJobToServiceM8 } from "../servicem8/nir-sync";
import { syncNIRJobToAscora } from "../ascora/nir-sync";

const PRICED_CENTS = [32500, 17500, 22500, 48400, 105000];
const CONTINGENCY_CENTS = 27108;
const EX_GST_CENTS = 253008;

function payload(country: Country): NIRJobPayload {
  const t = getGstTreatment(country);
  const gstAmount = computeGstCents(EX_GST_CENTS, country);
  return {
    reportId: "rep-1",
    country,
    currency: t.currency,
    clientName: "Client",
    propertyAddress: "1 Test St",
    reportNumber: "NIR-2026-09-F1C142",
    damageType: "WATER",
    scopeItems: PRICED_CENTS.map((amount, i) => ({
      description: `Priced line ${i}`,
      category: "LABOUR",
      quantity: 1,
      unit: "each",
      unitPriceExGST: amount,
      gstRate: t.ratePercent,
      subtotalExGST: amount,
    })),
    contingencyExGST: CONTINGENCY_CENTS,
    totalExGST: EX_GST_CENTS,
    gstAmount,
    totalIncGST: EX_GST_CENTS + gstAmount,
    inspectionDate: new Date("2026-09-22"),
    reportDate: new Date("2026-09-23"),
    technician: "Tech",
  } as NIRJobPayload;
}

let posted: Array<{ url: string; body: any }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  posted = [];
  process.env.ASCORA_API_KEY = "test-placeholder";
  vi.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if ((init?.method ?? "GET") === "POST") posted.push({ url, body });
    const payloadBody = url.includes("ascora")
      ? { success: true, job: { jobId: 7, jobNumber: "J7" } }
      : { uuid: "job-uuid" };
    return new Response(JSON.stringify(payloadBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

const toCents = (dollars: number) => Math.round(dollars * 100);

describe.each(["AU", "NZ"] as const)("RA-7736 contingency export (%s)", (country) => {
  it("ServiceM8: one Contingency material shaped like the priced lines, lines equal the ex-GST total", async () => {
    await syncNIRJobToServiceM8("integ_sm8", payload(country));
    const materials = posted
      .filter((p) => p.url.endsWith("/jobmaterial.json"))
      .map((p) => p.body);

    const contingency = materials.filter((m) => /Contingency/.test(m.name));
    expect(contingency).toHaveLength(1);
    expect(toCents(Number(contingency[0].unit_price)) * contingency[0].qty).toBe(
      CONTINGENCY_CENTS,
    );
    // Same tax treatment as every priced line: identical field set.
    expect(Object.keys(contingency[0]).sort()).toEqual(
      Object.keys(materials[0]).sort(),
    );

    const exGst = materials.reduce(
      (s, m) => s + toCents(Number(m.unit_price)) * m.qty,
      0,
    );
    expect(exGst).toBe(EX_GST_CENTS);
  });

  it("Ascora: one Contingency line in the scope summary, lines equal the ex-GST total sent", async () => {
    await syncNIRJobToAscora("integ_ascora", payload(country));
    const job = posted.find((p) => p.url.includes("/Jobs/Job/"))!.body;

    const lines: string[] = job.jobDescription
      .split("\n")
      .filter((l: string) => /^\d+\. /.test(l));
    const contingency = lines.filter((l) => /Contingency/.test(l));
    expect(contingency).toHaveLength(1);

    const amount = (l: string) => {
      const m = l.match(/— ([\d.]+) \S+ @ \$([\d.]+)$/)!;
      return Math.round(Number(m[1]) * toCents(Number(m[2])));
    };
    expect(amount(contingency[0])).toBe(CONTINGENCY_CENTS);

    const exGst = lines.reduce((s, l) => s + amount(l), 0);
    expect(exGst).toBe(EX_GST_CENTS);
    expect(toCents(job.totalExTax)).toBe(exGst);
  });
});
