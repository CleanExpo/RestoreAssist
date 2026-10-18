import { PORTAL_SECTION_IDS } from "@/lib/portal/portal-section-ids";
import type { PortalUpdatesFeed } from "@/lib/portal/portal-updates-types";

export type HomeownerNextAction = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  href: string;
  tone: "urgent" | "ready" | "info";
};

export function buildHomeownerNextActions(input: {
  feed: PortalUpdatesFeed | null;
  interactive: boolean;
  reportPdfHref?: string;
}): HomeownerNextAction[] {
  const { feed, interactive, reportPdfHref } = input;
  if (!feed) return [];

  const actions: HomeownerNextAction[] = [];

  if (interactive && feed.pendingApprovals.length > 0) {
    const labels = feed.pendingApprovals.map((a) => a.label).join(", ");
    actions.push({
      id: "approvals",
      priority: 1,
      title: "Approve required items",
      detail: `Your team needs your sign-off: ${labels}.`,
      href: `#${PORTAL_SECTION_IDS.approvals}`,
      tone: "urgent",
    });
  }

  if (interactive && feed.pendingApprovals.length === 0) {
    actions.push({
      id: "upload",
      priority: 2,
      title: "Share photos or a note",
      detail:
        "Upload damage photos or a short description so your assessor can review them.",
      href: `#${PORTAL_SECTION_IDS.upload}`,
      tone: "info",
    });
  }

  if (feed.reportReady && reportPdfHref) {
    actions.push({
      id: "report",
      priority: feed.pendingApprovals.length > 0 ? 3 : 1,
      title: "Your report is ready",
      detail: "Open the PDF restoration report when you are ready.",
      href: reportPdfHref,
      tone: "ready",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "status",
      priority: 10,
      title: "Track your claim",
      detail: `Current stage: ${feed.currentStep}. We update this page as work progresses.`,
      href: `#${PORTAL_SECTION_IDS.status}`,
      tone: "info",
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
