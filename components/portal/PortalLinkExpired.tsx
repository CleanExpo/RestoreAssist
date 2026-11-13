import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

export function PortalLinkExpired() {
  return (
    <div data-testid="portal-link-expired">
      <ClientPortalShell>
        <div className="mx-auto max-w-md space-y-4 py-8">
          <div className={`${clientPortalPanelPadding} text-center`}>
            <h1 className="mb-2 text-xl font-semibold text-white">
              This job link has expired
            </h1>
            <p className="mb-6 text-sm text-slate-400">
              Job links expire for safety. They are not a contractor login. If a
              portal account was already created, sign in. Otherwise request a
              new invite or ask your restoration team for a fresh job link.
            </p>
            <div className="flex flex-col gap-3">
              <Link href={PORTAL_PATHS.recovery} className={clientPortalPrimaryLink}>
                Request a new invite
              </Link>
              <Link
                href={PORTAL_PATHS.login}
                className="inline-block min-h-11 px-6 py-3 text-sm text-cyan-400/90 hover:underline"
              >
                Sign in with a portal account
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
