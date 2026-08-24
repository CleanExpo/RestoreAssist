import { requireAdminPage } from "@/lib/admin-auth";

/**
 * Segment gate for every /dashboard/admin/** page.
 * DB-revalidates ADMIN so a demoted user with a stale JWT cannot keep the hub.
 */
export default async function AdminSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
