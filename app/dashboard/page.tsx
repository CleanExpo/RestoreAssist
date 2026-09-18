"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFetch } from "@/lib/hooks/useFetch";
import toast from "react-hot-toast";
import { TechLicenceBanner } from "@/components/dashboard/TechLicenceBanner";
import { AiKeySetupBanner } from "@/components/dashboard/AiKeySetupBanner";
import { BasicReportWithoutKeyCta } from "@/components/onboarding/BasicReportWithoutKeyCta";
import { InboundJobAlert } from "@/components/dashboard/InboundJobAlert";
import { EvaluatorScoreBadge } from "@/components/SessionMetadataCard";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import type { ReportWithSessionData } from "@/lib/session-types";
import {
  buildRecentActivity,
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
  createdAt?: string | null;
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
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400";
  }
  if (s === "OVERDUE" || s === "REJECTED") {
    return "bg-red-500/15 text-red-800 dark:text-red-300";
  }
  if (s === "PENDING" || s === "SENT" || s === "SUBMITTED" || s === "SCOPED") {
    return "bg-amber-500/15 text-amber-900 dark:text-amber-400";
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

const KIND_LABEL: Record<"job" | "report" | "invoice", string> = {
  job: "Job",
  report: "Report",
  invoice: "Invoice",
};

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
    if (status === "authenticated" && session?.user?.name) {
      toast.success(`Welcome back, ${session.user.name.split(" ")[0]}!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
      activity: buildRecentActivity({
        inspections,
        reports,
        invoices,
        limit: 8,
      }),
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-bronze/30 border-t-brand-cta" />
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
    <div className="min-w-0 pb-24 md:pb-0">
      <div className="space-y-3">
        <InboundJobAlert />
        <TechLicenceBanner />
        <AiKeySetupBanner />
        {(searchParams.get("welcome") === "1" ||
          searchParams.get("firstRun") === "1") && (
          <BasicReportWithoutKeyCta variant="dark" />
        )}
      </div>

      {model.loadFailed && !model.loading && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-800 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm">
            Could not load the workspace
            {model.loadError ? ` — ${model.loadError}` : ""}.
          </p>
          <button
            type="button"
            onClick={retryAll}
            className="min-h-11 shrink-0 rounded-md border border-red-500/40 px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <header className="mt-6 mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-brand-slate">Good to see you, {firstName}</p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-brand-navy dark:text-foreground sm:text-3xl">
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
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-cta px-4 text-sm font-medium text-white hover:bg-brand-cta-hover sm:w-auto"
        >
          {model.focus.label}
        </Link>
      </header>

      <section aria-label="Work pipeline" className="min-w-0">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          One job, three stages
        </h2>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          <PipelineStep
            step="1"
            label="On site"
            href="/dashboard/inspections"
            value={model.activeInspections.length}
            hint="Open inspections"
            loading={model.loading}
          />
          <PipelineStep
            step="2"
            label="Report"
            href="/dashboard/reports"
            value={model.openReports.length}
            hint="Drafts and reviews"
            loading={model.loading}
          />
          <PipelineStep
            step="3"
            label="Invoice"
            href="/dashboard/invoices"
            value={model.outstandingInvoices.length}
            hint="Not yet paid"
            loading={model.loading}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <Link href="/dashboard/clients" className="text-brand-cta hover:underline">
            {model.loading ? "—" : model.clients.length} clients
          </Link>{" "}
          on file
        </p>
      </section>

      {!model.loading && !model.hasAnyWork && !model.loadFailed && (
        <DashboardPanel className="mt-6">
          <h2 className="text-lg font-semibold text-brand-navy dark:text-foreground">
            First job on the board
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Capture the site, write the report from that record, then invoice
            the same job. Nothing is copied between tools.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard/inspections/new"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-cta px-4 text-sm font-medium text-white hover:bg-brand-cta-hover"
            >
              New inspection
            </Link>
            <Link
              href="/dashboard/field"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
            >
              Open field capture
            </Link>
          </div>
        </DashboardPanel>
      )}

      <section className="mt-6 min-w-0">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Start work
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRIMARY_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-brand-bronze/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {action.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {action.description}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-brand-slate">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-5">
        <DashboardPanel className="min-w-0 lg:col-span-3">
          <DashboardPanelHeader
            title="Needs attention"
            description="Jobs still open and reports not finished."
            action={
              <Link
                href="/dashboard/inspections"
                className="text-sm font-medium text-brand-cta hover:underline"
              >
                All jobs
              </Link>
            }
          />
          {model.loading ? (
            <ListSkeleton rows={4} />
          ) : model.activeInspections.length === 0 &&
            model.openReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing waiting. Start an inspection when you arrive on site.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {model.activeInspections.slice(0, 4).map((job) => (
                <WorkRow
                  key={job.id}
                  href={`/dashboard/inspections/${job.id}`}
                  title={
                    job.propertyAddress || job.inspectionNumber || "Inspection"
                  }
                  meta={`${job.inspectionNumber ?? "Job"} · ${timeAgo(new Date(job.createdAt))}`}
                  status={job.status}
                />
              ))}
              {model.openReports.slice(0, 3).map((report) => (
                <WorkRow
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  title={report.title}
                  meta={`${report.clientName} · ${timeAgo(new Date(report.createdAt))}`}
                  status={report.status}
                />
              ))}
            </ul>
          )}
        </DashboardPanel>

        <DashboardPanel className="min-w-0 lg:col-span-2">
          <DashboardPanelHeader
            title="Unpaid invoices"
            action={
              <Link
                href="/dashboard/invoices"
                className="text-sm font-medium text-brand-cta hover:underline"
              >
                All invoices
              </Link>
            }
          />
          {model.loading ? (
            <ListSkeleton rows={4} />
          ) : model.outstandingInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices waiting on payment.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {model.outstandingInvoices.slice(0, 5).map((invoice) => (
                <WorkRow
                  key={invoice.id}
                  href={`/dashboard/invoices/${invoice.id}`}
                  title={invoice.invoiceNumber || "Invoice"}
                  meta={invoice.customerName || "Client"}
                  status={invoice.status}
                />
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-5">
        <DashboardPanel className="min-w-0 lg:col-span-3">
          <DashboardPanelHeader
            title="Recent reports"
            action={
              <Link
                href="/dashboard/reports"
                className="text-sm font-medium text-brand-cta hover:underline"
              >
                View all
              </Link>
            }
          />
          {model.loading ? (
            <ListSkeleton rows={3} />
          ) : model.recentReports.length === 0 ? (
            <div className="py-2">
              <p className="text-sm text-muted-foreground">No reports yet.</p>
              <Link
                href="/dashboard/reports/new"
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-cta"
              >
                Create the first report
              </Link>
            </div>
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {model.recentReports.map((report) => {
                const fanOutCount = report.fanOutSessions?.length ?? 0;
                const retryCount = report.evaluatorScores?.retryCount ?? 0;
                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="block min-w-0 rounded-lg border border-border bg-background p-4 hover:border-brand-bronze/50"
                  >
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {report.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {report.clientName}
                        </p>
                      </div>
                      <StatusBadge status={report.status} />
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

        <DashboardPanel className="min-w-0 lg:col-span-2">
          <DashboardPanelHeader title="Recent activity" />
          {model.loading ? (
            <ListSkeleton rows={5} />
          ) : model.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Activity appears here once a job, report or invoice is created.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {model.activity.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex min-h-12 min-w-0 items-start justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {row.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {KIND_LABEL[row.kind]} · {row.meta}
                        {row.at > 0 ? ` · ${timeAgo(new Date(row.at))}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>

      <nav
        aria-label="Field shortcuts"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        <MobileTab href="/dashboard/inspections" label="Jobs" />
        <MobileTab href="/dashboard/field" label="Field" />
        <MobileTab href="/dashboard/reports" label="Reports" />
        <MobileTab href="/dashboard/invoices" label="Bills" />
      </nav>
    </div>
  );
}

function PipelineStep({
  step,
  label,
  href,
  value,
  hint,
  loading,
}: {
  step: string;
  label: string;
  href: string;
  value: number;
  hint: string;
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="min-w-0 rounded-lg border border-border bg-card px-4 py-3 hover:border-brand-bronze/50"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-brand-slate">
        {step} · {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-navy dark:text-foreground">
        {loading ? "—" : value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function WorkRow({
  href,
  title,
  meta,
  status,
}: {
  href: string;
  title: string;
  meta: string;
  status: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {meta}
          </span>
        </span>
        <StatusBadge status={status} />
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-fit max-w-full truncate rounded px-2 py-0.5 text-xs font-medium",
        statusTone(status),
      )}
    >
      {status}
    </span>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

function MobileTab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 min-w-0 flex-col items-center justify-center px-1 text-xs font-medium text-foreground"
    >
      {label}
    </Link>
  );
}
