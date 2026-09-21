import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export function PortalNotReady() {
  return (
    <main
      data-testid="portal-not-ready"
      className="min-h-screen bg-brand-cloud flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-slate/20 p-8 text-center">
          <h1 className="text-xl font-semibold text-brand-navy mb-2">
            Your report is not ready yet
          </h1>
          <p className="text-brand-slate text-sm mb-6">
            This job link is still valid. The restoration contractor has not
            published an inspection or report for this account yet. Check back
            later, or sign in if a portal account was already created.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={PORTAL_PATHS.login}
              className="inline-block min-h-11 px-6 py-3 bg-brand-cta text-white rounded-lg hover:bg-brand-cta/90"
            >
              Sign in with a portal account
            </Link>
            <Link
              href={PORTAL_PATHS.recovery}
              className="inline-block min-h-11 px-6 py-3 text-brand-cta hover:underline"
            >
              Request a new invite
            </Link>
            <Link
              href={`${PORTAL_PATHS.help}/access-and-recovery`}
              className="inline-block text-sm text-brand-slate hover:text-brand-navy"
            >
              How job links and accounts work
            </Link>
          </div>
        </div>
        <PortalAccessExplainer compact />
      </div>
    </main>
  );
}
