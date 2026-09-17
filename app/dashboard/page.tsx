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
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (s === "OVERDUE" || s === "REJECTED") {
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  }
  if (s === "PENDING" || s === "SENT" || s === "SUBMITTED" || s === "SCOPED") {
    return "bg-amber-500/15 text-amber-800 dark:text-amber-400";
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

  return (
    <div className="pb-24 md:pb-0">
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
          <p className="text-sm">
            Could not load the workspace
            {model.loadError ? ` — ${model.loadError}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => {
              void refetchReports();
              void refetchClients();
              void refetchInspections();
              void refetchInvoices();
            }}
            className="min-h-11 shrink-0 rounded-md border border-red-500/40 px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <header className="mt-6 mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Good to see you, {firstName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {model.loading ? "Loading the board…" : model.focus.title}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {model.loading
              ? "Checking jobs, reports and invoices."
              : model.focus.why}
          </p>
        </div>
        <Link
          href={model.focus.href}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-cta px-4 text-sm font-medium text-white hover:bg-brand-cta-hover"
        >
          {model.focus.label}
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FocusStat
          label="Open jobs"
          value={model.activeInspections.length}
          href="/dashboard/inspections"
          loading={model.loading}
        />
        <FocusStat
          label="Reports in play"
          value={model.openReports.length}
          href="/dashboard/reports"
          loading={model.loading}
        />
        <FocusStat
          label="Unpaid invoices"
          value={model.outstandingInvoices.length}
          href="/dashboard/invoices"
          loading={model.loading}
        />
        <FocusStat
          label="Clients"
          value={model.clients.length}
          href="/dashboard/clients"
          loading={model.loading}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Do next
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRIMARY_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-brand-bronze/50"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {action.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {action.description}
                </span>
              </span>
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <DashboardPanel className="lg:col-span-3">
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
            <p className="text-sm text-muted-foreground">Loading work…</p>
          ) : model.activeInspections.length === 0 &&
            model.openReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing waiting. Start an inspection when you arrive on site.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {model.activeInspections.slice(0, 4).map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/dashboard/inspections/${job.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {job.propertyAddress || job.inspectionNumber || "Inspection"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.inspectionNumber} · {timeAgo(new Date(job.createdAt))}
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
                      <span className="block truncate text-sm font-medium text-foreground">
                        {report.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {report.clientName} · {timeAgo(new Date(report.createdAt))}
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

        <DashboardPanel className="lg:col-span-2">
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
            <p className="text-sm text-muted-foreground">Loading invoices…</p>
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
                      <span className="text-xs text-muted-foreground">
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

      <DashboardPanel className="mt-6">
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
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-bronze/30 border-t-brand-cta" />
          </div>
        ) : model.recentReports.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No reports yet.</p>
            <Link
              href="/dashboard/reports/new"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-cta"
            >
              Create the first report
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.recentReports.map((report) => {
              const fanOutCount = report.fanOutSessions?.length ?? 0;
              const retryCount = report.evaluatorScores?.retryCount ?? 0;
              return (
                <Link
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  className="block rounded-lg border border-border bg-background p-4 hover:border-brand-bronze/50"
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
      >
        <Link
          href="/dashboard/inspections"
          className="flex min-h-12 flex-col items-center justify-center text-xs font-medium text-foreground"
        >
          Jobs
        </Link>
        <Link
          href="/dashboard/field"
          className="flex min-h-12 flex-col items-center justify-center text-xs font-medium text-foreground"
        >
          Field
        </Link>
        <Link
          href="/dashboard/reports/new"
          className="flex min-h-12 flex-col items-center justify-center text-xs font-medium text-foreground"
        >
          Report
        </Link>
      </nav>
    </div>
  );
}

function FocusStat({
  label,
  value,
  href,
  loading,
}: {
  label: string;
  value: number;
  href: string;
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4 sm:py-4"
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
        {loading ? "—" : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{label}</p>
    </Link>
  );
}
