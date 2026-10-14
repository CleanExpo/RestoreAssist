"use client";

import Link from "next/link";
import {
  FileText,
  Users,
  Receipt,
  CreditCard,
  HelpCircle,
  CalendarDays,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  inspectionId: string;
  clientId?: string | null;
  reportId?: string | null;
  showCompletenessInbox?: boolean;
  className?: string;
};

const linkClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 px-2.5 text-xs font-medium text-neutral-700 dark:text-slate-200 hover:bg-neutral-50 dark:hover:bg-slate-800/80 transition-colors";

export function InspectionWorkspaceLinks({
  inspectionId,
  clientId,
  reportId,
  showCompletenessInbox = false,
  className,
}: Props) {
  const billHref = clientId
    ? `/dashboard/invoices/new?clientId=${encodeURIComponent(clientId)}&inspectionId=${encodeURIComponent(inspectionId)}`
    : `/dashboard/invoices/new?inspectionId=${encodeURIComponent(inspectionId)}`;

  const items = [
    {
      href: reportId ? `/dashboard/reports/${reportId}` : "/dashboard/reports",
      label: reportId ? "This report" : "My Reports",
      icon: FileText,
    },
    {
      href: clientId ? `/dashboard/clients/${clientId}` : "/dashboard/clients",
      label: clientId ? "This client" : "My Clients",
      icon: Users,
    },
    { href: billHref, label: "Get a Bill Out", icon: Receipt },
    { href: "/dashboard/subscription", label: "Account & Billing", icon: CreditCard },
    { href: "/dashboard/help", label: "Help", icon: HelpCircle },
    { href: "/dashboard/inspections/schedule", label: "Job schedule", icon: CalendarDays },
    ...(showCompletenessInbox
      ? [
          {
            href: "/dashboard/operations/completeness-inbox",
            label: "Completeness inbox",
            icon: Inbox,
          },
        ]
      : []),
  ];

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
