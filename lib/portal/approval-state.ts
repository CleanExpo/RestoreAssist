// RA-8455: one owner for "what can the homeowner do with this approval type".
//
// The restorer's request (POST /api/reports/[id]/approvals) always creates a
// new PENDING ReportApproval row, and the portal approvals route answers that
// row on its update branch. So an open request wins over any older answered
// row: the homeowner must always get a control while a request is open.

export type PortalApprovalType = "SCOPE_OF_WORK" | "COST_ESTIMATE";

export type PortalApprovalRow = {
  id: string;
  approvalType: string;
  status: string;
  clientComments: string | null;
};

export type PortalApprovalState<T extends PortalApprovalRow> =
  /** The restorer asked and the homeowner has not answered yet. */
  | { kind: "requested"; approval: T }
  /** The latest decision on file, with no open request. */
  | { kind: "answered"; approval: T }
  /** Nothing on file. The homeowner may still record a decision unprompted. */
  | { kind: "none" };

/**
 * `approvals` must be ordered newest first, as the portal report API returns
 * them (`orderBy: { createdAt: "desc" }`).
 */
export function portalApprovalState<T extends PortalApprovalRow>(
  approvals: readonly T[],
  approvalType: PortalApprovalType,
): PortalApprovalState<T> {
  const ofType = approvals.filter((a) => a.approvalType === approvalType);
  const requested = ofType.find((a) => a.status === "PENDING");
  if (requested) return { kind: "requested", approval: requested };
  const answered = ofType[0];
  if (answered) return { kind: "answered", approval: answered };
  return { kind: "none" };
}
