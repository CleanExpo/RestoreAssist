export type JourneyStepState = "done" | "current" | "upcoming";

export type InspectionJourneyStep = {
  id: string;
  label: string;
  description: string;
  href: string;
  state: JourneyStepState;
};

/**
 * Ordered customer journey for a single inspection — used on the overview tab
 * to show what is done and what to do next (client → plan → report → bill → email).
 */
export function buildInspectionJourneySteps(input: {
  inspectionId: string;
  status: string;
  clientId?: string | null;
  reportId?: string | null;
  sketchRoomCount: number;
  photoCount: number;
  moistureCount: number;
  hasClassification: boolean;
  clientEmailSent?: boolean;
  emailServiceConfigured?: boolean;
  completenessGapCount?: number;
  showCompletenessInbox?: boolean;
}): InspectionJourneyStep[] {
  const {
    inspectionId,
    status,
    clientId,
    reportId,
    sketchRoomCount,
    photoCount,
    moistureCount,
    hasClassification,
    clientEmailSent = false,
    emailServiceConfigured = true,
    completenessGapCount = 0,
    showCompletenessInbox = false,
  } = input;

  const hasClient = Boolean(clientId);
  const hasPlan = sketchRoomCount > 0;
  const hasFieldEvidence = photoCount > 0 || moistureCount > 0;
  const reportReady =
    status === "SCOPED" ||
    status === "ESTIMATED" ||
    status === "IN_BILLING" ||
    status === "COMPLETED" ||
    status === "CLOSED";

  const steps: Omit<InspectionJourneyStep, "state">[] = [
    {
      id: "client",
      label: "Client on the job",
      description: hasClient
        ? "Client is linked — portal and report emails can use their details."
        : "Link a client so portal links and report delivery have an email address.",
      href: clientId
        ? `/dashboard/clients/${clientId}`
        : `/dashboard/inspections/${inspectionId}?tab=insurer`,
    },
    {
      id: "floor-plan",
      label: "Floor plan",
      description: hasPlan
        ? `${sketchRoomCount} room${sketchRoomCount === 1 ? "" : "s"} on the plan — measurements feed scope and reports.`
        : "Draw or import a floor plan, add rooms, scale, and moisture pins.",
      href: `/dashboard/inspections/${inspectionId}?tab=sketch`,
    },
    {
      id: "capture",
      label: "Site evidence",
      description: hasFieldEvidence
        ? "Photos and/or moisture readings are on file."
        : "Capture photos, moisture, and classification on site or in Field mode.",
      href: `/dashboard/inspections/${inspectionId}/capture`,
    },
    {
      id: "report",
      label: "Report",
      description: reportId
        ? "Open the linked report to edit, PDF, or email the client (Mailtrap)."
        : "Generate the NIR report from this inspection when evidence is ready.",
      href: reportId
        ? `/dashboard/reports/${reportId}`
        : `/dashboard/inspections/${inspectionId}`,
    },
    {
      id: "invoice",
      label: "Invoice",
      description:
        status === "ESTIMATED" || status === "IN_BILLING"
          ? "Approved estimate ready — generate or send the invoice."
          : "Available after the job is estimated and approved.",
      href: `/dashboard/inspections/${inspectionId}/invoice`,
    },
    {
      id: "email",
      label: "Email the client",
      description: clientEmailSent
        ? "Portal or report email is on record for this job."
        : emailServiceConfigured
          ? "Send the claim portal link or completed report from the report page."
          : "Email provider not configured — set Mailtrap env or Settings → Email, then send.",
      href: reportId
        ? `/dashboard/reports/${reportId}`
        : `/dashboard/settings/email`,
    },
  ];

  const doneFlags = [
    hasClient,
    hasPlan,
    hasFieldEvidence && hasClassification,
    Boolean(reportId) && reportReady,
    status === "IN_BILLING" || status === "COMPLETED" || status === "CLOSED",
    clientEmailSent,
  ];

  let foundCurrent = false;
  const mapped = steps.map((step, index) => {
    if (doneFlags[index]) {
      return { ...step, state: "done" as const };
    }
    if (!foundCurrent) {
      foundCurrent = true;
      return { ...step, state: "current" as const };
    }
    return { ...step, state: "upcoming" as const };
  });

  if (showCompletenessInbox && completenessGapCount > 0) {
    mapped.push({
      id: "completeness",
      label: "Completeness blockers",
      description: `${completenessGapCount} evidence gap${completenessGapCount === 1 ? "" : "s"} — review in the manager inbox.`,
      href: `/dashboard/operations/completeness-inbox`,
      state: "current",
    });
  }

  return mapped;
}
