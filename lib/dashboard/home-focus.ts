/**
 * Derives the home dashboard's "what next" line from work that already
 * exists. No extra metrics — only counts the operator can act on.
 */

export type HomeFocus = {
  title: string;
  why: string;
  href: string;
  label: string;
};

export function isOpenReportStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "DRAFT" || s === "PENDING" || s === "IN_PROGRESS";
}

export function isActiveInspectionStatus(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  return s !== "COMPLETED" && s !== "REJECTED" && s !== "CANCELLED";
}

export function isOutstandingInvoiceStatus(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").toUpperCase();
  return (
    s === "SENT" ||
    s === "ISSUED" ||
    s === "OVERDUE" ||
    s === "UNPAID" ||
    s === "PARTIAL" ||
    s === "PARTIALLY_PAID"
  );
}

export function resolveHomeFocus(input: {
  openReports: number;
  activeInspections: number;
  outstandingInvoices: number;
  hasAnyWork: boolean;
}): HomeFocus {
  if (input.activeInspections > 0) {
    return {
      title: "Jobs still on site",
      why: `${input.activeInspections} inspection${input.activeInspections === 1 ? "" : "s"} not closed.`,
      href: "/dashboard/inspections",
      label: "Open jobs",
    };
  }
  if (input.openReports > 0) {
    return {
      title: "Reports waiting",
      why: `${input.openReports} report${input.openReports === 1 ? "" : "s"} still in draft or review.`,
      href: "/dashboard/reports",
      label: "Finish reports",
    };
  }
  if (input.outstandingInvoices > 0) {
    return {
      title: "Money outstanding",
      why: `${input.outstandingInvoices} invoice${input.outstandingInvoices === 1 ? "" : "s"} not paid.`,
      href: "/dashboard/invoices",
      label: "Open invoices",
    };
  }
  if (!input.hasAnyWork) {
    return {
      title: "Start the first job",
      why: "Capture the site, then write the report from what you recorded.",
      href: "/dashboard/inspections/new",
      label: "New inspection",
    };
  }
  return {
    title: "Nothing waiting",
    why: "Start the next site visit or write the next report.",
    href: "/dashboard/reports/new",
    label: "New report",
  };
}
