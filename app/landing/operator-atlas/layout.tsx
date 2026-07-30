import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home 3 — RestoreAssist",
  description:
    "Alternate home presentation (title card). Same product copy as the live homepage.",
  robots: { index: false, follow: false },
};

export default function OperatorAtlasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
