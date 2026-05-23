import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FeatureHealthCard } from '@/components/setup/FeatureHealthCard';
import { StorageMirrorHealthTile } from '@/components/settings/StorageMirrorHealthTile';

export const dynamic = 'force-dynamic';

export default async function WorkspaceHealthPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-4">
      <h1 className="text-2xl font-semibold">Workspace health</h1>
      <p className="text-muted-foreground text-sm">
        Live status of every capability your workspace depends on. Anything red? Tell us.
      </p>
      <FeatureHealthCard postActivation />
      <StorageMirrorHealthTile />
    </main>
  );
}
