/**
 * RA-1564 — shared empty-state treatment.
 *
 * Drop this into every list page (clients, invoices, estimates,
 * inspections, reports, integrations) in place of the ad-hoc "No
 * results" blocks that drifted across surfaces.
 *
 *   <EmptyState
 *     icon={<Users className="h-10 w-10" />}
 *     title="No clients yet"
 *     description="Start by adding your first client to begin creating inspections."
 *     primaryAction={{ label: "Add client", href: "/dashboard/clients/new" }}
 *   />
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "default" | "outline";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} size="sm">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center py-16 px-6 text-center " +
        (className ?? "")
      }
    >
      {icon ? (
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      {description ? (
        <p className="mb-6 max-w-sm text-sm text-slate-600 dark:text-slate-300">
          {description}
        </p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? (
            <ActionButton action={primaryAction} variant="default" />
          ) : null}
          {secondaryAction ? (
            <ActionButton action={secondaryAction} variant="outline" />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
