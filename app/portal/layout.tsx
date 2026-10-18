import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Client portal",
    template: "%s · RestoreAssist client portal",
  },
  description:
    "Secure homeowner portal to view your restoration claim, share photos, and complete approvals.",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return children;
}
