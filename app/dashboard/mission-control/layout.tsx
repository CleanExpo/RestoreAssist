import { requirePlatformSupportPage } from "@/lib/admin-auth";

/**
 * Mission Control (Margot health, Nexus context, ops board, worker health) is
 * RestoreAssist staff work. `role: "ADMIN"` is every self-registered business
 * owner (RA-7647), so requireAdminPage() alone let any owner see the page
 * shell. Require the PLATFORM_SUPPORT_USER_IDS allowlist like the admin,
 * margot and governance segments: an owner not on it gets notFound(), and an
 * unset allowlist refuses everyone (RA-8420).
 */
export default async function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformSupportPage();
  return children;
}
