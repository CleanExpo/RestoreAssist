import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CLIENT_PORTAL_MAX_WIDTH,
  clientPortalEyebrow,
  clientPortalHeroShell,
  clientPortalMeshGradient,
  clientPortalPageShell,
  clientPortalTextLink,
} from "@/lib/portal/client-portal-theme";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

type Props = {
  children: ReactNode;
  brandName?: string | null;
  logoUrl?: string | null;
  inspectionNumber?: string;
  inspectionDate?: string;
  footer?: ReactNode;
  className?: string;
};

export function ClientPortalShell({
  children,
  brandName,
  logoUrl,
  inspectionNumber,
  inspectionDate,
  footer,
  className,
}: Props) {
  const displayBrand = brandName?.trim() || "RestoreAssist";
  const isContractorBranded = Boolean(brandName?.trim());

  return (
    <div className={clientPortalPageShell}>
      <div aria-hidden className={clientPortalMeshGradient} />
      <header className="relative border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex min-w-0 items-center justify-between gap-4 px-4 py-4 sm:px-6",
            CLIENT_PORTAL_MAX_WIDTH,
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg border border-white/10 object-cover"
              />
            ) : (
              <Image
                src="/logo.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain opacity-90"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-white">
                {displayBrand}
              </p>
              <p className={clientPortalEyebrow}>
                {isContractorBranded ? "Client claim portal" : "Client portal"}
              </p>
            </div>
          </div>
          {(inspectionNumber || inspectionDate) && (
            <div className="shrink-0 text-right">
              {inspectionNumber && (
                <p className="text-sm font-semibold text-white/95">
                  {inspectionNumber}
                </p>
              )}
              {inspectionDate && (
                <p className="text-xs text-slate-400">{inspectionDate}</p>
              )}
            </div>
          )}
        </div>
      </header>

      <main
        className={cn(
          "relative mx-auto min-w-0 space-y-5 px-4 py-6 sm:px-6 sm:py-8",
          CLIENT_PORTAL_MAX_WIDTH,
          className,
        )}
      >
        {children}
      </main>

      <footer
        className={cn(
          "relative mx-auto border-t border-white/10 px-4 py-8 text-center sm:px-6",
          CLIENT_PORTAL_MAX_WIDTH,
        )}
      >
        {footer ?? (
          <>
            <p className="text-xs text-slate-500">
              Powered by{" "}
              <span className="font-semibold text-cyan-400/90">RestoreAssist</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              For job questions, contact your restoration team.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              <Link href={PORTAL_PATHS.help} className={clientPortalTextLink}>
                Help
              </Link>
              <span className="px-2 text-slate-600">·</span>
              <Link href={PORTAL_PATHS.login} className={clientPortalTextLink}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </footer>
    </div>
  );
}

export function ClientPortalPropertyCard({
  address,
  technicianName,
}: {
  address: string;
  technicianName?: string | null;
}) {
  return (
    <div className={clientPortalHeroShell}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06)_0%,transparent_42%,rgba(34,211,238,0.05)_100%)]" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-500/10">
          <svg
            className="h-4 w-4 text-cyan-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-white/95">{address}</p>
          {technicianName && (
            <p className="mt-1 text-xs text-slate-400">
              Your technician: {technicianName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
