import { requireAdminPage } from "@/lib/admin-auth";

/**
 * Mission Control is linked from Margot but lived outside the admin segment.
 * Gate it the same way so non-admins never get the chrome.
 */
export default async function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
