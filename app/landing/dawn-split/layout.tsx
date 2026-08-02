import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dawn Split (archive) — RestoreAssist",
  description:
    "Archived homepage presentation (Dawn Split). Kept for reference; not the live homepage.",
  robots: { index: false, follow: false },
};

export default function DawnSplitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
