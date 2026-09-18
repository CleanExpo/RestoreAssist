"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFetch } from "@/lib/hooks/useFetch";
import toast from "react-hot-toast";
import { TechLicenceBanner } from "@/components/dashboard/TechLicenceBanner";
import { BasicReportWithoutKeyCta } from "@/components/onboarding/BasicReportWithoutKeyCta";
import { InboundJobAlert } from "@/components/dashboard/InboundJobAlert";
import { EvaluatorScoreBadge } from "@/components/SessionMetadataCard";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import type { ReportWithSessionData } from "@/lib/session-types";
import {
  isActiveInspectionStatus,
  isOpenReportStatus,
  isOutstandingInvoiceStatus,
  resolveHomeFocus,
} from "@/lib/dashboard/home-focus";
import { cn } from "@/lib/utils";

type InspectionRow = {
  id: string;
  inspectionNumber?: string | null;
  propertyAddress?: string | null;
  status: string;
  createdAt: string;
};

type InvoiceRow = {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  customerName?: string | null;
  amountDue?: number | null;
  total?: number | null;
};

function timeAgo(date: Date) {
  const diffInMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
  return `${Math.floor(diffInMinutes / 1440)}d ago`;
}

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "APPROVED" || s === "PAID") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (s === "OVERDUE" || s === "REJECTED") {
    return "bg-red-500/15 text-red-800 dark:text-red-300";
  }
  if (s === "PENDING" || s === "SENT" || s === "SUBMITTED" || s === "SCOPED") {
    return "bg-amber-500/15 text-amber-900 dark:text-amber-300";
  }
  return "bg-muted text-muted-foreground";
}

const PRIMARY_ACTIONS = [
  {
    href: "/dashboard/inspections/new",
    title: "New inspection",
    description: "Open a job on site",
  },
  {
    href: "/dashboard/field",
    title: "Field capture",
    description: "Photos, moisture, voice",
  },
  {
    href: "/dashboard/reports/new",
    title: "New report",
    description: "Write from what you captured",
  },
  {
    href: "/dashboard/invoices/new",
    title: "Get a bill out",
    description: "Invoice the work",
  },
] as const;

function ChevronMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M9 6l7 6-7 6" />
    </svg>
  );
}

function JobsMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M4 8h16v12H4z" />
      <path d="M8 8V5h8v3" />
    </svg>
  );
}

function FieldMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M12 4v16" />
      <path d="M5 10l7-6 7 6" />
    </svg>
  );
}

function ReportMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M7 3h8l5 5v13H7z" />
      <path d="M15 3v5h5" />
    </svg>
  );
}

function LineSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
    />
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const isAuthed = status === "authenticated";

  useEffect(() => {
    if (status !== "authenticated") return;
    const isWelcome = searchParams?.get("welcome") === "1";
    if (!isWelcome) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/status", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data && data.isComplete === false) {
          router.replace("/dashboard/onboarding");
        }
      } catch {
        // Welcome toast still fires below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, searchParams, router]);

  const {
    data: reportsRaw,
    loading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useFetch<{ reports: ReportWithSessionData[] }>(
    isAuthed ? "/api/reports?limit=40" : null,
  );

  const {
    data: clientsRaw,
    loading: clientsLoading,
    error: clientsError,
    refetch: refetchClients,
  } = useFetch<{
    clients: Array<{ id: string; name: string; createdAt: string }>;
  }>(isAuthed ? "/api/clients" : null);

  const {
    data: inspectionsRaw,
    loading: inspectionsLoading,
    error: inspectionsError,
    refetch: refetchInspections,
  } = useFetch<{ inspections: InspectionRow[] }>(
    isAuthed ? "/api/inspections?limit=20&sort=recent" : null,
  );

  const {
    data: invoicesRaw,
    loading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useFetch<{ invoices: InvoiceRow[] }>(
    isAuthed ? "/api/invoices?limit=20" : null,
  );

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const key = "ra-dashboard-welcome";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — still de-dupe this tick via toast id.
    }
    toast.success(`Welcome back, ${session.user.name.split(" ")[0]}!`, {
      id: "dashboard-welcome",
    });
  }, [status, session?.user?.name]);

  const model = useMemo(() => {
    const loadFailed = Boolean(
      reportsError || clientsError || inspectionsError || invoicesError,
    );
    const reports = loadFailed ? [] : (reportsRaw?.reports ?? []);
    const clients = loadFailed ? [] : (clientsRaw?.clients ?? []);
    const inspections = loadFailed ? [] : (inspectionsRaw?.inspections ?? []);
    const invoices = loadFailed ? [] : (invoicesRaw?.invoices ?? []);

    const openReports = reports.filter((r) => isOpenReportStatus(r.status));
    const activeInspections = inspections.filter((i) =>
      isActiveInspectionStatus(i.status),
    );
    const outstandingInvoices = invoices.filter((i) =>
      isOutstandingInvoiceStatus(i.status),
    );
    const recentReports = [...reports]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6);

    const hasAnyWork =
      reports.length > 0 || inspections.length > 0 || invoices.length > 0;

    return {
      reports,
      clients,
      inspections,
      invoices,
      openReports,
      activeInspections,
      outstandingInvoices,
      recentReports,
      hasAnyWork,
      focus: resolveHomeFocus({
        openReports: openReports.length,
        activeInspections: activeInspections.length,
        outstandingInvoices: outstandingInvoices.length,
        hasAnyWork,
      }),
      loading:
        reportsLoading ||
        clientsLoading ||
        inspectionsLoading ||
        invoicesLoading,
      loadFailed,
      loadError:
        reportsError || clientsError || inspectionsError || invoicesError,
    };
  }, [
    reportsRaw,
    clientsRaw,
    inspectionsRaw,
    invoicesRaw,
    reportsLoading,
    clientsLoading,
    inspectionsLoading,
    invoicesLoading,
    reportsError,
    clientsError,
    inspectionsError,
    invoicesError,
  ]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-lg border-2 border-brand-bronze/30 border-t-brand-cta" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const retryAll = () => {
    void refetchReports();
    void refetchClients();
    void refetchInspections();
    void refetchInvoices();
  };

  return (
    <div className="min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="space-y-3">
        <InboundJobAlert />
        <TechLicenceBanner />
        {(searchParams.get("welcome") === "1" ||
          searchParams.get("firstRun") === "1") && (
          <BasicReportWithoutKeyCta variant="dark" />
        )}
      </div>

      {model.loadFailed && !model.loading && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-800 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="min-w-0 text-sm">
            Could not load the workspace
            {model.loadError ? ` — ${model.loadError}` : ""}.
          </p>
          <button
            type="button"
            onClick={retryAll}
            className="min-h-11 shrink-0 rounded-[10px] border border-red-500/40 px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <header className="mt-6 mb-6 grid gap-4 border-l-4 border-brand-cta pl-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-sm text-brand-slate dark:text-slate-400">
            Good to see you, {firstName}
          </p>
          <h1 className="mt-1 text-pretty text-2xl font-semibold text-slate-50 sm:text-3xl">
            {model.loading ? "Loading the board…" : model.focus.title}
          </h1>
          <p className="mt-1 max-w-xl text-pretty text-sm text-muted-foreground">
            {model.loading
              ? "Checking jobs, reports and invoices."
              : model.focus.why}
          </p>
        </div>
        <Link
          href={model.focus.href}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-brand-cta px-5 text-sm font-medium text-white hover:bg-brand-cta-hover sm:w-auto"
        >
          {model.focus.label}
        </Link>
      </header>

      <section aria-label="Job through invoice" className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          The book of work
        </p>
        <ol
          className={cn(
            "grid grid-cols-2 overflow-hidden rounded-[10px] border border-brand-bronze/30 bg-gradient-to-br from-brand-navy via-brand-deep to-brand-surface lg:grid-cols-4",
          )}
        >
          <PipelineStep
            href="/dashboard/inspections"
            label="Inspect"
            hint="Jobs still open"
            value={model.activeInspections.length}
            loading={model.loading}
          />
          <PipelineStep
            href="/dashboard/reports"
            label="Report"
            hint="Drafts and reviews"
            value={model.openReports.length}
            loading={model.loading}
            connector
          />
          <PipelineStep
            href="/dashboard/invoices"
            label="Invoice"
            hint="Waiting on payment"
            value={model.outstandingInvoices.length}
            loading={model.loading}
            connector
          />
          <PipelineStep
            href="/dashboard/clients"
            label="Clients"
            hint="People on file"
            value={model.clients.length}
            loading={model.loading}
            connector
          />
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Do next
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRIMARY_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-16 items-center justify-between gap-3 rounded-[10px] border border-brand-bronze/25 bg-gradient-to-br from-brand-surface to-brand-deep px-4 py-3 text-left text-slate-50 hover:border-brand-gold/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-50">
                  {action.title}
                </span>
                <span className="block text-sm text-slate-300">
                  {action.description}
                </span>
              </span>
              <ChevronMark className="h-4 w-4 shrink-0 text-brand-gold" />
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <DashboardPanel className="lg:col-span-3 border-brand-bronze/25 bg-brand-deep bg-gradient-to-br from-brand-surface to-brand-deep">
          <DashboardPanelHeader
            title="Needs attention"
            description="Open jobs and unfinished reports — one record each."
            action={
              <Link
                href="/dashboard/inspections"
                className="inline-flex min-h-11 items-center text-sm font-medium text-brand-cta hover:underline"
              >
                All jobs
              </Link>
            }
          />
          {model.loading ? (
            <div className="space-y-3" aria-busy>
              <LineSkeleton className="h-12 w-full" />
              <LineSkeleton className="h-12 w-full" />
              <LineSkeleton className="h-12 w-5/6" />
            </div>
          ) : model.activeInspections.length === 0 &&
            model.openReports.length === 0 ? (
            <EmptyBlock
              title={
                model.hasAnyWork
                  ? "Nothing waiting"
                  : "No jobs on the board yet"
              }
              body={
                model.hasAnyWork
                  ? "Start an inspection when you arrive on site."
                  : "Capture the site first. The report and invoice follow from that record."
              }
              href="/dashboard/inspections/new"
              label="New inspection"
            />
          ) : (
            <ul className="divide-y divide-border">
              {model.activeInspections.slice(0, 4).map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/dashboard/inspections/${job.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="mb-0.5 inline-block text-[11px] font-medium uppercase tracking-wide text-brand-slate">
                        Job
                      </span>
                      <span className="block truncate text-sm font-medium text-foreground">
                        {job.propertyAddress ||
                          job.inspectionNumber ||
                          "Inspection"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.inspectionNumber} ·{" "}
                        {timeAgo(new Date(job.createdAt))}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                        statusTone(job.status),
                      )}
                    >
                      {job.status}
                    </span>
                  </Link>
                </li>
              ))}
              {model.openReports.slice(0, 3).map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/dashboard/reports/${report.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="mb-0.5 inline-block text-[11px] font-medium uppercase tracking-wide text-brand-slate">
                        Report
                      </span>
                      <span className="block truncate text-sm font-medium text-foreground">
                        {report.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {report.clientName} ·{" "}
                        {timeAgo(new Date(report.createdAt))}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                        statusTone(report.status),
                      )}
                    >
                      {report.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>

        <DashboardPanel className="lg:col-span-2 border-brand-bronze/25 bg-brand-deep bg-gradient-to-br from-brand-surface to-brand-deep">
          <DashboardPanelHeader
            title="Unpaid invoices"
            description="Money still sitting with the client."
            action={
              <Link
                href="/dashboard/invoices"
                className="inline-flex min-h-11 items-center text-sm font-medium text-brand-cta hover:underline"
              >
                All invoices
              </Link>
            }
          />
          {model.loading ? (
            <div className="space-y-3" aria-busy>
              <LineSkeleton className="h-10 w-full" />
              <LineSkeleton className="h-10 w-full" />
            </div>
          ) : model.outstandingInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices waiting on payment.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {model.outstandingInvoices.slice(0, 5).map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {invoice.invoiceNumber || "Invoice"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {invoice.customerName || "Client"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                        statusTone(invoice.status),
                      )}
                    >
                      {invoice.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel className="mt-6 border-brand-bronze/25 bg-brand-deep bg-gradient-to-br from-brand-surface to-brand-deep">
        <DashboardPanelHeader
          title="Recent reports"
          description="Documentation already on the job."
          action={
            <Link
              href="/dashboard/reports"
              className="inline-flex min-h-11 items-center text-sm font-medium text-brand-cta hover:underline"
            >
              View all
            </Link>
          }
        />
        {model.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
            {Array.from({ length: 3 }).map((_, i) => (
              <LineSkeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : model.recentReports.length === 0 ? (
          <EmptyBlock
            title="No reports yet"
            body="Write the first report from what you captured on site."
            href="/dashboard/reports/new"
            label="Create the first report"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.recentReports.map((report) => {
              const fanOutCount = report.fanOutSessions?.length ?? 0;
              const retryCount = report.evaluatorScores?.retryCount ?? 0;
              return (
                <Link
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  className="block min-w-0 rounded-[10px] border border-border bg-background p-4 hover:border-brand-bronze/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {report.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {report.clientName}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                        statusTone(report.status),
                      )}
                    >
                      {report.status}
                    </span>
                  </div>
                  {(fanOutCount > 0 ||
                    retryCount > 0 ||
                    report.evaluatorScores) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {fanOutCount > 0 && <span>{fanOutCount} sessions</span>}
                      {retryCount > 0 && <span>{retryCount} retries</span>}
                      {report.evaluatorScores != null && (
                        <EvaluatorScoreBadge scores={report.evaluatorScores} />
                      )}
                    </div>
                  )}
                  {report.phases && report.phases.length > 0 && (
                    <div className="mt-3 flex gap-0.5">
                      {report.phases.map((p) => (
                        <div
                          key={p.phase}
                          title={p.label}
                          className={cn(
                            "h-1.5 flex-1 rounded-sm",
                            p.completed ? "bg-brand-cta" : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </DashboardPanel>

      <nav
        aria-label="Field shortcuts"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        <Link
          href="/dashboard/inspections"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-foreground"
        >
          <JobsMark className="h-5 w-5" />
          Jobs
        </Link>
        <Link
          href="/dashboard/field"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-foreground"
        >
          <FieldMark className="h-5 w-5" />
          Field
        </Link>
        <Link
          href="/dashboard/reports/new"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-foreground"
        >
          <ReportMark className="h-5 w-5" />
          Report
        </Link>
      </nav>
    </div>
  );
}

function PipelineStep({
  href,
  label,
  hint,
  value,
  loading,
  connector,
}: {
  href: string;
  label: string;
  hint: string;
  value: number;
  loading: boolean;
  connector?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative min-w-0",
        connector &&
          "border-white/10 max-lg:[&:nth-child(n+3)]:border-t lg:border-t-0 lg:border-l",
      )}
    >
      <Link
        href={href}
        className="flex min-h-18 items-center justify-between gap-3 px-4 py-3 lg:block lg:py-4"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-brand-gold">
            {label}
          </span>
          <span className="mt-0.5 block text-sm text-slate-300">
            {hint}
          </span>
        </span>
        <span className="text-2xl font-semibold tabular-nums text-white lg:mt-2 lg:block">
          {loading ? "—" : value}
        </span>
      </Link>
    </li>
  );
}

function EmptyBlock({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <div className="py-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-cta"
      >
        {label}
      </Link>
    </div>
  );
}
