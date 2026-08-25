import { Metadata } from "next";

/**
 * Solutions page metadata.
 *
 * The rule this page is written to: insurers may appear as an audience for the
 * OUTPUT, never as a user of the software. The previous title and description
 * named "Insurance Adjusters" and "loss adjusters and insurance assessors" as
 * target users, which contradicted the launch positioning ("the software works
 * for the restorer, not the insurer") that is already in customers' inboxes.
 */
export const metadata: Metadata = {
  title: "Solutions for Australian Restoration Contractors",
  description:
    "RestoreAssist solutions for water damage, mould, fire and structural drying. Built for the restoration contractor — documentation your client understands and your insurer can't argue with. IICRC S500:2021 structure. Australia and New Zealand.",
  keywords: [
    "water damage restoration solutions",
    "disaster recovery software",
    "restoration contractor software",
    "mould remediation software",
    "structural drying documentation",
    "IICRC S500 reporting",
    "restoration workflow automation",
  ],
  openGraph: {
    title:
      "Solutions for Australian Restoration Contractors | Restore Assist",
    description:
      "Built for the contractor doing the work. Documentation your client understands and your insurer can't argue with.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/solutions" },
};

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
