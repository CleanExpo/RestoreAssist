import type { Metadata } from "next";

// This route is reached through an unguessable share token, so its URL is the
// only thing standing between the public and the record behind it. The root
// layout sets robots: { index: true, follow: true }, and metadata merges
// shallowly with the deepest segment winning — without this override the page
// would ship an explicit "index, follow" instruction for a secret URL.
export const metadata: Metadata = {
  title: "Capture your property",
  description: "Upload photos and details for your restoration job.",
  robots: { index: false, follow: false },
};

export default function CaptureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
