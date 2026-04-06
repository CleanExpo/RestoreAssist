export const BRAND = {
  name: "RestoreAssist",
  slogan: "One System. Fewer Gaps. More Confidence.",
  tagline: "Inspection. Scoping. Estimating. Connected.",
  description:
    "RestoreAssist is built to systemise reporting, scoping, and estimating for the Australian and New Zealand restoration market. It helps reduce missing information, improve consistency between admin and field teams, and create more confidence for restoration businesses, property owners, and insurance providers.",
  shortDescription:
    "AI-powered damage assessment platform for Australian and New Zealand restoration professionals.",
  cta: {
    primary: { label: "Book a Demo", href: "/contact" },
    secondary: { label: "See How It Works", href: "/how-it-works" },
  },
  meta: {
    title: "RestoreAssist — One System. Fewer Gaps. More Confidence.",
    description:
      "RestoreAssist systemises reporting, scoping, and estimating for Australian and New Zealand restoration businesses. Reduce missing information and improve consistency.",
    ogDescription:
      "One system for reporting, scoping, and estimating in the restoration industry. Built for ANZ contractors, property owners, and insurers.",
  },
  company: {
    legal: "Restore Assist by Unite-Group Nexus Pty Ltd",
    abn: process.env.NEXT_PUBLIC_COMPANY_ABN || "",
  },
} as const;
