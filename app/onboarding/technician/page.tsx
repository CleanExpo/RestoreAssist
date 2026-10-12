import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * RA-P1-1 — invited technician landing (not the owner setup wizard).
 * Middleware sends TECHNICIAN users here when the org is already activated.
 */
export default async function TechnicianOnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "TECHNICIAN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Team invite
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Welcome to the field workspace
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your manager&apos;s business is already set up. Add your IICRC
          credentials on the dashboard to unlock attestations, then open your
          assigned inspections from the field tab.
        </p>
      </div>
      <Link
        href="/dashboard?firstRun=tech"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Go to dashboard
      </Link>
    </main>
  );
}
