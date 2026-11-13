import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

export function PortalEmptyProject() {
  return (
    <div data-testid="portal-empty-project" className="space-y-6">
      <div className={`${clientPortalPanelPadding} text-center`}>
        <h2 className="mb-2 text-xl font-semibold text-white">No reports yet</h2>
        <p className="mx-auto max-w-lg text-slate-400">
          Reports appear here after your restoration contractor publishes them.
          A job link from email still opens that claim without an account, and
          you can request a new invite if a link expired.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={PORTAL_PATHS.recovery} className={clientPortalPrimaryLink}>
            Request a new invite
          </Link>
          <Link
            href={PORTAL_PATHS.help}
            className="inline-flex min-h-11 items-center justify-center px-6 py-3 text-sm text-cyan-400/90 hover:underline"
          >
            Client help
          </Link>
        </div>
      </div>
      <PortalAccessExplainer />
    </div>
  );
}
