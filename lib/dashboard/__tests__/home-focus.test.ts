import { describe, expect, it } from "vitest";
import {
  buildAttentionBoard,
  buildRecentActivity,
  isActiveInspectionStatus,
  isOpenReportStatus,
  isOutstandingInvoiceStatus,
  resolveHomeFocus,
} from "../home-focus";

describe("resolveHomeFocus", () => {
  it("puts open jobs first — field work beats paperwork", () => {
    const focus = resolveHomeFocus({
      openReports: 3,
      activeInspections: 2,
      outstandingInvoices: 4,
      hasAnyWork: true,
    });
    expect(focus.href).toBe("/dashboard/inspections");
    expect(focus.why).toMatch(/2 inspections/);
  });

  it("then unfinished reports", () => {
    const focus = resolveHomeFocus({
      openReports: 1,
      activeInspections: 0,
      outstandingInvoices: 2,
      hasAnyWork: true,
    });
    expect(focus.href).toBe("/dashboard/reports");
    expect(focus.label).toBe("Finish reports");
  });

  it("then unpaid invoices", () => {
    const focus = resolveHomeFocus({
      openReports: 0,
      activeInspections: 0,
      outstandingInvoices: 1,
      hasAnyWork: true,
    });
    expect(focus.href).toBe("/dashboard/invoices");
  });

  it("empty workspace starts at a new inspection", () => {
    const focus = resolveHomeFocus({
      openReports: 0,
      activeInspections: 0,
      outstandingInvoices: 0,
      hasAnyWork: false,
    });
    expect(focus.href).toBe("/dashboard/inspections/new");
  });
});

describe("status classifiers", () => {
  it("treats Draft and PENDING as open reports", () => {
    expect(isOpenReportStatus("Draft")).toBe(true);
    expect(isOpenReportStatus("COMPLETED")).toBe(false);
  });

  it("treats COMPLETED inspections as closed", () => {
    expect(isActiveInspectionStatus("SCOPED")).toBe(true);
    expect(isActiveInspectionStatus("COMPLETED")).toBe(false);
  });

  it("treats SENT and OVERDUE as outstanding invoices", () => {
    expect(isOutstandingInvoiceStatus("SENT")).toBe(true);
    expect(isOutstandingInvoiceStatus("PAID")).toBe(false);
  });
});

describe("buildRecentActivity", () => {
  it("merges jobs, reports and invoices by recency", () => {
    const rows = buildRecentActivity({
      inspections: [
        {
          id: "j1",
          propertyAddress: "12 River St",
          inspectionNumber: "INS-1",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      reports: [
        {
          id: "r1",
          title: "Water loss",
          clientName: "Acme",
          createdAt: "2026-09-02T10:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "i1",
          invoiceNumber: "INV-9",
          customerName: "Acme",
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      limit: 3,
    });
    expect(rows.map((r) => r.kind)).toEqual(["report", "job", "invoice"]);
    expect(rows[0].href).toBe("/dashboard/reports/r1");
  });

  it("skips invoices without a createdAt", () => {
    const rows = buildRecentActivity({
      inspections: [],
      reports: [],
      invoices: [{ id: "i1", invoiceNumber: "INV-9" }],
    });
    expect(rows).toHaveLength(0);
  });
});

describe("buildAttentionBoard", () => {
  it("lists site work before reports and invoices", () => {
    const rows = buildAttentionBoard({
      inspections: [
        {
          id: "j1",
          propertyAddress: "12 River St",
          inspectionNumber: "INS-1",
          status: "SCOPED",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      reports: [
        {
          id: "r1",
          title: "Water loss",
          clientName: "Acme",
          status: "DRAFT",
          createdAt: "2026-09-02T10:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "i1",
          invoiceNumber: "INV-9",
          customerName: "Acme",
          status: "SENT",
        },
      ],
    });
    expect(rows.map((r) => r.stage)).toEqual(["site", "report", "invoice"]);
  });

  it("drops closed jobs and paid invoices", () => {
    const rows = buildAttentionBoard({
      inspections: [
        {
          id: "j1",
          inspectionNumber: "INS-1",
          status: "COMPLETED",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      reports: [],
      invoices: [{ id: "i1", invoiceNumber: "INV-9", status: "PAID" }],
    });
    expect(rows).toHaveLength(0);
  });
});
