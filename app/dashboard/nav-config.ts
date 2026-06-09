import type { LucideIcon } from "lucide-react";
import {
  Plus,
  FileText,
  Users,
  Receipt,
  CreditCard,
  HelpCircle,
} from "lucide-react";

/**
 * Sidebar navigation configuration for the dashboard.
 *
 * Two surfaces are exposed:
 *
 *  - {@link simpleNavItems}: a short, plain-language list shown by default to
 *    every non-technician user. "Simple mode" is the default experience — a
 *    user only sees the full, dense nav once they opt into Advanced mode.
 *  - {@link buildAdvancedNavGroups}: the existing 24-item nav re-organised
 *    under labelled section headers so every destination is still reachable,
 *    just grouped instead of one flat list.
 *
 * Mode is driven by the user's persisted `experienceMode` (read/written via
 * `/api/user/experience-mode`):
 *   - `APPRENTICE` | null | undefined  => Simple mode
 *   - `EXPERIENCED`                     => Advanced mode
 * New accounts default to Simple.
 *
 * This module owns *only* the static parts of the nav (labels/hrefs/icons).
 * Role/billing/admin gating and the rendering itself remain in
 * `app/dashboard/layout.tsx`.
 */

export type ExperienceMode = "APPRENTICE" | "EXPERIENCED";

/** A single sidebar nav item. Shape matches the existing layout items. */
export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  /** Highlighted call-to-action styling (e.g. "New Report"). */
  highlight?: boolean;
  /** Special palette (e.g. the gold Upgrade item). */
  special?: boolean;
  /** Admin-only item — gated + visually subdued in the layout. */
  adminOnly?: boolean;
}

/** A labelled group of nav items, rendered under a section header. */
export interface NavGroup {
  /** Section header shown above the group (uppercase in the UI). */
  label: string;
  items: NavItem[];
}

/**
 * Resolve the active mode from the persisted value. Anything other than an
 * explicit `EXPERIENCED` opt-in (including null/undefined for brand-new
 * accounts) maps to Simple mode.
 */
export function isAdvancedMode(
  experienceMode: ExperienceMode | null | undefined,
): boolean {
  return experienceMode === "EXPERIENCED";
}

/**
 * SIMPLE mode — the default. Six plain-language entries, each pointing at a
 * real, existing route under `app/dashboard/**`.
 */
export const simpleNavItems: NavItem[] = [
  {
    icon: Plus,
    label: "Make a Report",
    href: "/dashboard/reports/new",
    highlight: true,
  },
  { icon: FileText, label: "My Reports", href: "/dashboard/reports" },
  { icon: Users, label: "My Clients", href: "/dashboard/clients" },
  // "Get a Bill Out" -> the canonical *standalone* billing entry point.
  // `/dashboard/invoices/new` is a self-contained create form: a user can
  // land there and bill any client immediately (manual or client-linked).
  // The report→invoice bridge at `/dashboard/restoration-documents/invoice/new`
  // is intentionally NOT used here because it requires a `?reportId=` query
  // param to seed from a report — without report context that page has nothing
  // to invoice, so it is not a valid "just bill someone" entry point.
  { icon: Receipt, label: "Get a Bill Out", href: "/dashboard/invoices/new" },
  // "Account & Billing" merges the Subscription/Upgrade concept into one
  // plain-language entry pointing at the subscription management page.
  {
    icon: CreditCard,
    label: "Account & Billing",
    href: "/dashboard/subscription",
  },
  { icon: HelpCircle, label: "Help", href: "/dashboard/help" },
];

/**
 * Build the ADVANCED-mode grouped nav from the flat list the layout already
 * computes (which carries role/billing/admin gating). Every item from the flat
 * list is placed into exactly one labelled group; any item that doesn't match a
 * known destination (e.g. a future addition) falls through into a "More" group
 * so nothing is ever silently dropped.
 *
 * Grouping is keyed by href so it stays stable even if labels change.
 */
export function buildAdvancedNavGroups(flatItems: NavItem[]): NavGroup[] {
  // Group render order. The HREF_TO_GROUP map below assigns each destination
  // to exactly one of these.
  const GROUP_ORDER = [
    "Jobs",
    "Documents & Billing",
    "Compliance & WHS",
    "Insights",
    "Setup",
    "Admin",
  ] as const;

  type GroupLabel = (typeof GROUP_ORDER)[number];

  const HREF_TO_GROUP: Record<string, GroupLabel> = {
    // Jobs — Reports, Inspections, Clients (+ Dashboard home, Field Mode)
    "/dashboard": "Jobs",
    "/dashboard/reports/new": "Jobs",
    "/dashboard/reports": "Jobs",
    "/dashboard/inspections": "Jobs",
    "/dashboard/clients": "Jobs",
    "/dashboard/field": "Jobs",
    // Documents & Billing — Invoices, Restoration Documents, Quote Generator,
    // Subscription/Upgrade (+ Media Library)
    "/dashboard/invoices": "Documents & Billing",
    "/dashboard/restoration-documents": "Documents & Billing",
    "/dashboard/quote": "Documents & Billing",
    "/dashboard/subscription": "Documents & Billing",
    "/dashboard/pricing": "Documents & Billing",
    "/dashboard/media": "Documents & Billing",
    // Compliance & WHS
    "/dashboard/whs": "Compliance & WHS",
    "/dashboard/governance": "Compliance & WHS",
    // Insights — Analytics, Claims Analysis (+ Interviews)
    "/dashboard/analytics": "Insights",
    "/dashboard/claims-analysis": "Insights",
    "/dashboard/interviews": "Insights",
    // Setup — Team, Integrations, Pricing Configuration, Settings (+ Feedback,
    // Tutorials, Help)
    "/dashboard/team": "Setup",
    "/dashboard/integrations": "Setup",
    "/dashboard/pricing-config": "Setup",
    "/dashboard/settings": "Setup",
    "/dashboard/feedback": "Setup",
    "/dashboard/learn": "Setup",
    "/dashboard/help": "Setup",
    // Admin (also caught by the adminOnly flag below)
    "/dashboard/admin": "Admin",
    "/dashboard/admin/pilot": "Admin",
    "/dashboard/admin/content-gate": "Admin",
  };

  const groups: Record<GroupLabel, NavItem[]> = {
    Jobs: [],
    "Documents & Billing": [],
    "Compliance & WHS": [],
    Insights: [],
    Setup: [],
    Admin: [],
  };
  const overflow: NavItem[] = [];

  for (const item of flatItems) {
    if (item.adminOnly) {
      groups.Admin.push(item);
      continue;
    }
    const groupLabel = HREF_TO_GROUP[item.href];
    if (groupLabel) {
      groups[groupLabel].push(item);
    } else {
      // Unknown destination (e.g. a newly added nav item not yet grouped):
      // keep it reachable rather than dropping it.
      overflow.push(item);
    }
  }

  const result: NavGroup[] = GROUP_ORDER.map((label) => ({
    label,
    items: groups[label],
  })).filter((g) => g.items.length > 0);

  if (overflow.length > 0) {
    result.push({ label: "More", items: overflow });
  }

  return result;
}
