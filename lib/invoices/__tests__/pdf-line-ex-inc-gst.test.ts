import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateInvoicePDF } from "../pdf-generator";
import { MIXED_GST_LINES, MIXED_GST_TOTALS } from "./fixtures/mixed-gst-lines";

/**
 * RA-7896 — the invoice PDF prints every line ex GST and inc GST (the stored
 * line subtotal and total), with the line's GST between them.
 * Sabotage: print `item.subtotal` in the INC GST column — labour goes red.
 */

async function pdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text;
}

describe("RA-7896 invoice PDF — line prices ex GST and inc GST", () => {
  it("prints QTY, RATE, EX GST, GST, INC GST for each stored line", async () => {
    const pdf = await generateInvoicePDF({
      invoice: {
        id: "inv_7896",
        invoiceNumber: "INV-7896",
        status: "SENT",
        invoiceDate: new Date("2026-10-03T00:00:00Z"),
        dueDate: new Date("2026-10-17T00:00:00Z"),
        customerName: "Mock Customer",
        customerEmail: "mock@example.com",
        ...MIXED_GST_TOTALS,
        amountPaid: 0,
        amountDue: MIXED_GST_TOTALS.totalIncGST,
      },
      lineItems: MIXED_GST_LINES,
    });
    const text = await pdfText(pdf);

    expect(text).toMatch(/QTY\s+RATE\s+EX GST\s+GST\s+INC GST/);
    expect(text).toMatch(/Labour\s+0\.69\s+\$22\.50\s+\$15\.53\s+\$1\.55\s+\$17\.08/);
    expect(text).toMatch(/Dehumidifier hire\s+3\s+\$19\.99\s+\$59\.97\s+\$6\.00\s+\$65\.97/);
    expect(text).toMatch(
      /Council permit \(GST-free\)\s+1\s+\$120\.00\s+\$120\.00\s+\$0\.00\s+\$120\.00/,
    );
  });
});
