import { describe, expect, it } from "vitest";
import {
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
