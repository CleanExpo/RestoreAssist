"use client";

import { ClientPortalLiveHub } from "@/components/portal/ClientPortalLiveHub";

/** @deprecated Prefer ClientPortalLiveHub — kept for tests and gradual migration. */
export function ClientPortalStatus({
  token,
  reportPdfHref,
  interactive = true,
}: {
  token: string;
  reportPdfHref?: string;
  interactive?: boolean;
}) {
  return (
    <ClientPortalLiveHub
      token={token}
      reportPdfHref={reportPdfHref}
      interactive={interactive}
    />
  );
}
