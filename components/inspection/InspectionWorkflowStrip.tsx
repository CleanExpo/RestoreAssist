"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  buildInspectionWorkflowLinks,
  type InspectionWorkflowLink,
} from "@/lib/dashboard/inspection-workflow-links";

type Props = {
  inspectionId: string;
  status: string;
  reportId?: string | null;
  clientId?: string | null;
};

function linkClass(link: InspectionWorkflowLink, pathname: string) {
  const active =
    !link.current && pathname.replace(/\/$/, "") === link.href.replace(/\/$/, "");
  return cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
    link.current &&
      "border-cyan-500/50 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 cursor-default pointer-events-none",
    !link.current &&
      link.emphasis &&
      "border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-700 dark:border-cyan-500",
    !link.current &&
      !link.emphasis &&
      !active &&
      "border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
    !link.current && !link.emphasis && active &&
      "border-neutral-300 bg-neutral-100 font-semibold dark:border-slate-600 dark:bg-slate-800",
  );
}

export function InspectionWorkflowStrip({
  inspectionId,
  status,
  reportId,
  clientId,
}: Props) {
  const pathname = usePathname() ?? "";
  const links = buildInspectionWorkflowLinks({
    inspectionId,
    status,
    reportId,
    clientId,
  });

  return (
    <nav
      aria-label="Job workflow"
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
    >
      {links.map((link) =>
        link.current ? (
          <span
            key={link.label}
            className={linkClass(link, pathname)}
            aria-current="page"
          >
            {link.label}
          </span>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className={linkClass(link, pathname)}
            aria-current={
              pathname.replace(/\/$/, "") === link.href.replace(/\/$/, "")
                ? "page"
                : undefined
            }
          >
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
