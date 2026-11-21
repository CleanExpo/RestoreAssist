import { CLIENT_PORTAL_PUBLIC_CTA } from "@/lib/portal/canonical-entry";

/**
 * Link columns for the public marketing footer (LandingFooter).
 *
 * Kept in its own module so `__tests__/footer-links.test.ts` can walk every
 * href and fail when one points at a route that does not exist (RA-8403).
 */
export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/resources", label: "Resources" },
      { href: "/login", label: "Log in" },
      {
        href: CLIENT_PORTAL_PUBLIC_CTA.href,
        label: CLIENT_PORTAL_PUBLIC_CTA.label,
      },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;
