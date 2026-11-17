"use client";

import Link from "next/link";
import { ChromeCalendar, ChromeCard, ChromeFile, ChromeHelpCircle, ChromeInbox, ChromeReceipt, ChromeUsers } from "@/components/brand/chrome-icons";
import { cn } from "@/lib/utils";
import {
  canOpenDashboardPage,
  isGuardedDashboardPage,
} from "@/lib/auth/dashboard-page-rules";
import { canWriteFinancialRecords } from "@/lib/auth/financial-writer-roles";

type Props = {
  inspectionId: string;
  clientId?: string | null;
  reportId?: string | null;
  /** The signed-in person's role. Missing (still loading) shows no guarded link. */
  role?: string;
  className?: string;
};

const NEW_INVOICE_PATH = "/dashboard/invoices/new";

/**
 * RA-8432 — whether this role may use the page a shortcut points at, asked of
 * the rule owners by destination rather than decided here. The page layout
 * enforces DASHBOARD_PAGE_ACCESS and POST /api/invoices enforces the
 * financial-writer roles, so the link and the server cannot disagree.
 */
function mayFollow(role: string | undefined, href: string): boolean {
  const path = href.split("?")[0];
  if (isGuardedDashboardPage(path)) return canOpenDashboardPage(role, path);
  if (path === NEW_INVOICE_PATH) return canWriteFinancialRecords(role);
  return true;
}

const linkClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 px-2.5 text-xs font-medium text-neutral-700 dark:text-slate-200 hover:bg-neutral-50 dark:hover:bg-slate-800/80 transition-colors";

export function InspectionWorkspaceLinks({
  inspectionId,
  clientId,
  reportId,
  role,
  className,
}: Props) {
  const billHref = clientId
    ? `${NEW_INVOICE_PATH}?clientId=${encodeURIComponent(clientId)}&inspectionId=${encodeURIComponent(inspectionId)}`
    : `${NEW_INVOICE_PATH}?inspectionId=${encodeURIComponent(inspectionId)}`;

  const items = [
    {
      href: reportId ? `/dashboard/reports/${reportId}` : "/dashboard/reports",
      label: reportId ? "This report" : "My Reports",
      icon: ChromeFile,
    },
    {
      href: clientId ? `/dashboard/clients/${clientId}` : "/dashboard/clients",
      label: clientId ? "This client" : "My Clients",
      icon: ChromeUsers,
    },
    { href: billHref, label: "Get a Bill Out", icon: ChromeReceipt },
    { href: "/dashboard/subscription", label: "Account & Billing", icon: ChromeCard },
    { href: "/dashboard/help", label: "Help", icon: ChromeHelpCircle },
    { href: "/dashboard/inspections/schedule", label: "Job schedule", icon: ChromeCalendar },
    {
      href: "/dashboard/operations/completeness-inbox",
      label: "Completeness inbox",
      icon: ChromeInbox,
    },
  ].filter(({ href }) => mayFollow(role, href));

  return (
    <nav
      aria-label="Workspace shortcuts"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href + label} href={href} className={linkClass}>
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
