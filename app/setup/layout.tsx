import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace setup",
  description:
    "Configure your RestoreAssist workspace — business details, branding, and integrations.",
  robots: { index: false, follow: false },
};

/**
 * Setup renders a fixed full-viewport wizard (SetupStepper). No padding or
 * card shell here — the stepper owns the entire viewport.
 */
export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
