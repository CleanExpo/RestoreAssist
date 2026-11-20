import type { PortalAccessResolution } from "@/lib/portal/resolve-portal-inspection";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";
import { PortalNotReady } from "@/components/portal/PortalNotReady";

type FallbackResolution = Exclude<
  PortalAccessResolution,
  { kind: "inspection" }
>;

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
