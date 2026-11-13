import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

export function PortalNotReady() {
  return (
    <div data-testid="portal-not-ready">
      <ClientPortalShell>
        <div className="mx-auto max-w-md space-y-4 py-8">
          <div className={`${clientPortalPanelPadding} text-center`}>
            <h1 className="mb-2 text-xl font-semibold text-white">
              Your report is not ready yet
            </h1>
            <p className="mb-6 text-sm text-slate-400">
              This job link is still valid. Your restoration team has not
              published an inspection or report for this account yet. Check back
              later, or sign in if a portal account was already created.
            </p>
            <div className="flex flex-col gap-3">
              <Link href={PORTAL_PATHS.login} className={clientPortalPrimaryLink}>
                Sign in with a portal account
              </Link>
              <Link
                href={PORTAL_PATHS.recovery}
                className="inline-block min-h-11 px-6 py-3 text-sm text-cyan-400/90 hover:underline"
              >
                Request a new invite
              </Link>
              <Link
                href={`${PORTAL_PATHS.help}/access-and-recovery`}
                className="inline-block text-sm text-slate-500 hover:text-slate-300"
              >
                How job links and accounts work
              </Link>
            </div>
          </div>
          <PortalAccessExplainer compact />
        </div>
      </ClientPortalShell>
    </div>
  );
}
