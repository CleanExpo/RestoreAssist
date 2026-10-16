import type { ReactNode } from "react";
import Link from "next/link";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { clientPortalEyebrow } from "@/lib/portal/client-portal-theme";

export function PortalHelpPageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <ClientPortalShell>
      <div className="mx-auto max-w-3xl space-y-8 py-2">
        <header>
          <p className="mb-2 text-sm text-slate-400">
            <Link
              href={PORTAL_PATHS.login}
              className="text-cyan-400/90 hover:underline"
            >
              Client portal sign-in
            </Link>
            <span className="px-2 text-slate-600">·</span>
            <Link
              href={PORTAL_PATHS.recovery}
              className="text-cyan-400/90 hover:underline"
            >
              Recover access
            </Link>
          </p>
          <p className={clientPortalEyebrow}>Help</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            {title}
          </h1>
          {intro ? (
            <p className="mt-2 text-slate-400">{intro}</p>
          ) : null}
        </header>
        {children}
      </div>
    </ClientPortalShell>
  );
}
