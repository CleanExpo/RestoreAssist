import { requirePlatformSupportPage } from "@/lib/admin-auth";

/**
 * The support console is RestoreAssist staff only. Every self-registered
 * business owner is an ADMIN, so the check is the platform allowlist, run on
 * the server before any support UI reaches the RSC payload.
 */
export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformSupportPage();
  return children;
}
