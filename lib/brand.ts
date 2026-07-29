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
    "Australia's first Australian-designed restoration CRM — office and field management with inbuilt IICRC, WHS, and building-code workflows for AU and NZ.",
  cta: {
    primary: { label: "Get Started", href: "/signup" },
    secondary: { label: "See How It Works", href: "/how-it-works" },
  },
  meta: {
    title:
      "RestoreAssist — Australian Restoration CRM | Field, Reports & Compliance",
    description:
      "Australian-designed restoration CRM for office and field. Capture on site, produce IICRC S500 reports, invoice with GST confidence, and get client approvals — one system across Australia and New Zealand.",
    ogDescription:
      "One system for Australian restoration: field capture, IICRC-aligned reports, GST invoicing, and client approvals. Built for AU & NZ — fewer gaps, more confidence.",
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
