import type { Metadata } from "next";

// Invitation tokens travel in the query string. Treat this the same as other
// token-gated client routes: crawlable, but never indexable.
export const metadata: Metadata = {
  title: "Accept client portal invitation",
  robots: { index: false, follow: false },
};

export default function PortalSignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
