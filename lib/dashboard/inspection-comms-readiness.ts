import { REPORT_DELIVERY_EVIDENCE_ACTIONS } from "@/lib/lifecycle/report-delivery";

export type ClientSendChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  href?: string;
};

export type InspectionCommsReadiness = {
  emailServiceConfigured: boolean;
  clientHasEmail: boolean;
  clientEmail: string | null;
  reportId: string | null;
  reportStatus: string | null;
  reportPdfReady: boolean;
  reportDeliveredAt: string | null;
  portalLinkEmailedAt: string | null;
  clientEmailSentAt: string | null;
  completenessBlockerCount: number;
};

export function buildClientSendChecklist(
  input: InspectionCommsReadiness,
): ClientSendChecklistItem[] {
  const reportHref = input.reportId
    ? `/dashboard/reports/${input.reportId}`
    : undefined;
  return [
    {
      id: "client-email",
      label: "Client email on file",
      ok: input.clientHasEmail,
      hint: input.clientHasEmail
        ? `Will send to ${input.clientEmail}`
        : "Add the client's email on the client record or insurer tab.",
      href: reportHref,
    },
    {
      id: "mailtrap",
      label: "Email provider (Mailtrap / platform)",
      ok: input.emailServiceConfigured,
      hint: input.emailServiceConfigured
        ? "MAILTRAP_API_KEY + SENDER_EMAIL (or workspace BYOK) is configured."
        : "Set MAILTRAP_API_KEY and SENDER_EMAIL in env, or configure Settings → Email (owners).",
      href: "/dashboard/settings/email",
    },
    {
      id: "pdf",
      label: "Report ready to send",
      ok: input.reportPdfReady,
      hint: input.reportPdfReady
        ? "Report is completed — PDF export is available."
        : "Complete the report before emailing the client.",
      href: reportHref,
    },
  ];
}

export function isClientEmailJourneyComplete(input: {
  reportDeliveredAt: string | null;
  portalLinkEmailedAt: string | null;
}): boolean {
  return Boolean(input.reportDeliveredAt || input.portalLinkEmailedAt);
}

/** Actions queried for portal link email proof (inspection-scoped). */
export const CLIENT_PORTAL_LINK_EMAILED_ACTION = "CLIENT_PORTAL_LINK_EMAILED";

export const REPORT_DELIVERY_ACTIONS = [
  ...REPORT_DELIVERY_EVIDENCE_ACTIONS,
] as const;
