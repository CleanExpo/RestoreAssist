import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job File Audit Intake | RestoreAssist",
  robots: { index: false, follow: false },
};

export default function JobFileAuditIntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
