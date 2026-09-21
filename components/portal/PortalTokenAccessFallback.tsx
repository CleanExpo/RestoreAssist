import type { PortalAccessResolution } from "@/lib/portal/resolve-portal-inspection";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";
import { PortalNotReady } from "@/components/portal/PortalNotReady";

type FallbackResolution = Exclude<
  PortalAccessResolution,
  { kind: "inspection" }
>;

/**
 * Shared HTML fallback for token pages (job portal + /learn kiosk).
 *
 * RA-7606: a live ClientPortalAccount with no inspection yet is not-ready,
 * not expired. Only a genuinely expired or unrecognised token is LinkExpired.
 * Keep both pages on this helper so they cannot drift the way they did when
 * they both treated `resolvePortalInspectionId()`'s null as expired.
 */
export function PortalTokenAccessFallback({
  resolved,
}: {
  resolved: FallbackResolution;
}) {
  if (resolved.kind === "unready") {
    return <PortalNotReady />;
  }
  return <PortalLinkExpired />;
}
