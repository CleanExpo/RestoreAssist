import { Metadata } from "next";
import { MarketingShell } from "@/components/landing/home/MarketingShell";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export const metadata: Metadata = {
  title: "Blog - Restoration Industry Insights & Tips",
  description:
    "Articles and guides on water damage restoration, the IICRC standards, restoration reporting best practices, and industry news for Australian restoration professionals.",
  keywords: [
    "restoration blog",
    "water damage restoration tips",
    "IICRC standards articles",
    "restoration industry news",
    "restoration reporting guides",
  ],
  openGraph: {
    title: "Blog - RestoreAssist",
    description:
      "Restoration industry insights, compliance guides, and best practices for Australian professionals.",
    type: "website",
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  alternates: { canonical: "/blog" },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
