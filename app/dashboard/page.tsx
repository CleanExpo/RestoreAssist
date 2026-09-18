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
import type { ReportWithSessionData } from "@/lib/session-types";
import {
  buildAttentionBoard,
  buildRecentActivity,
  isActiveInspectionStatus,
  isOpenReportStatus,
  isOutstandingInvoiceStatus,
  resolveHomeFocus,
  type BoardStage,
} from "@/lib/dashboard/home-focus";
import { cn } from "@/lib/utils";
import useTrialStatus from "@/lib/billing/use-trial-status";

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

const STAGE_LABEL: Record<BoardStage, string> = {
  site: "On site",
  report: "Write",
  invoice: "Bill",
};

const STAGE_HREF: Record<BoardStage, string> = {
  site: "/dashboard/inspections",
  report: "/dashboard/reports",
  invoice: "/dashboard/invoices",
};

const COMMANDS = [
  { href: "/dashboard/inspections/new", label: "New inspection" },
  { href: "/dashboard/field", label: "Field capture" },
  { href: "/dashboard/reports/new", label: "New report" },
  { href: "/dashboard/invoices/new", label: "New invoice" },
] as const;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const trial = useTrialStatus();
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

    const hasAnyWork =
      reports.length > 0 || inspections.length > 0 || invoices.length > 0;

    return {
      clients,
      board: buildAttentionBoard({
        inspections,
        reports,
        invoices,
        limit: 12,
      }),
      activity: buildRecentActivity({
        inspections,
        reports,
        invoices,
        limit: 5,
      }),
      stages: [
        {
          stage: "site" as const,
          value: activeInspections.length,
        },
        {
          stage: "report" as const,
          value: openReports.length,
        },
        {
          stage: "invoice" as const,
          value: outstandingInvoices.length,
        },
      ],
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
  const ledger = [
    {
      label: "On site",
      value: model.stages[0]?.value ?? 0,
      href: "/dashboard/inspections",
    },
    {
      label: "To write",
      value: model.stages[1]?.value ?? 0,
      href: "/dashboard/reports",
    },
    {
      label: "To bill",
      value: model.stages[2]?.value ?? 0,
      href: "/dashboard/invoices",
    },
    {
      label: "Clients",
      value: model.clients.length,
      href: "/dashboard/clients",
    },
  ];
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
        <div className="mt-4 flex flex-col gap-3 border border-destructive/30 bg-destructive-subtle px-4 py-3 text-destructive-subtle-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm">
            Could not load the workspace
            {model.loadError ? ` — ${model.loadError}` : ""}.
          </p>
          <button
            type="button"
            onClick={retryAll}
            className="min-h-11 shrink-0 border border-destructive/40 px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <section
        aria-label="Next action"
        className="-mx-3 mt-4 bg-brand-navy px-4 py-8 text-white sm:-mx-4 sm:px-6 sm:py-10 lg:-mx-6 lg:px-8"
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-gold">
          {firstName} · now
        </p>
        <div className="mt-3 flex min-w-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              {model.loading ? "Reading the book of work" : model.focus.title}
            </h1>
            <p className="mt-3 max-w-lg text-pretty text-sm text-white/70 sm:text-base">
              {model.loading
                ? "Jobs, reports and invoices from this workspace."
                : model.focus.why}
            </p>
          </div>
          <Link
            href={model.focus.href}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center bg-white px-6 text-sm font-semibold text-brand-navy hover:bg-brand-cloud sm:w-auto"
          >
            {model.focus.label}
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px bg-white/20 sm:grid-cols-4">
          {ledger.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-brand-navy px-3 py-4 sm:px-4 sm:py-5"
            >
              <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                {model.loading ? "—" : stat.value}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-brand-gold">
                {stat.label}
              </p>
            </Link>
          ))}
        </div>
        {trial.data?.isTrialActive && (
          <p className="mt-4 text-sm text-brand-gold">
            {trial.data.daysRemaining} day
            {trial.data.daysRemaining === 1 ? "" : "s"} left on trial
            {typeof trial.data.creditsRemaining === "number"
              ? ` · ${trial.data.creditsRemaining} credits`
              : ""}
          </p>
        )}
      </section>

      <section aria-label="Work still open" className="mt-8 min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-slate">
          Still open
        </p>
        <div className="mt-3 flex min-h-20 min-w-0">
          {model.stages.map((item, index) => (
            <Link
              key={item.stage}
              href={STAGE_HREF[item.stage]}
              className={cn(
                "flex min-w-0 flex-col justify-end border-t-2 border-brand-navy px-3 py-3 sm:px-4",
                index > 0 && "border-l border-border",
              )}
              style={{ flexGrow: model.loading ? 1 : Math.max(item.value, 1) }}
            >
              <span className="text-3xl font-semibold tabular-nums leading-none text-brand-navy dark:text-foreground">
                {model.loading ? "—" : item.value}
              </span>
              <span className="mt-2 truncate text-xs uppercase tracking-wider text-brand-slate">
                {STAGE_LABEL[item.stage]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <nav
        aria-label="Start work"
        className="mt-6 flex min-w-0 flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-sm"
      >
        {COMMANDS.map((command) => (
          <Link
            key={command.href}
            href={command.href}
            className="min-h-11 font-medium text-brand-navy underline-offset-4 hover:underline dark:text-foreground"
          >
            {command.label}
          </Link>
        ))}
        <Link
          href="/dashboard/clients"
          className="min-h-11 text-muted-foreground underline-offset-4 hover:underline"
        >
          {model.loading ? "Clients" : `${model.clients.length} clients`}
        </Link>
      </nav>

      <section aria-label="The board" className="mt-10 min-w-0">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-brand-slate">
            The board
          </h2>
          <Link
            href={model.focus.href}
            className="text-xs font-medium text-brand-cta hover:underline"
          >
            Open the queue
          </Link>
        </div>

        {model.loading ? (
          <div className="mt-4 space-y-px" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-muted" />
            ))}
          </div>
        ) : model.board.length === 0 ? (
          <div className="mt-4 border-t border-border py-10">
            <p className="max-w-md text-sm text-muted-foreground">
              {model.hasAnyWork
                ? "Nothing is waiting. The next site visit or report starts from the line above."
                : "The first record is the job. Capture the site, write the report from that record, then bill the same job."}
            </p>
          </div>
        ) : (
          <ul className="mt-4 border-t border-brand-navy">
            {model.board.map((row) => (
              <li key={row.id} className="border-b border-border">
                <Link
                  href={row.href}
                  className="grid min-h-16 min-w-0 grid-cols-1 items-center gap-1 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:gap-6"
                >
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-slate">
                    <StageTicks stage={row.stage} />
                    {STAGE_LABEL[row.stage]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-foreground">
                      {row.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.meta}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-wide text-brand-slate">
                    {row.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {model.activity.length > 0 && !model.loading && (
        <section aria-label="Just happened" className="mt-12 min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-brand-slate">
            Just happened
          </h2>
          <ul className="mt-3 space-y-2">
            {model.activity.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="block min-w-0 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="text-foreground">{row.title}</span>
                  <span className="text-brand-slate">
                    {" "}
                    · {STAGE_LABEL[row.kind === "job" ? "site" : row.kind]}
                    {row.at > 0
                      ? ` · ${timeAgo(new Date(row.at))}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

function timeAgo(date: Date) {
  const diffInMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
  return `${Math.floor(diffInMinutes / 1440)}d ago`;
}

function StageTicks({ stage }: { stage: BoardStage }) {
  const filled = stage === "site" ? 1 : stage === "report" ? 2 : 3;
  return (
    <span aria-hidden className="flex gap-0.5">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 w-1.5",
            n <= filled ? "bg-brand-cta" : "bg-border",
          )}
        />
      ))}
    </span>
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
