import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export function PortalAccessExplainer({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section
      data-testid="portal-access-explainer"
      className={`${clientPortalPanelPadding} text-left`}
    >
      <h2 className="text-base font-semibold text-white/95">
        Two ways to open a job
      </h2>
      <div className={`mt-3 grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Job link</h3>
          <p className="mt-1 text-sm text-slate-400">
            A long /portal/ address emailed by the contractor. Opens that job
            without a password. The link expires. If it has expired, request a
            new invite or ask the contractor for a fresh link.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Portal account
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Email and password created from an invitation. Opens every report
            for that property after sign-in. Unused invitations expire.
            Recovery is a new invitation, not a contractor login.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-400">
        <Link
          href={PORTAL_PATHS.recovery}
          className="font-medium text-cyan-400/90 hover:underline"
        >
          Request a new invite
        </Link>
        <span className="px-2 text-slate-600">·</span>
        <Link
          href={`${PORTAL_PATHS.help}/access-and-recovery`}
          className="font-medium text-cyan-400/90 hover:underline"
        >
          How access works
        </Link>
      </p>
    </section>
  );
}
