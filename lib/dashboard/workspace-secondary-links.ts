/**
 * Cross-links between main workspace destinations (simple nav parity).
 */

import {
  MANAGER_NAV_HREFS,
  simpleNavItems,
} from "@/app/dashboard/nav-config";

export type WorkspaceSecondaryLink = { href: string; label: string };

export const WORKSPACE_LINKS = {
  overview: { href: "/dashboard", label: "Overview" },
  jobs: { href: "/dashboard/inspections", label: "My Jobs" },
  schedule: {
    href: "/dashboard/inspections/schedule",
    label: "Job schedule",
  },
  reports: { href: "/dashboard/reports", label: "My Reports" },
  clients: { href: "/dashboard/clients", label: "My Clients" },
  bill: { href: "/dashboard/invoices/new", label: "Get a Bill Out" },
  invoices: { href: "/dashboard/invoices", label: "Invoices" },
  billing: {
    href: "/dashboard/subscription",
    label: "Account & Billing",
  },
  help: { href: "/dashboard/help", label: "Help" },
  inbox: {
    href: "/dashboard/operations/completeness-inbox",
    label: "Completeness inbox",
  },
} as const satisfies Record<string, WorkspaceSecondaryLink>;

function omit(
  links: WorkspaceSecondaryLink[],
  ...hrefs: string[]
): WorkspaceSecondaryLink[] {
  const skip = new Set(hrefs);
  return links.filter((l) => !skip.has(l.href));
}

/** Default strip for list pages — omits the current page href when provided. */
export function workspaceHubLinks(options?: {
  omitHref?: string;
  includeCompletenessInbox?: boolean;
}): WorkspaceSecondaryLink[] {
  const links: WorkspaceSecondaryLink[] = [
    WORKSPACE_LINKS.overview,
    WORKSPACE_LINKS.jobs,
    WORKSPACE_LINKS.schedule,
    WORKSPACE_LINKS.reports,
    WORKSPACE_LINKS.clients,
    WORKSPACE_LINKS.bill,
    WORKSPACE_LINKS.invoices,
    WORKSPACE_LINKS.billing,
    WORKSPACE_LINKS.help,
  ];
  if (options?.includeCompletenessInbox) {
    links.splice(3, 0, WORKSPACE_LINKS.inbox);
  }
  if (options?.omitHref) {
    return omit(links, options.omitHref);
  }
  return links;
}

export function isManagerOrAdminRole(
  role: string | undefined | null,
): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/** Shortcuts on the overview — mirrors {@link simpleNavItems} (+ manager inbox). */
export function simpleWorkspaceHubLinks(options?: {
  omitHref?: string;
  isManager?: boolean;
}): WorkspaceSecondaryLink[] {
  const links: WorkspaceSecondaryLink[] = simpleNavItems.map((item) => ({
    href: item.href,
    label: item.label,
  }));
  if (options?.isManager) {
    for (const extra of MANAGER_NAV_HREFS) {
      if (!links.some((l) => l.href === extra.href)) {
        links.push({ href: extra.href, label: extra.label });
      }
    }
  }
  if (options?.omitHref) {
    return links.filter((l) => l.href !== options.omitHref);
  }
  return links;
}
