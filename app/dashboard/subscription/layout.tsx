import type { ReactNode } from "react";
import { requireDashboardPageAccess } from "@/lib/auth/dashboard-page-access";

// RA-7721 — owner page: refuse roles the sidebar already hides it from.
export default async function Layout({ children }: { children: ReactNode }) {
  await requireDashboardPageAccess("/dashboard/subscription");
  return children;
}
