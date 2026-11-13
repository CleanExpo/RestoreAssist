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
    "inline-flex min-h-9 shrink-0 items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
    link.current &&
      "border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 cursor-default pointer-events-none font-semibold",
    !link.current &&
      link.emphasis &&
      "border-cyan-500/50 text-cyan-800 dark:text-cyan-200 bg-cyan-50/90 dark:bg-cyan-950/40 hover:bg-cyan-100/90 dark:hover:bg-cyan-950/60",
    !link.current &&
      !link.emphasis &&
      !active &&
      "border-transparent text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800/80",
    !link.current &&
      !link.emphasis &&
      active &&
      "border-neutral-200 bg-neutral-50 font-medium dark:border-slate-600 dark:bg-slate-800/80",
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
      className="flex flex-wrap gap-1.5 sm:gap-2"
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
