/**
 * RA-7026 — real Ascora line-item + rate-card sources.
 *
 * Live-API discovery (2026-07-09, official API Endpoints guide v1.2) proved
 * every legacy line-item candidate (/invoicelines, /invoices, /jobcostings,
 * /joblines, /lineitems, /items) 404s. The real sources are:
 *   - GET /Accounting/GetInvoicesToSend?priorToDate=… → invoices with
 *     invoiceLines (itemCode, quantity, unitAmountExTax, invoiceLineType)
 *   - GET /Inventory/Supplies → DR's own rate card (unitSellExTax per part)
 * Jobs also carry a workUndertaken narrative the importer previously dropped.
 */

import { describe, expect, it } from "vitest";
import {
  buildHistoricalJobRefreshableFields,
  mapAccountingInvoicesToLineItems,
} from "../route";

describe("mapAccountingInvoicesToLineItems", () => {
  const invoice = {
    id: "inv-1",
    invoiceNumber: "Inv72266",
    invoiceDate: "2023-12-04T14:25:34",
    jobId: "job-1",
    invoiceLines: [
      {
        itemCode: "9508125-1",
        description: "AFA FLOW DBL BOWL SINK",
        quantity: 2,
        unitAmountExTax: 566.36,
        amountExTax: 1132.72,
        invoiceLineType: "material",
      },
      {
        itemCode: "",
        description: "Checked in on Job J266911",
        quantity: 0.25,
        unitAmountExTax: 140.0,
        amountExTax: 35.0,
        invoiceLineType: "labour",
      },
      {
        itemCode: "",
        description: "Discount",
        quantity: 1,
        unitAmountExTax: -50.0,
        amountExTax: -50.0,
        invoiceLineType: "discount",
      },
    ],
  };

  it("maps material lines to line items keyed by itemCode, carrying jobId + invoiceDate", () => {
    const items = mapAccountingInvoicesToLineItems([invoice]);
    const material = items.find((i) => i.partNumber === "9508125-1");
    expect(material).toMatchObject({
      jobId: "job-1",
      partNumber: "9508125-1",
      description: "AFA FLOW DBL BOWL SINK",
      quantity: 2,
      unitPriceExTax: 566.36,
      amountExTax: 1132.72,
      invoiceDate: "2023-12-04T14:25:34",
    });
  });

  it("synthesizes the LABOUR part for labour lines so hourly rates enter the pricing benchmark", () => {
    const items = mapAccountingInvoicesToLineItems([invoice]);
    const labour = items.find((i) => i.partNumber === "LABOUR");
    expect(labour).toMatchObject({
      jobId: "job-1",
      unitPriceExTax: 140.0,
      quantity: 0.25,
    });
  });

  it("skips discount lines and lines with no itemCode that are not labour", () => {
    const items = mapAccountingInvoicesToLineItems([invoice]);
    expect(items).toHaveLength(2);
    const noCode = mapAccountingInvoicesToLineItems([
      {
        ...invoice,
        invoiceLines: [
          {
            itemCode: "",
            description: "mystery",
            quantity: 1,
            unitAmountExTax: 10,
            amountExTax: 10,
            invoiceLineType: "none",
          },
        ],
      },
    ]);
    expect(noCode).toHaveLength(0);
  });

  it("tolerates a non-array response and invoices without lines", () => {
    expect(mapAccountingInvoicesToLineItems(null as never)).toEqual([]);
    expect(
      mapAccountingInvoicesToLineItems([{ ...invoice, invoiceLines: undefined }]),
    ).toEqual([]);
  });
});

describe("buildHistoricalJobRefreshableFields — workUndertaken narrative", () => {
  it("appends workUndertaken to the scope narrative when present", () => {
    const fields = buildHistoricalJobRefreshableFields({
      jobId: "j1",
      jobDescription: "Water ingress through ceiling.",
      workUndertaken: "Extracted standing water, installed 3 air movers.",
    });
    expect(fields.scopeOfWorks).toContain("Water ingress through ceiling.");
    expect(fields.scopeOfWorks).toContain("installed 3 air movers");
  });

  it("uses workUndertaken alone when jobDescription is absent", () => {
    const fields = buildHistoricalJobRefreshableFields({
      jobId: "j1",
      workUndertaken: "Mould remediation of bathroom.",
    });
    expect(fields.scopeOfWorks).toBe(
      "Work undertaken: Mould remediation of bathroom.",
    );
  });

  it("still maps scopeOfWorks from jobDescription alone (unchanged behaviour)", () => {
    const fields = buildHistoricalJobRefreshableFields({
      jobId: "j1",
      jobDescription: "Fire damage assessment.",
    });
    expect(fields.scopeOfWorks).toBe("Fire damage assessment.");
  });
});
