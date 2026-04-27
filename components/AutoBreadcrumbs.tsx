"use client";

/**
 * RA-1569 — auto-breadcrumb driven by `usePathname()`.
 *
 * Drop into any layout under /dashboard or /portal and the component
 * builds a breadcrumb trail from the URL segments, labelling each
 * via `lib/breadcrumb-labels.ts`. Detail pages can override one or
 * more slug labels via the optional `labels` prop so the breadcrumb
 * reads `Invoices / INV-0042` instead of `Invoices / cjz9x…`.
 *
 *   <AutoBreadcrumbs labels={{ [invoice.id]: invoice.invoiceNumber }} />
 *
 * Hidden on the top-level segment (no breadcrumb on /dashboard itself).
 * First crumb is always a link to `/dashboard`; last crumb is the
 * current page and rendered as a non-link Page element per WAI-ARIA.
 */

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { labelForSegment } from "@/lib/breadcrumb-labels";

export interface AutoBreadcrumbsProps {
  /** Map of raw URL segment → friendly label. Overrides the default slug map. */
  labels?: Record<string, string>;
  className?: string;
}

export function AutoBreadcrumbs({ labels, className }: AutoBreadcrumbsProps) {
  const pathname = usePathname() ?? "";

  const crumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length <= 1) return [];

    const acc: { href: string; label: string; isLast: boolean }[] = [];
    let running = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      running += `/${seg}`;
      const isLast = i === segments.length - 1;
      const label = labels?.[seg] ?? labelForSegment(seg);
      acc.push({ href: running, label, isLast });
    }
    return acc;
  }, [pathname, labels]);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {crumbs.map((crumb, idx) => (
          <div
            key={crumb.href}
            className="inline-flex items-center gap-1.5"
          >
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {idx < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default AutoBreadcrumbs;
