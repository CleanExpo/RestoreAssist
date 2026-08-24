import { requireAdminPage } from "@/lib/admin-auth";
import { MargotSectionChrome } from "@/components/admin/MargotSectionChrome";

/**
 * Shared chrome for /dashboard/margot and sub-routes.
 * Server layout re-validates ADMIN in the DB before any Margot UI loads.
 */
export default async function MargotSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return <MargotSectionChrome>{children}</MargotSectionChrome>;
}
