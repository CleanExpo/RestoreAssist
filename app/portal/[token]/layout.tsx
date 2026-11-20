import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client portal",
  description: "Track the progress of your restoration job.",
  robots: { index: false, follow: false },
};

export default function PortalTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
