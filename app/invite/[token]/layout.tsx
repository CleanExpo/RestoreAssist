import type { Metadata } from "next";

// This route is reached through an unguessable share token, so its URL is the
// only thing standing between the public and the record behind it. The root
// layout sets robots: { index: true, follow: true }, and metadata merges
// shallowly with the deepest segment winning — without this override the page
// would ship an explicit "index, follow" instruction for a secret URL.
export const metadata: Metadata = {
  title: "Team invitation",
  description: "Accept your invitation to a RestoreAssist workspace.",
  robots: { index: false, follow: false },
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
