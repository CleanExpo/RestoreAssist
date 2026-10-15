"use client";

import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFetchWithError } from "@/lib/client/useFetchWithError";
import toast from "react-hot-toast";
import { TechLicenceBanner } from "@/components/dashboard/TechLicenceBanner";
import { BasicReportWithoutKeyCta } from "@/components/onboarding/BasicReportWithoutKeyCta";
import { InboundJobAlert } from "@/components/dashboard/InboundJobAlert";
import { EvaluatorScoreBadge } from "@/components/SessionMetadataCard";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import { SimpleDashboardPageFrame } from "@/app/dashboard/components/SimpleDashboardPageFrame";
import {
  WORKSPACE_LINKS,
  isManagerOrAdminRole,
  simpleWorkspaceHubLinks,
  workspaceHubLinks,
} from "@/lib/dashboard/workspace-secondary-links";
import { isAdvancedMode, type ExperienceMode } from "@/app/dashboard/nav-config";
import {
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  HelpCircle,
  Loader2,
  MapPin,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
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
    icon: ClipboardCheck,
    accent: "from-cyan-500/15 to-blue-600/10 text-cyan-700 dark:text-cyan-300",
  },
  {
    href: "/dashboard/field",
    title: "Field capture",
    description: "Photos, moisture, voice",
    icon: MapPin,
    accent: "from-emerald-500/15 to-teal-600/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    href: "/dashboard/reports/new",
    title: "New report",
    description: "Write from what you captured",
    icon: FileText,
    accent: "from-violet-500/15 to-indigo-600/10 text-violet-700 dark:text-violet-300",
  },
  {
    href: "/dashboard/invoices/new",
    title: "Get a bill out",
    description: "Invoice the work",
    icon: Receipt,
    accent: "from-amber-500/15 to-orange-600/10 text-amber-800 dark:text-amber-300",
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

function LineSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
    />
  );
}

function DashboardOverviewSkeleton() {
  return (
    <SimpleDashboardPageFrame>
      <div className="space-y-6 py-6" role="status" aria-label="Loading dashboard">
        <LineSkeleton className="h-48 w-full rounded-2xl" />
        <LineSkeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LineSkeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <LineSkeleton className="h-64 rounded-lg lg:col-span-3" />
          <LineSkeleton className="h-64 rounded-lg lg:col-span-2" />
        </div>
      </div>
    </SimpleDashboardPageFrame>
  );
}

function DashboardInlineNotice({
  title,
  body,
  action,
  tone = "default",
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3 sm:px-5 sm:py-4",
        tone === "danger" &&
          "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
        tone === "warning" &&
          "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        tone === "default" &&
          "border-border bg-muted/40 text-foreground",
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  if (status === "loading") {
    return <DashboardOverviewSkeleton />;
  }
  if (status !== "authenticated" || !session?.user?.id) {
    return (
      <SimpleDashboardPageFrame>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Sign in to open your workspace overview.
          </p>
          <Link
            href="/login?callbackUrl=/dashboard"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </SimpleDashboardPageFrame>
    );
  }
  if (session.user.organizationScopeVerified === false) {
    return (
      <SimpleDashboardPageFrame>
        <div className="py-8">
          <DashboardInlineNotice
            tone="warning"
            title="Workspace verification paused"
            body="Your saved work is preserved. Retry to refresh your organisation scope."
            action={
              <button
                type="button"
                onClick={() => {
                  void update();
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium"
              >
                Retry workspace
              </button>
            }
          />
        </div>
      </SimpleDashboardPageFrame>
    );
  }

  // Unmount every resource reader when account or workspace changes. Cached
  // rows and delayed responses from the previous identity must never be shown.
  return (
    <DashboardWorkspace
      key={JSON.stringify([session.user.id, session.user.organizationId ?? null])}
      session={session}
    />
  );
}

type WorkspaceStatusResult = {
  hasWorkspace: boolean;
  status: "PROVISIONING" | "READY" | "SUSPENDED";
  workspaceId: string;
  workspaceName?: string;
  ready: boolean;
};

function DashboardWorkspace({ session }: { session: Session }) {
  const router = useRouter();
  const needsOnboarding = session.user.needsOnboarding === true;
  const { data, loading, error, refetch } = useFetchWithError<WorkspaceStatusResult>(
    needsOnboarding ? null : "/api/workspace/status",
  );
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding/account-type");
  }, [needsOnboarding, router]);

  if (needsOnboarding) {
    return (
      <SimpleDashboardPageFrame>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Finish account setup to unlock the overview.
          </p>
          <Link
            href="/onboarding/account-type"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Continue setup
          </Link>
        </div>
      </SimpleDashboardPageFrame>
    );
  }
  if (error?.status === 401 || error?.status === 403) {
    return (
      <SimpleDashboardPageFrame>
        <div className="py-8">
          <DashboardInlineNotice
            tone="danger"
            title="Workspace access could not be confirmed"
            body={
              <>
                HTTP {error.status}.{" "}
                <Link href="/login" className="font-medium underline">
                  Sign in again
                </Link>
              </>
            }
          />
        </div>
      </SimpleDashboardPageFrame>
    );
  }

  const workspaceNotice =
    !loading && error
      ? {
          message: `Workspace details are unavailable (HTTP ${error.status || "unknown"}).${error.eventId ? ` Error ID: ${error.eventId}.` : ""}`,
          onRetry: refetch,
        }
      : !loading && data?.hasWorkspace && data.status !== "READY"
        ? {
            message:
              data.status === "PROVISIONING"
                ? "Workspace setup is still in progress."
                : data.status === "SUSPENDED"
                  ? "This workspace is suspended. Contact your administrator."
                  : "Workspace details are unavailable.",
            onRetry: refetch,
          }
        : null;

  return (
    <DashboardContent
      session={session}
      workspaceName={data?.workspaceName || data?.workspaceId}
      workspaceLoading={loading}
      workspaceNotice={workspaceNotice}
    />
  );
}

function DashboardContent({
  session,
  workspaceName,
  workspaceLoading,
  workspaceNotice,
}: {
  session: Session;
  workspaceName?: string;
  workspaceLoading?: boolean;
  workspaceNotice?: { message: string; onRetry: () => void } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();

  useEffect(() => {
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
  }, [searchParams, router]);

  const {
    data: reportsRaw,
    loading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useFetchWithError<{ reports: ReportWithSessionData[] }>(
    "/api/reports?limit=40",
  );

  const {
    data: clientsRaw,
    loading: clientsLoading,
    error: clientsError,
    refetch: refetchClients,
  } = useFetchWithError<{
    clients: Array<{ id: string; name: string; createdAt: string }>;
  }>("/api/clients");

  const {
    data: inspectionsRaw,
    loading: inspectionsLoading,
    error: inspectionsError,
    refetch: refetchInspections,
  } = useFetchWithError<{ inspections: InspectionRow[] }>(
    "/api/inspections?limit=20&sort=recent",
  );

  const {
    data: invoicesRaw,
    loading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useFetchWithError<{ invoices: InvoiceRow[] }>(
    "/api/invoices?limit=20",
  );

  useEffect(() => {
    if (!session.user?.name) return;
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
  }, [session.user?.name]);

  const model = useMemo(() => {
    const loadFailed = Boolean(
      reportsError || clientsError || inspectionsError || invoicesError,
    );
    const reports = reportsError ? [] : (reportsRaw?.reports ?? []);
    const clients = clientsError ? [] : (clientsRaw?.clients ?? []);
    const inspections = inspectionsError ? [] : (inspectionsRaw?.inspections ?? []);
    const invoices = invoicesError ? [] : (invoicesRaw?.invoices ?? []);

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
      failures: [
        { label: "Reports", error: reportsError, loading: reportsLoading, retry: refetchReports },
        { label: "Clients", error: clientsError, loading: clientsLoading, retry: refetchClients },
        { label: "Inspections", error: inspectionsError, loading: inspectionsLoading, retry: refetchInspections },
        { label: "Invoices", error: invoicesError, loading: invoicesLoading, retry: refetchInvoices },
      ].filter((resource) => resource.error),
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
    refetchReports,
    refetchClients,
    refetchInspections,
    refetchInvoices,
  ]);

  const firstName = session.user?.name?.split(" ")[0] ?? "there";
  const role = (session.user as { role?: string }).role;
  const isManager = isManagerOrAdminRole(role);

  const [experienceMode, setExperienceMode] = useState<ExperienceMode | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/experience-mode", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { experienceMode?: ExperienceMode };
        if (!cancelled) {
          setExperienceMode(data.experienceMode ?? "APPRENTICE");
        }
      } catch {
        if (!cancelled) setExperienceMode("APPRENTICE");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const simpleMode = experienceMode !== null && !isAdvancedMode(experienceMode);
  const hubLinks = simpleMode
    ? simpleWorkspaceHubLinks({ omitHref: "/dashboard", isManager })
    : workspaceHubLinks({ omitHref: "/dashboard", includeCompletenessInbox: isManager });

  const supportTiles = [
    {
      href: WORKSPACE_LINKS.help.href,
      title: WORKSPACE_LINKS.help.label,
      description: "Guides, tutorials, and contact support",
      icon: HelpCircle,
    },
    {
      href: WORKSPACE_LINKS.billing.href,
      title: WORKSPACE_LINKS.billing.label,
      description: "Plan, payment method, and allowances",
      icon: CreditCard,
    },
    {
      href: WORKSPACE_LINKS.clients.href,
      title: WORKSPACE_LINKS.clients.label,
      description: "People linked to jobs and invoices",
      icon: Users,
    },
  ] as const;

  return (
    <SimpleDashboardPageFrame>
    <div className="min-w-0 space-y-8 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-2 sm:pt-4 md:pb-10">
      <div className="space-y-3">
        <InboundJobAlert />
        <TechLicenceBanner />
        {(searchParams.get("welcome") === "1" ||
          searchParams.get("firstRun") === "1" ||
          searchParams.get("firstRun") === "tech") && (
          <BasicReportWithoutKeyCta variant="dark" />
        )}
      </div>

      {workspaceLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading workspace details…
        </p>
      )}

      {workspaceNotice && (
        <div className="mt-4">
          <DashboardInlineNotice
            tone="warning"
            title="Workspace metadata"
            body={
              <>
                {workspaceNotice.message} Your jobs, reports, and invoices below
                still load from your account APIs.
              </>
            }
            action={
              <button
                type="button"
                onClick={workspaceNotice.onRetry}
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium"
              >
                Retry workspace details
              </button>
            }
          />
        </div>
      )}

      {model.loadFailed && (
        <div
          role="alert"
          className="mt-4 space-y-2 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300"
        >
          <p>Some workspace data could not be loaded. Available sections are shown below.</p>
          <ul className="space-y-2">
            {model.failures.map(({ label, error, loading, retry }) => (
              <li key={label} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {label}: {error!.status ? `HTTP ${error!.status}` : "Network error"}
                  {error!.code !== "UNKNOWN" ? ` (${error!.code})` : ""}
                  {error!.eventId ? ` — Error ID: ${error!.eventId}` : ""}
                  {error!.status === 401 ? ". Sign in again to reload this section." : ""}
                </span>
                <button
                  type="button"
                  onClick={retry}
                  disabled={loading}
                  className="min-h-11 shrink-0 rounded-[10px] border border-red-500/40 px-4 font-medium disabled:opacity-50"
                >
                  Retry {label.toLowerCase()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-cyan-950 p-6 shadow-xl shadow-cyan-950/25 sm:p-8 dark:shadow-black/50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0%,transparent_42%,rgba(34,211,238,0.06)_100%)]"
        />
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0 space-y-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Workspace overview
            </p>
            <div>
              <p className="text-sm text-white/70">
                Good to see you,{" "}
                <span className="font-medium text-white">{firstName}</span>
                {workspaceName ? (
                  <>
                    {" "}
                    · <span className="break-words">{workspaceName}</span>
                  </>
                ) : null}
              </p>
              <h1 className="mt-2 text-pretty text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2rem] lg:leading-tight">
                {model.loadFailed
                  ? "Workspace partially available"
                  : model.loading
                    ? "Loading your board…"
                    : model.focus.title}
              </h1>
              <p className="mt-2 max-w-9xl text-pretty text-sm leading-relaxed text-white/65">
                {model.loadFailed
                  ? "Retry the unavailable sections to see your full picture."
                  : model.loading
                    ? "Checking jobs, reports, and invoices."
                    : model.focus.why}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {model.loading ? (
                <>
                  <LineSkeleton className="h-[4.25rem] rounded-xl bg-white/10" />
                  <LineSkeleton className="h-[4.25rem] rounded-xl bg-white/10" />
                  <LineSkeleton className="h-[4.25rem] rounded-xl bg-white/10" />
                  <LineSkeleton className="h-[4.25rem] rounded-xl bg-white/10" />
                </>
              ) : (
                <>
                  <StatChip
                    variant="hero"
                    label="Active jobs"
                    value={model.activeInspections.length}
                  />
                  <StatChip
                    variant="hero"
                    label="Open reports"
                    value={model.openReports.length}
                  />
                  <StatChip
                    variant="hero"
                    label="Awaiting payment"
                    value={model.outstandingInvoices.length}
                  />
                  <StatChip variant="hero" label="Clients" value={model.clients.length} />
                </>
              )}
            </div>
          </div>
          {!model.loadFailed && !model.loading && (
            <Link
              href={model.focus.href}
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-8 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:brightness-105 xl:w-auto"
            >
              {model.focus.label}
            </Link>
          )}
        </div>
        <nav
          aria-label="Workspace shortcuts"
          className="relative mt-8 grid grid-cols-2 gap-2 border-t border-white/10 pt-6 sm:grid-cols-3"
        >
          {hubLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-center text-xs font-medium text-white/85 backdrop-blur-sm transition hover:border-cyan-300/30 hover:bg-white/10 sm:text-sm"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-label="Job through invoice">
        <SectionLabel>Pipeline</SectionLabel>
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-muted/40 via-card to-primary/[0.04] p-1 shadow-sm lg:grid-cols-4">
          <PipelineStep
            index={0}
            href="/dashboard/inspections"
            label="Inspect"
            hint="Jobs still open"
            value={model.activeInspections.length}
            loading={inspectionsLoading}
            unavailable={Boolean(inspectionsError)}
          />
          <PipelineStep
            index={1}
            href="/dashboard/reports"
            label="Report"
            hint="Drafts and reviews"
            value={model.openReports.length}
            loading={reportsLoading}
            unavailable={Boolean(reportsError)}
          />
          <PipelineStep
            index={2}
            href="/dashboard/invoices"
            label="Invoice"
            hint="Waiting on payment"
            value={model.outstandingInvoices.length}
            loading={invoicesLoading}
            unavailable={Boolean(invoicesError)}
          />
          <PipelineStep
            index={3}
            href="/dashboard/clients"
            label="Clients"
            hint="People on file"
            value={model.clients.length}
            loading={clientsLoading}
            unavailable={Boolean(clientsError)}
          />
        </ol>
      </section>

      <section aria-label="Quick actions">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionLabel className="mb-0">Quick actions</SectionLabel>
          <Link
            href="/dashboard/inspections/schedule"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/80 bg-gradient-to-r from-card to-primary/[0.04] px-3 text-sm font-medium text-primary shadow-sm transition hover:border-primary/30"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Job schedule
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRIMARY_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  "group flex min-h-[4.75rem] items-start gap-3 rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.05] p-4 text-left shadow-sm transition hover:border-primary/25 hover:shadow-md",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                    action.accent,
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="block text-sm font-semibold text-foreground">
                      {action.title}
                    </span>
                    <ChevronMark className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {action.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <ManagerOpsSummary session={session} />

      <div className="grid gap-6 xl:grid-cols-12">
        <DashboardPanel className="xl:col-span-7 bg-gradient-to-br from-card via-card to-cyan-500/[0.04]">
          <DashboardPanelHeader
            title="Needs attention"
            description="Open jobs and unfinished reports — one record each."
            action={
              <Link
                href="/dashboard/inspections"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
              >
                All jobs
              </Link>
            }
          />
          {(reportsError || inspectionsError) && (
            <p className="mb-3 text-sm text-muted-foreground">
              Open work is incomplete while reports or inspections are unavailable.
            </p>
          )}
          {reportsLoading || inspectionsLoading ? (
            <div className="space-y-3" aria-busy>
              <LineSkeleton className="h-12 w-full" />
              <LineSkeleton className="h-12 w-full" />
              <LineSkeleton className="h-12 w-5/6" />
            </div>
          ) : model.activeInspections.length === 0 &&
            model.openReports.length === 0 ? (
            reportsError || inspectionsError ? null : <EmptyBlock
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
                      <span className="mb-0.5 inline-block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                      <span className="mb-0.5 inline-block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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

        <DashboardPanel className="xl:col-span-5 bg-gradient-to-br from-card via-card to-amber-500/[0.05]">
          <DashboardPanelHeader
            title="Unpaid invoices"
            description="Money still sitting with the client."
            action={
              <Link
                href="/dashboard/invoices"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
              >
                All invoices
              </Link>
            }
          />
          {invoicesLoading ? (
            <div className="space-y-3" aria-busy>
              <LineSkeleton className="h-10 w-full" />
              <LineSkeleton className="h-10 w-full" />
            </div>
          ) : invoicesError ? (
            <p className="text-sm text-muted-foreground">Invoices are unavailable. Payment status could not be checked.</p>
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

      <DashboardPanel className="bg-gradient-to-br from-card via-card to-violet-500/[0.05]">
        <DashboardPanelHeader
          title="Recent reports"
          description="Documentation already on the job."
          action={
            <Link
              href="/dashboard/reports"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          }
        />
        {reportsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
            {Array.from({ length: 3 }).map((_, i) => (
              <LineSkeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : reportsError ? (
          <p className="text-sm text-muted-foreground">Reports are unavailable. Retry to check your records.</p>
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
                  className="block min-w-0 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md"
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
                            p.completed ? "bg-primary" : "bg-muted",
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

      <section aria-label="Help and account">
        <SectionLabel>Help &amp; account</SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          {supportTiles.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex gap-3 rounded-xl border border-border/80 bg-gradient-to-br from-card to-primary/[0.06] p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <nav
        aria-label="Field shortcuts"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] md:hidden"
      >
        <Link
          href="/dashboard/inspections"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-foreground active:bg-muted/60"
        >
          <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
          Jobs
        </Link>
        <Link
          href="/dashboard/field"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-foreground active:bg-muted/60"
        >
          <MapPin className="h-5 w-5 text-primary" aria-hidden />
          Field
        </Link>
        <Link
          href="/dashboard/reports/new"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-foreground active:bg-muted/60"
        >
          <FileText className="h-5 w-5 text-primary" aria-hidden />
          Report
        </Link>
      </nav>
    </div>
    </SimpleDashboardPageFrame>
  );
}

function ManagerOpsSummary({ session }: { session: Session }) {
  const role = (session.user as { role?: string }).role;
  const enabled = role === "ADMIN" || role === "MANAGER";
  const { data, loading, error, refetch } = useFetchWithError<{
    data: Array<{
      inspectionId: string;
      propertyAddress: string;
      inspectionNumber: string | null;
      blocking: string[];
    }>;
  }>(enabled ? "/api/operations/completeness-inbox" : null);

  if (!enabled) return null;

  const rows = data?.data ?? [];
  const gapCount = rows.length;

  return (
    <DashboardPanel className="bg-gradient-to-br from-card via-card to-amber-500/[0.06]">
      <DashboardPanelHeader
        title="Team gaps"
        description="Jobs missing required intake — from your organisation's active work."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/inspections/schedule"
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
            >
              Job schedule
            </Link>
            <Link
              href="/dashboard/operations/completeness-inbox"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Open inbox
            </Link>
          </div>
        }
      />
      {loading ? (
        <LineSkeleton className="h-10 w-full max-w-md" />
      ) : error ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Could not load team gaps. {error.message}</p>
          <button
            type="button"
            onClick={refetch}
            className="min-h-11 rounded-[10px] border border-border px-4 font-medium text-foreground"
          >
            Retry
          </button>
        </div>
      ) : gapCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocking gaps on active jobs right now.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 4).map((row) => (
            <li key={row.inspectionId}>
              <Link
                href={`/dashboard/inspections/${row.inspectionId}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.propertyAddress ||
                    row.inspectionNumber ||
                    "Inspection"}
                </span>
                <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">
                  {row.blocking.length} gap
                  {row.blocking.length === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function StatChip({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "hero";
}) {
  if (variant === "hero") {
    return (
      <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
        <p className="text-2xl font-semibold tabular-nums leading-none text-white">
          {value}
        </p>
        <p className="mt-1.5 text-xs text-white/60">{label}</p>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-gradient-to-br from-background to-muted/30 px-3 py-2">
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

const PIPELINE_SURFACE = [
  "from-cyan-500/12 via-card to-card",
  "from-violet-500/10 via-card to-card",
  "from-amber-500/10 via-card to-card",
  "from-emerald-500/10 via-card to-card",
] as const;

function PipelineStep({
  href,
  label,
  hint,
  value,
  loading,
  unavailable,
  index = 0,
}: {
  href: string;
  label: string;
  hint: string;
  value: number;
  loading: boolean;
  unavailable: boolean;
  index?: number;
  connector?: boolean;
}) {
  const surface = PIPELINE_SURFACE[index % PIPELINE_SURFACE.length];
  return (
    <li className="relative min-w-0">
      <Link
        href={href}
        className={cn(
          "flex min-h-[5.25rem] flex-col justify-between gap-2 rounded-xl bg-gradient-to-br px-4 py-3.5 transition hover:brightness-[1.02]",
          surface,
        )}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-primary">
            {label}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
          {unavailable ? (
            <span className="text-sm font-medium">Unavailable</span>
          ) : loading ? (
            "—"
          ) : (
            value
          )}
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
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
      >
        {label}
      </Link>
    </div>
  );
}
