import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateInvoicePDF } from "../pdf-generator";
import { generateInvoiceSentEmail } from "../email-templates";
import { MIXED_GST_LINES, MIXED_GST_TOTALS } from "./fixtures/mixed-gst-lines";

/**
 * RA-8384 — the invoice PDF and invoice email print the Australian calendar
 * day, whatever zone the server runs in. An invoice made at 08:00 Brisbane on
 * 3 Nov is stored as 2026-11-02T22:00:00Z; on a UTC server it printed "02 Nov".
 *
 * Sabotage: drop `timeZone` from formatDate in lib/formatters.ts — the
 * "created before 10am" cases go red.
 */

// 08:00 Brisbane (UTC+10) on 3 Nov 2026.
const EARLY_MORNING_BRISBANE = new Date("2026-11-02T22:00:00Z");
// A date picked from a calendar arrives as UTC midnight.
const PICKED_DATE = new Date("2026-11-03");

beforeAll(() => {
  process.env.TZ = "UTC";
  // Positive control: the machine zone really is UTC, so the old,
  // zone-less formatting would print the previous day here.
  expect(
    EARLY_MORNING_BRISBANE.toLocaleDateString("en-AU", { day: "2-digit" }),
  ).toBe("02");
});

async function pdfTextFor(invoiceDate: Date): Promise<string> {
  const pdf = await generateInvoicePDF({
    invoice: {
      id: "inv_8384",
      invoiceNumber: "INV-8384",
      status: "SENT",
      invoiceDate,
      dueDate: new Date("2026-11-17T00:00:00Z"),
      customerName: "Mock Customer",
      customerEmail: "mock@example.com",
      ...MIXED_GST_TOTALS,
      amountPaid: 0,
      amountDue: MIXED_GST_TOTALS.totalIncGST,
    },
    lineItems: MIXED_GST_LINES,
    payments: [],
    business: { name: "Mock Restoration Pty Ltd" },
  } as unknown as Parameters<typeof generateInvoicePDF>[0]);
  const parser = new PDFParse({ data: pdf });
  return (await parser.getText()).text;
}

function emailFor(invoiceDate: Date): string {
  return generateInvoiceSentEmail({
    invoiceNumber: "INV-8384",
    invoiceDate,
    dueDate: new Date("2026-11-17T00:00:00Z"),
    totalIncGST: 11000,
    amountDue: 11000,
    customerName: "Acme",
    publicToken: "tok8384",
    businessName: "Biz",
    appUrl: "https://example.com",
  } as Parameters<typeof generateInvoiceSentEmail>[0]);
}

describe("RA-8384 invoice dates follow the Australian calendar day", () => {
  it("PDF: an invoice made at 08:00 Brisbane prints that day, not the day before", async () => {
    const text = await pdfTextFor(EARLY_MORNING_BRISBANE);
    expect(text).toContain("03 Nov 2026");
    expect(text).not.toContain("02 Nov 2026");
  });

  it("PDF: a date picked from a calendar keeps its day", async () => {
    expect(await pdfTextFor(PICKED_DATE)).toContain("03 Nov 2026");
  });

  it("email: an invoice made at 08:00 Brisbane prints that day, not the day before", () => {
    const html = emailFor(EARLY_MORNING_BRISBANE);
    expect(html).toContain("03 November 2026");
    expect(html).not.toContain("02 November 2026");
  });

  it("email: a date picked from a calendar keeps its day", () => {
    expect(emailFor(PICKED_DATE)).toContain("03 November 2026");
  });

  it("neither invoice builder keeps a private, zone-less formatDate", () => {
    for (const file of ["pdf-generator.ts", "email-templates.ts"]) {
      const src = readFileSync(join(__dirname, "..", file), "utf8");
      expect(src, file).not.toMatch(/function\s+formatDate\s*\(/);
      expect(src, file).not.toMatch(/toLocale(Date|Time)?String\(/);
    }
  });
});
