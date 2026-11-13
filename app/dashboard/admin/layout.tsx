import { requirePlatformSupportPage } from "@/lib/admin-auth";

/**
 * Segment gate for every /dashboard/admin/** page.
 * DB-revalidates ADMIN so a demoted user with a stale JWT cannot keep the hub.
 * Every self-registered business owner is ADMIN, so the hub is also limited to
 * the platform support allowlist (fails closed when unset), as Governance and
 * Founding Trial already are. A business owner gets not-found.
 */
export default async function AdminSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformSupportPage();
  return children;
}
