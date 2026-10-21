/**
 * Claims index — RA-1704.
 *
 * Lists ClaimProgress rows the current user has access to. Server-rendered.
 * Tenancy (RA-8043): an admin sees their workspace's reports through
 * resolveReportReach (platform-wide only for the platform allowlist); anyone
 * else sees their own.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveReportReach } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { SimpleDashboardPageFrame } from "@/app/dashboard/components/SimpleDashboardPageFrame";
import { ADVANCED_WORKSPACE_EYEBROW } from "@/lib/dashboard/simple-dashboard-theme";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";

export const metadata = {
  title: "Claims — RestoreAssist",
};

export const dynamic = "force-dynamic";

export default async function ClaimsIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  // RA-8043: an admin gets the tenancy helper's report reach (their workspace;
  // platform-wide only for the platform allowlist); anyone else gets their own
  // reports. If the reach cannot be resolved, an admin falls back to their own
  // reports, never to every tenant.
  const ownOnly = { userId: session.user.id };
  const reach = isAdmin ? await resolveReportReach(session).catch(() => null) : null;
  const reportScope = reach?.ok ? reach.data : ownOnly;

  // Joined to ClaimProgress so the index shows only rows that have a progress
  // record (the rest are read-only reports that haven't entered the lifecycle).
  const claims = await prisma.claimProgress.findMany({
    where: { report: reportScope },
    select: {
      id: true,
      reportId: true,
      currentState: true,
      version: true,
      closedAt: true,
      managerReviewRequired: true,
      createdAt: true,
      updatedAt: true,
      report: {
        select: {
          id: true,
          propertyAddress: true,
          hazardType: true,
          title: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const openCount = claims.filter((c) => !c.closedAt).length;
  const reviewCount = claims.filter((c) => c.managerReviewRequired).length;

  return (
    <SimpleDashboardPageFrame className="space-y-6 pb-10 pt-2">
      <DashboardListPageHeader
        eyebrow={ADVANCED_WORKSPACE_EYEBROW}
        title="Claims"
        description={
          isAdmin
            ? "All claims across the workspace — intake through closeout."
            : "Claims you have progress access to."
        }
        icon={<FolderKanban className="h-7 w-7 text-cyan-400" aria-hidden />}
        secondaryLinks={workspaceHubLinks({ omitHref: "/dashboard/claims" })}
        primaryAction={
          claims.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2 text-xs">
              <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-white/80">
                {claims.length} total
              </span>
              <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-white/80">
                {openCount} open
              </span>
              {reviewCount > 0 ? (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-amber-100">
                  {reviewCount} need review
                </span>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {claims.length === 0 ? (
        <div className="rounded-lg border p-8 space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-medium">No claims yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Claims appear here once a report enters the compliance lifecycle.
              Open a report and tap{" "}
              <span className="font-medium text-foreground">
                Start claim progress
              </span>{" "}
              to initialise tracking.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link
              href="/dashboard/reports"
              className="px-3 py-1.5 text-sm rounded bg-foreground text-background"
            >
              Open reports →
            </Link>
            <Link
              href="/dashboard/inspections"
              className="px-3 py-1.5 text-sm rounded border"
            >
              Go to inspections
            </Link>
            <Link
              href="/dashboard/help"
              className="px-3 py-1.5 text-sm rounded border"
            >
              How does this work?
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Minimal job status board */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["INTAKE", "Intake"],
                ["STABILISATION_ACTIVE", "Stabilisation"],
                ["DRYING_ACTIVE", "Drying"],
                ["CLOSEOUT", "Closeout"],
              ] as const
            ).map(([state, label]) => {
              const cards = claims.filter(
                (c) =>
                  c.currentState === state ||
                  (state === "STABILISATION_ACTIVE" &&
                    c.currentState.startsWith("STABILISATION")) ||
                  (state === "DRYING_ACTIVE" &&
                    (c.currentState.startsWith("DRYING") ||
                      c.currentState.startsWith("SCOPE") ||
                      c.currentState === "VARIATION_REVIEW")) ||
                  (state === "CLOSEOUT" &&
                    (c.currentState === "CLOSEOUT" ||
                      c.currentState.startsWith("INVOICE") ||
                      c.currentState === "CLOSED")),
              );
              return (
                <div
                  key={state}
                  className="rounded-lg border bg-muted/20 p-3 space-y-2 min-h-[8rem]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {cards.slice(0, 6).map((c) => (
                      <Link
                        key={c.id}
                        href={`/dashboard/claims/${c.reportId}`}
                        className="block rounded-md border bg-background px-2 py-1.5 text-xs hover:border-foreground/30"
                      >
                        <span className="font-medium line-clamp-1">
                          {c.report?.propertyAddress ??
                            c.report?.title ??
                            "Claim"}
                        </span>
                        <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                          {c.currentState}
                        </span>
                      </Link>
                    ))}
                    {cards.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">
                        No jobs here
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Job</th>
                <th className="px-4 py-2 text-left">State</th>
                <th className="px-4 py-2 text-left">Updated</th>
                <th className="px-4 py-2 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {c.report?.propertyAddress ?? c.report?.title ?? "—"}
                    </div>
                    {c.managerReviewRequired ? (
                      <div className="text-xs text-warning-subtle-foreground mt-0.5">
                        Manager review required
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{c.report?.hazardType ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StateBadge state={c.currentState} closed={!!c.closedAt} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(c.updatedAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/claims/${c.reportId}`}
                      className="text-blue-600 hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </SimpleDashboardPageFrame>
  );
}

function StateBadge({ state, closed }: { state: string; closed: boolean }) {
  const tone = closed
    ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
    : state.includes("DISPUTED")
      ? "bg-warning-subtle text-warning-subtle-foreground"
      : state.includes("HOLD")
        ? "bg-warning-subtle text-warning-subtle-foreground"
        : state.includes("INVOICE_PAID")
          ? "bg-success-subtle text-success-subtle-foreground"
          : "bg-info-subtle text-info-subtle-foreground";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-mono ${tone}`}
    >
      {state}
    </span>
  );
}
