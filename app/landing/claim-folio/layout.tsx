import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home 2 — RestoreAssist",
  description:
    "Alternate home presentation (claim ledger). Same product copy as the live homepage.",
  robots: { index: false, follow: false },
};

export default function ClaimFolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
