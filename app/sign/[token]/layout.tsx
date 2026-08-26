import type { Metadata } from "next";

// This route is reached through an unguessable share token, so its URL is the
// only thing standing between the public and the record behind it. The root
// layout sets robots: { index: true, follow: true }, and metadata merges
// shallowly with the deepest segment winning — without this override the page
// would ship an explicit "index, follow" instruction for a secret URL.
export const metadata: Metadata = {
  title: "Signature request",
  description: "Review and sign a document shared with you.",
  robots: { index: false, follow: false },
};

/** Pass-through layout; it exists so the noindex metadata above applies to this route. */
export default function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
