/**
 * Claims index — RA-1704.
 *
 * Lists ClaimProgress rows the current user has access to. Server-rendered.
 * Tenancy: scopes by Report.userId == session user (admins see all).
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = {
  title: "Claims — RestoreAssist",
};

export const dynamic = "force-dynamic";

export default async function ClaimsIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  // Tenancy via Report.userId. Joined to ClaimProgress so the index
  // shows only rows that have a progress record (the rest are read-only
  // reports that haven't entered the lifecycle).
  const claims = await prisma.claimProgress.findMany({
    where: isAdmin
      ? undefined
      : { report: { userId: session.user.id } },
    select: {
      id: true,
      reportId: true,
      currentState: true,
      version: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      report: {
        select: { id: true, propertyAddress: true, hazardType: true, title: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Claims</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin
            ? "All claims across the workspace."
            : "Claims you have progress access to."}
        </p>
      </header>

      {claims.length === 0 ? (
        <div className="rounded border p-6 text-sm text-muted-foreground">
          No claim-progress records yet. ClaimProgress rows are created the
          first time a report enters the lifecycle (POST
          {" "}<code>/api/progress/[reportId]/init</code>).
        </div>
      ) : (
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
                    {c.report?.propertyAddress ?? c.report?.title ?? "—"}
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
      )}
    </div>
  );
}

function StateBadge({ state, closed }: { state: string; closed: boolean }) {
  const tone = closed
    ? "bg-zinc-100 text-zinc-600"
    : state.includes("DISPUTED")
      ? "bg-amber-100 text-amber-800"
      : state.includes("HOLD")
        ? "bg-amber-100 text-amber-800"
        : state.includes("INVOICE_PAID")
          ? "bg-emerald-100 text-emerald-800"
          : "bg-blue-50 text-blue-700";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-mono ${tone}`}
    >
      {state}
    </span>
  );
}
