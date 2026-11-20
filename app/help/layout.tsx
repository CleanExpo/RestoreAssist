import { Metadata } from "next";
import { MarketingShell } from "@/components/landing/home/MarketingShell";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export const metadata: Metadata = {
  title: "Help & Support - RestoreAssist",
  description:
    "Get help with RestoreAssist: FAQs, guides, and support for restoration report software. Australian restoration professionals.",
  keywords: [
    "RestoreAssist help",
    "restoration software support",
    "restoration report help",
    "software documentation",
  ],
  openGraph: {
    title: "Help & Support - RestoreAssist",
    description:
      "FAQs, guides, and support for RestoreAssist restoration software.",
    type: "website",
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  alternates: { canonical: "/help" },
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
