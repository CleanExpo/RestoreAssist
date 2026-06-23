import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const sessionId = params.session_id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, subscriptionPlan: true },
  });

  if (user.subscriptionStatus === "ACTIVE") {
    return <Confirmation tier={user.subscriptionPlan} />;
  }

  if (!sessionId) redirect("/billing/upgrade");

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  if (checkoutSession.payment_status === "paid") {
    return <PendingActivation sessionId={sessionId} />;
  }

  redirect("/billing/upgrade?cancelled=1");
}

function Confirmation({ tier }: { tier: string | null }) {
  return (
    <main className="container mx-auto max-w-2xl p-8 text-center">
      <h1 className="text-2xl font-semibold">Welcome to {tier ?? "RestoreAssist"}</h1>
      <p className="mt-4 text-muted-foreground">Your subscription is active.</p>
      <Link href="/dashboard" className="mt-8 inline-block rounded bg-brand-navy px-6 py-3 text-white">
        Continue to dashboard
      </Link>
    </main>
  );
}

function PendingActivation({ sessionId }: { sessionId: string }) {
  return (
    <main className="container mx-auto max-w-2xl p-8 text-center">
      <h1 className="text-2xl font-semibold">Activating your subscription…</h1>
      <p className="mt-4 text-muted-foreground">This usually takes a few seconds.</p>
      <PollScript />
      <p className="mt-8 text-sm text-muted-foreground">
        Stuck? Contact support with this reference: <code>{sessionId}</code>
      </p>
    </main>
  );
}

function PollScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var attempts = 0;
            var max = 15;
            var t = setInterval(function() {
              attempts++;
              fetch("/api/billing/trial-status")
                .then(function(r) { return r.json(); })
                .then(function(body) {
                  if (body.data && body.data.subscriptionStatus === "ACTIVE") {
                    clearInterval(t);
                    window.location.reload();
                  } else if (attempts >= max) {
                    clearInterval(t);
                  }
                })
                .catch(function() {});
            }, 2000);
          })();
        `,
      }}
    />
  );
}
