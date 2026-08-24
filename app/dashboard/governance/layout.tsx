import { requireAdminPage } from "@/lib/admin-auth";

/**
 * Segment gate for Override Governance — Prisma reads on the page must not
 * run for stale JWT admins.
 */
export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
