import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export function PortalEmptyProject() {
  return (
    <div
      data-testid="portal-empty-project"
      className="space-y-6"
    >
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <h2 className="text-xl font-semibold text-brand-navy mb-2">
          No reports yet
        </h2>
        <p className="text-brand-slate max-w-lg mx-auto">
          Reports appear here after the restoration contractor publishes them.
          This is not a dead end — a job link still opens the job, and a new
          invite can be requested if a link has expired.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={PORTAL_PATHS.recovery}
            className="inline-block min-h-11 px-6 py-3 bg-brand-cta text-white rounded-lg hover:bg-brand-cta/90"
          >
            Request a new invite
          </Link>
          <Link
            href={PORTAL_PATHS.help}
            className="inline-block min-h-11 px-6 py-3 text-brand-cta hover:underline"
          >
            Client help
          </Link>
        </div>
      </div>
      <PortalAccessExplainer />
    </div>
  );
}
