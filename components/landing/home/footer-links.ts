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
      { href: "/demo", label: "Book a demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/resources", label: "Resources" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/help", label: "Help centre" },
      { href: "/support", label: "Support" },
      { href: "/login", label: "Log in" },
      {
        href: CLIENT_PORTAL_PUBLIC_CTA.href,
        label: CLIENT_PORTAL_PUBLIC_CTA.label,
      },
    ],
  },
] as const;
