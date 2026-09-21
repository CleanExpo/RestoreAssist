import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export type InviteFailureStatus =
  | "EXPIRED"
  | "REVOKED"
  | "ACCEPTED"
  | "INVALID";

const COPY: Record<
  InviteFailureStatus,
  { title: string; body: string; primaryHref: string; primaryLabel: string }
> = {
  EXPIRED: {
    title: "Invitation expired",
    body: "This invitation is no longer valid. Request a new invite with the same email, or ask the restoration contractor to resend one.",
    primaryHref: PORTAL_PATHS.recovery,
    primaryLabel: "Request a new invite",
  },
  REVOKED: {
    title: "Invitation withdrawn",
    body: "This invitation was withdrawn. Ask the restoration contractor to send a new one if access is still needed.",
    primaryHref: PORTAL_PATHS.help,
    primaryLabel: "Client help",
  },
  ACCEPTED: {
    title: "Invitation already used",
    body: "This invitation was already accepted. Sign in with the portal account that was created from it.",
    primaryHref: PORTAL_PATHS.login,
    primaryLabel: "Sign in to the client portal",
  },
  INVALID: {
    title: "Invitation not valid",
    body: "This invitation link is not valid. Request a new invite, or sign in if a portal account already exists.",
    primaryHref: PORTAL_PATHS.recovery,
    primaryLabel: "Request a new invite",
  },
};

export function PortalRecoveryCard({
  status,
  message,
}: {
  status: InviteFailureStatus;
  message?: string;
}) {
  const copy = COPY[status];

  return (
    <div
      data-testid="portal-invite-recovery"
      data-invite-status={status}
      className="max-w-md w-full space-y-4"
    >
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-brand-navy mb-3">{copy.title}</h1>
        <p className="text-brand-slate mb-6">{message || copy.body}</p>
        <div className="flex flex-col gap-3">
          <Link
            href={copy.primaryHref}
            className="inline-block min-h-11 px-6 py-3 bg-brand-cta text-white rounded-lg hover:bg-brand-cta/90 transition-colors"
          >
            {copy.primaryLabel}
          </Link>
          {status !== "ACCEPTED" && (
            <Link
              href={PORTAL_PATHS.login}
              className="inline-block min-h-11 px-6 py-3 text-brand-cta hover:underline"
            >
              Already have a portal account? Sign in
            </Link>
          )}
          <Link
            href={PORTAL_PATHS.help}
            className="inline-block text-sm text-brand-slate hover:text-brand-navy"
          >
            Client help
          </Link>
        </div>
      </div>
      <PortalAccessExplainer compact />
    </div>
  );
}

export function parseInviteFailureStatus(value: unknown): InviteFailureStatus {
  if (value === "EXPIRED" || value === "REVOKED" || value === "ACCEPTED") {
    return value;
  }
  return "INVALID";
}
