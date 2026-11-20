import { requireDashboardPageAccess } from "@/lib/auth/dashboard-page-access";

export default async function CompletenessInboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardPageAccess("/dashboard/operations/completeness-inbox");
  return children;
}
