type PortalReportPublicationFields = {
  status: string;
  inspectionPdfUrl: string | null;
  detailedReport: string | null;
  scopeOfWorksDocument: string | null;
  costEstimationDocument: string | null;
};

type ReportRevisionFields = {
  updatedAt: Date | string;
};

type ApprovalRevisionFields = {
  status: string;
  requestedAt: Date | string;
  respondedAt: Date | string | null;
};

function hasContent(value: string | null): boolean {
  return Boolean(value?.trim());
}

export function isPortalReportPublished(
  report: PortalReportPublicationFields,
): boolean {
  return (
    report.status === "COMPLETED" &&
    [
      report.inspectionPdfUrl,
      report.detailedReport,
      report.scopeOfWorksDocument,
      report.costEstimationDocument,
    ].some(hasContent)
  );
}

export function hasPublishedApprovalDocument(
  report: PortalReportPublicationFields,
  approvalType: "SCOPE_OF_WORK" | "COST_ESTIMATE",
): boolean {
  if (!isPortalReportPublished(report)) return false;

  return approvalType === "SCOPE_OF_WORK"
    ? hasContent(report.scopeOfWorksDocument)
    : hasContent(report.costEstimationDocument);
}

export function isApprovalForCurrentRevision(
  report: ReportRevisionFields,
  approval: ApprovalRevisionFields,
): boolean {
  const revisionTime = new Date(report.updatedAt).getTime();
  const decisionTime = new Date(
    approval.status === "PENDING"
      ? approval.requestedAt
      : (approval.respondedAt ?? ""),
  ).getTime();

  return Number.isFinite(revisionTime) && decisionTime >= revisionTime;
}
