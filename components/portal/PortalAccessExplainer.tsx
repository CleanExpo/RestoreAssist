import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

export function PortalAccessExplainer({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section
      data-testid="portal-access-explainer"
      className="rounded-lg border border-brand-slate/20 bg-white p-5 text-left"
    >
      <h2 className="text-base font-semibold text-brand-navy">
        Two ways to open a job
      </h2>
      <div className={`mt-3 grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">Job link</h3>
          <p className="mt-1 text-sm text-brand-slate">
            A long /portal/ address emailed by the contractor. Opens that job
            without a password. The link expires. If it has expired, request a
            new invite or ask the contractor for a fresh link.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">
            Portal account
          </h3>
          <p className="mt-1 text-sm text-brand-slate">
            Email and password created from an invitation. Opens every report
            for that property after sign-in. Unused invitations expire.
            Recovery is a new invitation, not a contractor login.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-brand-slate">
        <Link
          href={PORTAL_PATHS.recovery}
          className="font-medium text-brand-cta hover:underline"
        >
          Request a new invite
        </Link>
        <span className="px-2 text-brand-slate/50">·</span>
        <Link
          href={`${PORTAL_PATHS.help}/access-and-recovery`}
          className="font-medium text-brand-cta hover:underline"
        >
          How access works
        </Link>
      </p>
    </section>
  );
}
