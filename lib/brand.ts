// Spine-locked positioning per Synthex ceo-foundation.md Brief 4 (CEO 2026-04-30 amendment).
// Core sentence MUST be quoted verbatim across all surfaces (web · app · marketing · docs).
// AI framing follows Q3.1.1 Aid Rule: AI assists, never replaces. "Remove double-handling"
// is the canonical operational benefit phrasing.
export const BRAND = {
  name: "RestoreAssist",
  slogan: "One System. Fewer Gaps. More Confidence.",
  tagline: "Office and Field. One System.",
  description:
    "RestoreAssist is Australia's first Australian-designed full CRM — an Office and Field Management System for the Australian Restoration Industry. Inbuilt IICRC frameworks, WHS policies, and Australian Building Code references remove double-handling between field capture and office processing. Designed in Australia, deployed across Australia and New Zealand.",
  shortDescription:
    "Helps restoration contractors run jobs with less paperwork and more confidence — from first visit to final report.",
  cta: {
    primary: { label: "Get Started", href: "/signup" },
    secondary: { label: "See How It Works", href: "/how-it-works" },
  },
  meta: {
    title: "RestoreAssist — From site to signed report. One system.",
    description:
      "Australian restoration software that helps contractors stay organised, cut admin, and deliver professional reports clients and insurers can trust.",
    ogDescription:
      "Restoration software for contractors who want less paperwork and more confidence — from the first site visit to the final report.",
  },
  company: {
    legal: "Restore Assist by Unite-Group Nexus Pty Ltd",
    abn: process.env.NEXT_PUBLIC_COMPANY_ABN || "",
    // RA-1582 — sellability trust signals. Sourced from env so the
    // displayed contact/address can be swapped without a code change.
    // Fall back to safe defaults (contact email only) for local dev so
    // the footer never shows undefined.
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "",
    supportEmail:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@restoreassist.app",
    securityEmail:
      process.env.NEXT_PUBLIC_SECURITY_EMAIL || "security@restoreassist.app",
  },
} as const;
