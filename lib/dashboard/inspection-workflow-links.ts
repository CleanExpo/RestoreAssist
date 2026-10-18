export type InspectionWorkflowLink = {
  label: string;
  href: string;
  /** Primary next step for this job state */
  emphasis?: boolean;
  /** Marks the current job hub (non-navigating label uses inspection detail) */
  current?: boolean;
};

/**
 * Cross-links for inspection detail — keeps the job connected to overview,
 * field tools, report, client, and billing without re-entering data.
 */
export function buildInspectionWorkflowLinks(input: {
  inspectionId: string;
  status: string;
  reportId?: string | null;
  clientId?: string | null;
}): InspectionWorkflowLink[] {
  const { inspectionId, status, reportId, clientId } = input;
  const earlyCapture =
    status === "DRAFT" ||
    status === "SUBMITTED" ||
    status === "PROCESSING" ||
    status === "CLASSIFIED";

  const links: InspectionWorkflowLink[] = [
    { label: "Overview", href: "/dashboard" },
    { label: "All jobs", href: "/dashboard/inspections" },
    { label: "This job", href: `/dashboard/inspections/${inspectionId}`, current: true },
    {
      label: "Guided capture",
      href: `/dashboard/inspections/${inspectionId}/capture`,
      emphasis: earlyCapture,
    },
    { label: "Field mode", href: "/dashboard/field" },
    {
      label: "Floor plan",
      href: `/dashboard/inspections/${inspectionId}?tab=sketch`,
      emphasis: earlyCapture,
    },
  ];

  if (reportId) {
    links.push({
      label: "Linked report",
      href: `/dashboard/reports/${reportId}`,
      emphasis: status === "SCOPED" || status === "ESTIMATED",
    });
  } else {
    links.push({ label: "Reports", href: "/dashboard/reports" });
  }

  if (clientId) {
    links.push({ label: "Client", href: `/dashboard/clients/${clientId}` });
  }

  const canBill =
    status === "ESTIMATED" ||
    status === "IN_BILLING" ||
    status === "COMPLETED" ||
    status === "CLOSED";
  if (canBill) {
    links.push({
      label: "Invoice",
      href: `/dashboard/inspections/${inspectionId}/invoice`,
      emphasis: status === "IN_BILLING" || status === "ESTIMATED",
    });
  }

  return links;
}
