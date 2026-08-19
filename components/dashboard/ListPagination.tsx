"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared page size for Clients / Reports (native + synced). */
export const DASHBOARD_LIST_PAGE_SIZE = 20;

function pageWindow(current: number, totalPages: number, max = 5): number[] {
  if (totalPages <= max) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(totalPages, start + max - 1);
  start = Math.max(1, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Label for the count line, e.g. "clients" / "reports" / "jobs". */
  noun?: string;
  className?: string;
}

/**
 * Compact prev/next + page numbers for dashboard list tables.
 * Hidden when there are no items or only one page.
 */
export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = "items",
  className,
}: ListPaginationProps) {
  const totalPages = Math.ceil(total / pageSize) || 0;
  if (total === 0 || totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const pages = pageWindow(safePage, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-3",
        className,
      )}
      role="navigation"
      aria-label="Pagination"
    >
      <p
        className={cn(
          "text-sm",
          "text-neutral-600 dark:text-slate-300",
        )}
      >
        Showing {start}–{end} of {total} {noun}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          aria-label="Previous page"
          className={cn(
            "px-3 py-1.5 border rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-1",
            "border-neutral-300 dark:border-slate-700",
            "hover:bg-neutral-100 dark:hover:bg-slate-800",
            "text-neutral-700 dark:text-slate-200",
          )}
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        {pages[0] > 1 && (
          <span
            className="px-2 py-1.5 text-sm text-neutral-500 dark:text-slate-500"
            aria-hidden
          >
            …
          </span>
        )}
        {pages.map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => onPageChange(pageNum)}
            aria-label={`Page ${pageNum}`}
            aria-current={pageNum === safePage ? "page" : undefined}
            className={cn(
              "min-w-[2.25rem] px-3 py-1.5 rounded-lg transition-colors text-sm",
              pageNum === safePage
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                : cn(
                    "border border-neutral-300 dark:border-slate-700",
                    "hover:bg-neutral-100 dark:hover:bg-slate-800",
                    "text-neutral-700 dark:text-slate-200",
                  ),
            )}
          >
            {pageNum}
          </button>
        ))}
        {pages[pages.length - 1]! < totalPages && (
          <span
            className="px-2 py-1.5 text-sm text-neutral-500 dark:text-slate-500"
            aria-hidden
          >
            …
          </span>
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          aria-label="Next page"
          className={cn(
            "px-3 py-1.5 border rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-1",
            "border-neutral-300 dark:border-slate-700",
            "hover:bg-neutral-100 dark:hover:bg-slate-800",
            "text-neutral-700 dark:text-slate-200",
          )}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
