/**
 * RA-1565 — canonical status pill.
 *
 * Unifies the drifting per-domain badge colours (invoice statuses are
 * amber for Draft in one place, grey elsewhere; inspection Draft pills
 * use a different shade again). Maps a `tone` → Tailwind class set so
 * every badge across the app shares a small, intentional palette:
 *
 *   neutral  — grey      (Draft, Pending, Unknown)
 *   info     — sky       (Scheduled, In Progress, Submitted)
 *   success  — emerald   (Paid, Completed, Approved, Synced)
 *   warning  — amber     (Overdue, Needs review, Sync failed)
 *   danger   — rose      (Rejected, Failed, Cancelled)
 *
 * Non-styling responsibility stays with the caller — this component
 * does not know an invoice's status vocabulary, only how to render a
 * pill in the chosen tone.
 */

import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  info: "bg-info-subtle text-info-subtle-foreground",
  success: "bg-success-subtle text-success-subtle-foreground",
  warning: "bg-warning-subtle text-warning-subtle-foreground",
  danger: "bg-destructive-subtle text-destructive-subtle-foreground",
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  /** Optional screen-reader label if `children` is a symbol/icon. */
  ariaLabel?: string;
}

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  ariaLabel,
}: StatusBadgeProps) {
  return (
    <span
      aria-label={ariaLabel}
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
        TONE_CLASSES[tone] +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </span>
  );
}

export default StatusBadge;
