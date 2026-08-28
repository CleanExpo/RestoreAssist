import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Restoration Job File Audit Australia | RestoreAssist",
  description:
    "A paid AU/NZ restoration job-file review for water-damage assessment records, moisture documentation, photographs, chronology and report evidence gaps.",
  keywords: [
    "water damage assessment",
    "water damage report",
    "restoration job file audit",
    "restoration documentation review",
    "moisture report",
    "restoration report Australia",
  ],
  alternates: { canonical: "/job-file-audit" },
  openGraph: {
    title: "Restoration Job File Audit | RestoreAssist",
    description:
      "Find evidence, chronology and documentation gaps before they become expensive admin, dispute or payment problems.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
};

export default function JobFileAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
