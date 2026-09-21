import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export function PortalLinkExpired() {
  return (
    <main
      data-testid="portal-link-expired"
      className="min-h-screen bg-brand-cloud flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-slate/20 p-8 text-center">
          <h1 className="text-xl font-semibold text-brand-navy mb-2">
            This job link has expired
          </h1>
          <p className="text-brand-slate text-sm mb-6">
            Job links expire for safety. They are not a contractor login. If a
            portal account was already created, sign in. Otherwise request a
            new invite or ask the restoration contractor for a fresh job link.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={PORTAL_PATHS.recovery}
              className="inline-block min-h-11 px-6 py-3 bg-brand-cta text-white rounded-lg hover:bg-brand-cta/90"
            >
              Request a new invite
            </Link>
            <Link
              href={PORTAL_PATHS.login}
              className="inline-block min-h-11 px-6 py-3 text-brand-cta hover:underline"
            >
              Sign in with a portal account
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
