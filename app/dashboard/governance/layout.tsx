import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";

/**
 * Segment gate for Override Governance — Prisma reads on the page must not
 * run for stale JWT admins. RA-8043c: the reports are platform-wide, so only
 * the platform support allowlist may open the page, never a firm's ADMIN.
 */
export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminPage();
  if (!isPlatformSupportOperator(user.id)) notFound();
  return children;
}
