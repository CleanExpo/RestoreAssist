import { verifyPulseUnsubscribeToken } from "@/lib/pulse/pulse-unsubscribe-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PulseUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const clientId = token ? verifyPulseUnsubscribeToken(token) : null;

  if (!clientId) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-slate-800">
        <h1 className="text-xl font-semibold">Link not valid</h1>
        <p className="mt-3 text-sm text-slate-600">
          This unsubscribe link is invalid or incomplete. Contact your
          restoration provider if you still receive unwanted emails.
        </p>
      </main>
    );
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { pulseOptOut: true },
  });

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center text-slate-800">
      <h1 className="text-xl font-semibold">You are unsubscribed</h1>
      <p className="mt-3 text-sm text-slate-600">
        Automated restoration progress emails will no longer be sent to this
        client record. Your contractor can still contact you directly about
        your job.
      </p>
    </main>
  );
}
