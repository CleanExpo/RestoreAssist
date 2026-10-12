import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  LINE_TABLE_BOTTOM,
  LINE_TABLE_COLUMN_GAP,
  LINE_TABLE_COL_QTY,
  generateInvoicePDF,
  lineTableDescriptionWidth,
} from "../pdf-generator";
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

  it("wraps a description before it reaches the QTY column on A4", async () => {
    // A4 width and the generator's margin; the description starts at margin + 10.
    const pageWidth = 595.28;
    const margin = 50;
    const descriptionX = margin + 10;
    const qtyX = pageWidth - margin - LINE_TABLE_COL_QTY;
    const descWidth = lineTableDescriptionWidth(pageWidth, margin);

    expect(descriptionX + descWidth + LINE_TABLE_COLUMN_GAP).toBeLessThanOrEqual(qtyX);

    // Codex review P1: this one-line description used to end at x=254.6,
    // under the quantity at x=245.3. It must now be too wide to stay on one line.
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const description = "Emergency callout and initial moisture inspection";
    expect(helvetica.widthOfTextAtSize(description, 9)).toBeGreaterThan(descWidth);
  });

  it("prints every wrapped line of a long description", async () => {
    // Codex review P1: this wraps to three lines at the A4 description width,
    // and only the first two used to be printed.
    const description =
      "Remove water damaged plasterboard from bathroom ceiling and dispose of contaminated material";
    const pdf = await generateInvoicePDF({
      invoice: {
        id: "inv_7896_long",
        invoiceNumber: "INV-7896-L",
        status: "SENT",
        invoiceDate: new Date("2026-10-03T00:00:00Z"),
        dueDate: new Date("2026-10-17T00:00:00Z"),
        customerName: "Mock Customer",
        customerEmail: "mock@example.com",
        ...MIXED_GST_TOTALS,
        amountPaid: 0,
        amountDue: MIXED_GST_TOTALS.totalIncGST,
      },
      lineItems: [{ ...MIXED_GST_LINES[0], description }, ...MIXED_GST_LINES.slice(1)],
    });
    const text = (await pdfText(pdf)).replace(/\s+/g, " ");

    expect(text).toContain("contaminated material");
    expect(text).toMatch(/Dehumidifier hire\s+3\s+\$19\.99/);
  });

  it("continues a long line table onto another page and keeps every line", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      ...MIXED_GST_LINES[1],
      id: `line_${i + 1}`,
      description: `Drying equipment day ${i + 1}`,
      sortOrder: i,
    }));
    const pdf = await generateInvoicePDF({
      invoice: {
        id: "inv_7896_pages",
        invoiceNumber: "INV-7896-P",
        status: "SENT",
        invoiceDate: new Date("2026-10-03T00:00:00Z"),
        dueDate: new Date("2026-10-17T00:00:00Z"),
        customerName: "Mock Customer",
        customerEmail: "mock@example.com",
        ...MIXED_GST_TOTALS,
        amountPaid: 0,
        amountDue: MIXED_GST_TOTALS.totalIncGST,
      },
      lineItems: lines,
    });

    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
    const text = (await pdfText(pdf)).replace(/\s+/g, " ");
    expect(text).toContain("Drying equipment day 1 ");
    expect(text).toContain("Drying equipment day 40 ");
  });

  it("splits a description taller than a page across pages without dropping text or entering the footer", async () => {
    // Codex review P1-PDF-OVERSIZED-DESCRIPTION-OFF-PAGE: this one row ran to
    // y=1.89 on its continuation page and END_SENTINEL was lost.
    const description = `START_SENTINEL ${"long description ".repeat(180)}END_SENTINEL`;
    const pdf = await generateInvoicePDF({
      invoice: {
        id: "inv_7896_huge",
        invoiceNumber: "INV-7896-H",
        status: "SENT",
        invoiceDate: new Date("2026-10-03T00:00:00Z"),
        dueDate: new Date("2026-10-17T00:00:00Z"),
        customerName: "Mock Customer",
        customerEmail: "mock@example.com",
        ...MIXED_GST_TOTALS,
        amountPaid: 0,
        amountDue: MIXED_GST_TOTALS.totalIncGST,
      },
      lineItems: [{ ...MIXED_GST_LINES[0], description }, ...MIXED_GST_LINES.slice(1)],
    });

    const pages = await textItemsByPage(pdf);
    const all = pages.flat();
    const joined = all.map((t) => t.str).join(" ");
    expect(joined).toContain("START_SENTINEL");
    expect(joined).toContain("END_SENTINEL");
    // Every word of the description is printed: 180 repeats, none dropped.
    // (Counted per word: a page break can fall between "long" and "description".)
    expect(joined.match(/\blong\b/g)?.length).toBe(180);
    expect(joined.match(/\bdescription\b/g)?.length).toBe(180);

    // The row's amounts print once, on its first chunk.
    expect(all.filter((t) => t.str === "$17.08")).toHaveLength(1);
    // Each page carrying table rows repeats the column headings.
    const tablePages = pages.filter((p) => p.some((t) => /long description|START_|END_/.test(t.str)));
    expect(tablePages.length).toBeGreaterThan(1);
    for (const p of tablePages) expect(p.map((t) => t.str)).toContain("INC GST");

    // Nothing but the footer prints below the line table's bottom.
    const isFooter = (s: string) =>
      s === "Thank you for your business!" || /^Page \d+ of \d+$/.test(s);
    const intoFooter = all.filter(
      (t) => t.str.trim() !== "" && t.y < LINE_TABLE_BOTTOM && !isFooter(t.str),
    );
    expect(intoFooter).toEqual([]);
  });
});

describe("RA-7896 invoice PDF — footer and page numbers on every page", () => {
  const invoice = {
    id: "inv_7896_footer",
    invoiceNumber: "INV-7896-F",
    status: "SENT",
    invoiceDate: new Date("2026-10-03T00:00:00Z"),
    dueDate: new Date("2026-10-17T00:00:00Z"),
    customerName: "Mock Customer",
    customerEmail: "mock@example.com",
    ...MIXED_GST_TOTALS,
    amountPaid: 0,
    amountDue: MIXED_GST_TOTALS.totalIncGST,
  };

  /** Asserts each page carries the footer and its own "Page i of N". */
  async function expectFooterOnEveryPage(pdf: Uint8Array, expectedPages?: number) {
    const pages = await textItemsByPage(pdf);
    if (expectedPages !== undefined) expect(pages).toHaveLength(expectedPages);
    const n = pages.length;
    pages.forEach((items, i) => {
      const strs = items.map((t) => t.str);
      expect(strs, `page ${i + 1}`).toContain("Thank you for your business!");
      expect(strs.filter((s) => /^Page \d+ of \d+$/.test(s)), `page ${i + 1}`).toEqual([
        `Page ${i + 1} of ${n}`,
      ]);
    });
    return n;
  }

  it("numbers every page of a 40-line invoice and footers each one", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      ...MIXED_GST_LINES[1],
      id: `line_${i + 1}`,
      description: `Drying equipment day ${i + 1}`,
    }));
    const pdf = await generateInvoicePDF({ invoice, lineItems: lines });
    expect(await expectFooterOnEveryPage(pdf)).toBeGreaterThan(1);
  });

  it("numbers every page when one line is taller than a page", async () => {
    const description = `START_SENTINEL ${"long description ".repeat(180)}END_SENTINEL`;
    const pdf = await generateInvoicePDF({
      invoice,
      lineItems: [{ ...MIXED_GST_LINES[0], description }, ...MIXED_GST_LINES.slice(1)],
    });
    expect(await expectFooterOnEveryPage(pdf)).toBeGreaterThan(2);
  });

  it("still shows Page 1 of 1 on a one-page invoice", async () => {
    // One line: at this head a three-line invoice already moves its totals
    // to a second page (TOTALS_MIN_SPACE), so it is not a one-page invoice.
    const pdf = await generateInvoicePDF({ invoice, lineItems: [MIXED_GST_LINES[0]] });
    await expectFooterOnEveryPage(pdf, 1);
  });
});

describe("RA-7896 invoice PDF — totals, payments and terms stay above the footer", () => {
  const invoice = {
    id: "inv_7896_totals",
    invoiceNumber: "INV-7896-T",
    status: "SENT",
    invoiceDate: new Date("2026-10-03T00:00:00Z"),
    dueDate: new Date("2026-10-17T00:00:00Z"),
    customerName: "Mock Customer",
    customerEmail: "mock@example.com",
    ...MIXED_GST_TOTALS,
    amountPaid: 0,
    amountDue: MIXED_GST_TOTALS.totalIncGST,
  };
  // The footer divider is at y=60; nothing else may print at or below this.
  const FOOTER_ZONE_TOP = 62;
  const isFooter = (s: string) =>
    s === "Thank you for your business!" || /^Page \d+ of \d+$/.test(s);
  const pageOf = (pages: Array<Array<{ str: string }>>, str: string) =>
    pages.findIndex((p) => p.some((t) => t.str === str));
  const intoFooter = (pages: Array<Array<{ str: string; y: number }>>) =>
    pages.flatMap((p, i) =>
      p
        .filter((t) => t.str.trim() !== "" && !isFooter(t.str) && t.y < FOOTER_ZONE_TOP)
        .map((t) => `p${i + 1} ${t.str}@${t.y.toFixed(1)}`),
    );

  it("keeps a three-line invoice on one page, totals included", async () => {
    const pages = await textItemsByPage(
      await generateInvoicePDF({ invoice, lineItems: MIXED_GST_LINES }),
    );
    expect(pages).toHaveLength(1);
    expect(pageOf(pages, "TOTAL (Inc GST):")).toBe(0);
    expect(pageOf(pages, "Amount Due:")).toBe(0);
  });

  it("moves totals and payments to a new page only when they would reach the footer", async () => {
    const payments = [1, 2, 3].map((n) => ({
      paymentDate: new Date(`2026-10-0${n}T00:00:00Z`),
      amount: 1000,
      paymentMethod: "Bank transfer",
      reference: `REF-${n}`,
    }));
    let movedToNewPage = 0;
    // Sweep table lengths so the table ends at every height on page 1 and 2.
    for (let n = 1; n <= 45; n++) {
      const lines = Array.from({ length: n }, (_, i) => ({
        ...MIXED_GST_LINES[1],
        id: `line_${i + 1}`,
        description: `Drying equipment day ${i + 1}`,
      }));
      const pages = await textItemsByPage(
        await generateInvoicePDF({
          invoice: { ...invoice, amountPaid: 3000, amountDue: invoice.totalIncGST - 3000 },
          lineItems: lines,
          payments,
        }),
      );
      expect(intoFooter(pages), `${n} lines`).toEqual([]);
      const totalsPage = pageOf(pages, "TOTAL (Inc GST):");
      expect(pageOf(pages, "REF-3"), `${n} lines`).toBe(totalsPage);
      const lastRowPage = pageOf(pages, `Drying equipment day ${n}`);
      if (totalsPage > lastRowPage) movedToNewPage++;
    }
    // Some table lengths genuinely leave no room, and those move.
    expect(movedToNewPage).toBeGreaterThan(0);
  });

  it("continues long terms onto a new page instead of cutting them", async () => {
    // Notes are internal (Prisma `// Internal notes`, dashboard
    // "Internal notes (not visible to customer)") and are NOT rendered
    // on the customer-facing PDF; only `terms` and `footer` are
    // customer-facing. The generator's input contract therefore no
    // longer has a `notes` field. This test pins the terms-only
    // continuation path; coverage for the (now-removed) notes
    // continuation moved to the regression test below.
    const terms = `TERMS_START ${"payment term ".repeat(120)}TERMS_END`;
    const pages = await textItemsByPage(
      await generateInvoicePDF({ invoice: { ...invoice, terms }, lineItems: MIXED_GST_LINES }),
    );
    const joined = pages.flat().map((t) => t.str).join(" ");
    for (const s of ["TERMS_START", "TERMS_END"]) {
      expect(joined).toContain(s);
    }
    expect(joined.match(/\bterm\b/g)?.length).toBe(120);
    expect(intoFooter(pages)).toEqual([]);
  });

  it("does not render an internal notes marker in PDF output (regression for staff-only notes)", async () => {
    // The InvoiceData type refuses a `notes` field, but a caller (legacy
    // or untyped) can still bypass the contract via a `as unknown as ...`
    // cast. The PDF generator is the last line of defence: it must never
    // draw the marker even if one is supplied. We thread the marker
    // through via a narrow cast on the invoice object only — the
    // production contract on `pdf-generator.ts` stays `notes`-less.
    const INTERNAL_NOTES_MARKER =
      "INTERNAL_NOTES_LEAK_MARKER_RA_PAID_TR2_pdf_xyz9";
    const invoiceWithNotes = {
      ...invoice,
      notes: INTERNAL_NOTES_MARKER,
    } as unknown as Parameters<typeof generateInvoicePDF>[0]["invoice"];
    const pdf = await generateInvoicePDF({
      invoice: invoiceWithNotes,
      lineItems: MIXED_GST_LINES,
    });
    const text = (await pdfText(pdf)).replace(/\s+/g, " ");
    expect(text).not.toContain(INTERNAL_NOTES_MARKER);

    // Defence-in-depth: the rendered PDF should not contain the "NOTES"
    // heading the old notes-rendering path would have produced.
    expect(text).not.toMatch(/\bNOTES\b/);
  });
});

async function textItemsByPage(
  bytes: Uint8Array,
): Promise<Array<Array<{ str: string; y: number }>>> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content.items.map((item: any) => ({ str: item.str as string, y: item.transform[5] as number })),
      );
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
