import { requirePlatformSupportPage } from "@/lib/admin-auth";
import { MargotSectionChrome } from "@/components/admin/MargotSectionChrome";

/**
 * Shared chrome for /dashboard/margot and sub-routes.
 * Server layout re-validates ADMIN in the DB before any Margot UI loads, then
 * requires the platform support allowlist (fails closed when unset): Margot is
 * founder tooling and every self-registered business owner is ADMIN. A
 * business owner gets not-found.
 */
export default async function MargotSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformSupportPage();
  return <MargotSectionChrome>{children}</MargotSectionChrome>;
}
