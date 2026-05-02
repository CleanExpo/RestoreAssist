// Spine-locked positioning per Synthex ceo-foundation.md Brief 4 (CEO 2026-04-30 amendment).
// Core sentence MUST be quoted verbatim across all surfaces (web · app · marketing · docs).
// AI framing follows Q3.1.1 Aid Rule: AI assists, never replaces. "Remove double-handling"
// is the canonical operational benefit phrasing.
export const BRAND = {
  name: "RestoreAssist",
  slogan: "One System. Fewer Gaps. More Confidence.",
  tagline: "Office and Field. One System.",
  description:
    "RestoreAssist is Australia's first Australian-designed full CRM — Office and Field Management System designed specifically for the Australian Restoration Industry. Inbuilt IICRC frameworks, WHS policies, and Australian Building Code references remove double-handling between field capture and office processing. AI assists administration and field technicians; the decisions stay with the operator. Designed in Australia, deployed across Australia and New Zealand.",
  shortDescription:
    "Australia's first Australian-designed full CRM — Office and Field Management System for the Australian Restoration Industry.",
  cta: {
    primary: { label: "Get Started", href: "/signup" },
    secondary: { label: "See How It Works", href: "/how-it-works" },
  },
  meta: {
    title: "RestoreAssist — Australia's first Australian-designed Restoration CRM",
    description:
      "Australia's first Australian-designed full CRM — Office and Field Management System for the Australian Restoration Industry. Inbuilt IICRC, WHS, and Australian Building Code compliance. AI assists, never replaces.",
    ogDescription:
      "Australia's first Australian-designed full CRM. Office + Field unified. Inbuilt IICRC, WHS, Australian Building Code. AI assists administration and field technicians.",
  },
  company: {
    legal: "Restore Assist by Unite-Group Nexus Pty Ltd",
    abn: process.env.NEXT_PUBLIC_COMPANY_ABN || "",
  },
} as const;
