/**
 * SP-E: Storage settings page.
 *
 * Shows:
 *   - Connection block (provider, connected-as email)
 *   - Mirror queue stats + table (last 50 jobs)
 *   - Retry button on FAILED rows
 *
 * Server component reads the org connection state; client-side fetch
 * lazy-loads the queue table so retries can update optimistically
 * without a full page reload.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MirrorJobsTable } from "@/components/settings/MirrorJobsTable";
import { RestoreFromDrivePanel } from "@/components/settings/RestoreFromDrivePanel";
import { RestoreJobsTable } from "@/components/settings/RestoreJobsTable";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Storage</h1>
        <p className="text-sm text-muted-foreground">
          You need to belong to an organisation to configure storage.
        </p>
      </main>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      storageProvider: true,
      storageProviderAccountEmail: true,
      ownerId: true,
    },
  });

  const isOwner = org?.ownerId === session.user.id;

  const connected =
    org?.storageProvider === "GOOGLE_DRIVE" &&
    Boolean(org.storageProviderAccountEmail);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Storage</h1>
        <p className="text-sm text-muted-foreground">
          Where RestoreAssist mirrors closed-job evidence packages and
          working files. Supabase remains the primary store; the queue
          below pushes a background copy to your provider.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">Connection</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-muted px-3 py-1 font-medium">
            {org?.storageProvider ?? "SUPABASE"}
          </span>
          {connected ? (
            <span className="text-success">
              Connected as {org?.storageProviderAccountEmail}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Not connected — visit the setup wizard to link Google Drive.
            </span>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">Mirror queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 50 jobs. The cron tick drains the queue every minute.
        </p>
        <div className="mt-4">
          <MirrorJobsTable />
        </div>
      </section>

      {isOwner && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-medium">Restore from Drive</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Re-hydrate original files lost from primary storage using your
            connected Google Drive. Non-destructive by default.
          </p>
          <div className="mt-4 space-y-4">
            <RestoreFromDrivePanel />
            <RestoreJobsTable />
          </div>
        </section>
      )}
    </main>
  );
}
