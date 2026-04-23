/**
 * RA-1569 — slug → friendly-label map used by the auto-breadcrumb
 * component on dashboard routes.
 *
 * Philosophy:
 *   - Hand-map the high-traffic slugs (`dashboard`, `invoices`,
 *     `inspections`, etc.) so the breadcrumb reads naturally.
 *   - `[id]`-style dynamic segments render as a truncated id by
 *     default; callers can override via the optional `labels` prop
 *     on `AutoBreadcrumbs` when the detail page has loaded the
 *     actual entity name.
 */

export const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inspections: "Inspections",
  reports: "Reports",
  clients: "Clients",
  invoices: "Invoices",
  estimates: "Estimates",
  integrations: "Integrations",
  team: "Team",
  admin: "Admin",
  subscription: "Subscription",
  settings: "Settings",
  support: "Support",
  analytics: "Analytics",
  contractors: "Contractors",
  "form-templates": "Form templates",
  "pricing-config": "Pricing config",
  "change-password": "Change password",
  "evidence-review": "Evidence review",
  "credit-notes": "Credit notes",
  new: "New",
  edit: "Edit",
  variations: "Variations",
  payments: "Payments",
  templates: "Templates",
  recurring: "Recurring",
  completeness: "Completeness",
  "service-areas": "Service areas",
  reviews: "Reviews",
  profile: "Profile",
  voice: "Voice copilot",
  contents: "Contents",
  photos: "Photos",
  audit: "Audit",
  preview: "Preview",
  share: "Share",
  "version-history": "Version history",
  "authority-forms": "Authority forms",
};

/**
 * Convert a raw URL segment to a display label:
 *   - exact match in BREADCRUMB_LABELS wins
 *   - cuid/ulid-looking segments get shortened to the first 6 chars
 *   - anything else gets Title Case applied on hyphen/underscore splits
 */
export function labelForSegment(segment: string): string {
  const mapped = BREADCRUMB_LABELS[segment];
  if (mapped) return mapped;

  // Short-circuit: cuid (c...) and ulid-like (alphanumeric >= 20 chars)
  // are almost always entity ids — shorten so the breadcrumb doesn't
  // turn into a 25-char hash.
  if (/^[a-z0-9]{20,}$/.test(segment)) {
    return segment.slice(0, 6) + "…";
  }

  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
