export type ClientPortalApprovalDto = {
  id: string;
  approvalType: string;
  status: string;
  requestedAt: Date | string;
  respondedAt: Date | string | null;
  clientComments: string | null;
};

export type ClientPortalReportListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  propertyAddress: string;
  hazardType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  completionDate: Date | string | null;
  pendingApprovals: number;
  approvedCount: number;
  rejectedCount: number;
};

export function toClientPortalReportListItem(
  report: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    propertyAddress: string;
    hazardType: string;
    createdAt: Date;
    updatedAt: Date;
    completionDate: Date | null;
    approvals: { status: string }[];
  },
): ClientPortalReportListItem {
  const pendingApprovals = report.approvals.filter(
    (a) => a.status === "PENDING",
  ).length;
  const approvedCount = report.approvals.filter(
    (a) => a.status === "APPROVED",
  ).length;
  const rejectedCount = report.approvals.filter(
    (a) => a.status === "REJECTED",
  ).length;

  return {
    id: report.id,
    title: report.title,
    description: report.description,
    status: report.status,
    propertyAddress: report.propertyAddress,
    hazardType: report.hazardType,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    completionDate: report.completionDate,
    pendingApprovals,
    approvedCount,
    rejectedCount,
  };
}

export function toClientPortalReportDetail(report: {
  id: string;
  title: string;
  status: string;
  propertyAddress: string;
  hazardType: string;
  createdAt: Date;
  updatedAt: Date;
  completionDate: Date | null;
  client: { name: string; email: string; phone: string | null };
  user: {
    name: string | null;
    businessName: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
  };
  approvals: Array<{
    id: string;
    approvalType: string;
    status: string;
    requestedAt: Date;
    respondedAt: Date | null;
    clientComments: string | null;
  }>;
}) {
  return {
    id: report.id,
    title: report.title,
    description: null,
    status: report.status,
    propertyAddress: report.propertyAddress,
    hazardType: report.hazardType,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    completionDate: report.completionDate,
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    client: report.client,
    user: report.user,
    approvals: report.approvals.map((a) => ({
      id: a.id,
      approvalType: a.approvalType,
      status: a.status,
      requestedAt: a.requestedAt,
      respondedAt: a.respondedAt,
      clientComments: a.clientComments,
    })),
  };
}
