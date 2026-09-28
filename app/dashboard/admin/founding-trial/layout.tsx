import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";

/**
 * RA-7721 — the Founding Trial grant is RestoreAssist support-staff work.
 * The parent /dashboard/admin layout admits any tenant ADMIN (every firm that
 * self-registers is one), so this segment also requires the platform-support
 * allowlist, which fails closed when PLATFORM_SUPPORT_USER_IDS is unset. The
 * API refuses the same callers; this keeps a firm's admin from seeing the form.
 */
export default async function FoundingTrialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminPage();
  if (!isPlatformSupportOperator(user.id)) notFound();
  return children;
}
