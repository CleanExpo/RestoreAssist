/**
 * RA-6799 — pure mapping from a report's persisted data to the report-builder
 * workflow stage. Extracted from ReportWorkflow so the state transition is
 * unit-testable (regression coverage for the production create-loop).
 *
 * The production bug: a freshly-created report (from POST /api/reports/initial-entry)
 * has no depth/tier data yet, so the old logic fell through to "initial-entry" and
 * bounced the user back to the entry form — which re-created another report on the
 * next submit, looping forever and never reaching PDF/export.
 *
 * Rule: once a report EXISTS (`hasReportId`), it is an in-progress report and must
 * NOT resolve back to "initial-entry"; it advances to the next valid stage.
 */
export type WorkflowStage =
  | "initial-entry"
  | "tier1"
  | "tier2"
  | "tier3"
  | "report-generation";

export type ReportType = "basic" | "enhanced" | "optimised" | null;

export interface ResolvedWorkflowStage {
  stage: WorkflowStage;
  reportType: ReportType;
  showTier3: boolean;
}

export function resolveWorkflowStage(
  reportData: Record<string, unknown> | null | undefined,
  hasReportId = false,
): ResolvedWorkflowStage {
  const depthLevel =
    typeof reportData?.reportDepthLevel === "string"
      ? (reportData.reportDepthLevel as string).toLowerCase()
      : undefined;
  const isBasic = depthLevel === "basic";
  const isEnhanced = depthLevel === "enhanced";
  const isOptimised = depthLevel === "optimised" || depthLevel === "optimized";

  let reportType: ReportType = null;
  if (isOptimised) reportType = "optimised";
  else if (isEnhanced) reportType = "enhanced";
  else if (isBasic) reportType = "basic";

  let showTier3 = isOptimised && !reportData?.tier3Responses;
  let stage: WorkflowStage;

  if (reportData?.detailedReport) {
    stage = "report-generation";
  } else if (reportData?.tier3Responses) {
    stage = "report-generation";
    showTier3 = false;
  } else if (reportData?.tier2Responses) {
    stage = "report-generation";
  } else if (reportData?.tier1Responses) {
    if (isOptimised) stage = "tier2";
    else stage = "report-generation"; // enhanced or basic
  } else if (reportData?.technicianReportAnalysis || reportData?.reportDepthLevel) {
    stage = isBasic ? "report-generation" : "tier1";
  } else {
    // Report exists but has no depth/tier data yet. Never reset an existing
    // report back to "initial-entry" (that caused the production create-loop) —
    // keep it in the report flow at report-generation so the user can proceed
    // to PDF/export. Only a brand-new (non-existent) report uses "initial-entry".
    stage = hasReportId ? "report-generation" : "initial-entry";
  }

  return { stage, reportType, showTier3 };
}
