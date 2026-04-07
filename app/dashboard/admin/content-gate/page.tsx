/**
 * NIR Content Gate Status — Admin
 *
 * Route: /dashboard/admin/content-gate
 * Auth:  ADMIN role required (server-side redirect)
 *
 * Server component — renders gate statuses directly from lib/nir-content-gate.ts
 * with no client-side fetch. This is intentional: gate status changes are code
 * changes (not DB writes), so a server render always reflects the current state.
 *
 * The gate blocks customer-facing content until HYPOTHESIS claims are promoted
 * to VALIDATED. See lib/nir-content-gate.ts and docs/CONTENT-GATE.md.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NirContentGateDashboard } from "@/components/nir-content-gate-status";
import { Lock, ArrowLeft, ExternalLink } from "lucide-react";

export const metadata = {
  title: "NIR Content Gate — Admin | RestoreAssist",
  description:
    "Evidence-based publication gate status for NIR customer-facing content domains.",
};

export default async function ContentGatePage() {
  const session = await getServerSession(authOptions);

  // Server-side auth guard — redirect unauthenticated or non-admin users
  if (!session?.user) {
    redirect("/login");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <a
          href="/dashboard/admin/pilot"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 mb-4 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to pilot dashboard
        </a>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-slate-800 flex items-center justify-center text-neutral-600 dark:text-slate-400">
              <Lock size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                NIR Content Gate
              </h1>
              <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
                Evidence-based publication gate — customer-facing content is
                blocked until each domain&apos;s HYPOTHESIS claims are promoted
                to VALIDATED.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/CleanExpo/RestoreAssist/blob/main/docs/CONTENT-GATE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors flex-shrink-0"
          >
            docs/CONTENT-GATE.md <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* How to open a gate */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          How to open a content domain
        </p>
        <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside leading-relaxed">
          <li>
            Collect pilot observations until the claim shows{" "}
            <strong>Ready to promote</strong> on the{" "}
            <a
              href="/dashboard/admin/pilot"
              className="underline hover:no-underline"
            >
              Readiness Dashboard
            </a>
          </li>
          <li>
            Update{" "}
            <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-[10px]">
              lib/nir-evidence-architecture.ts
            </code>
            : set{" "}
            <code className="font-mono">status: &apos;VALIDATED&apos;</code>{" "}
            with <code className="font-mono">validatedBy</code> and{" "}
            <code className="font-mono">validationNotes</code>
          </li>
          <li>
            Open a PR — the diff is the audit trail. Once merged, this page
            updates automatically.
          </li>
        </ol>
      </div>

      {/* The gate dashboard (server component — always current) */}
      <NirContentGateDashboard />
    </div>
  );
}
