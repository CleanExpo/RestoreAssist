import Link from "next/link";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

export function ClientPortalReportReady({ token }: { token: string }) {
  const pdfHref = `/api/portal/${encodeURIComponent(token)}/pdf`;

  return (
    <section
      className={`${clientPortalPanelPadding} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
      aria-labelledby="portal-report-ready-heading"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h2
            id="portal-report-ready-heading"
            className="text-sm font-semibold text-emerald-100"
          >
            Your restoration report is ready
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Open the signed report as a PDF or save a copy for your records.
          </p>
        </div>
      </div>
      <Link
        href={pdfHref}
        target="_blank"
        rel="noopener noreferrer"
        className={clientPortalPrimaryLink}
      >
        View report (PDF)
      </Link>
    </section>
  );
}
