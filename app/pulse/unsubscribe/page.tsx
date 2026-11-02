import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { verifyPulseUnsubscribeToken } from "@/lib/pulse/pulse-unsubscribe-token";

export const dynamic = "force-dynamic";

// Protected only by the secrecy of the URL. It must serve noindex, and
// robots.txt must not Disallow it, or a crawler could never read the noindex.
export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Its own light surface: a client arrives from an email, and the app's dark
// default background would otherwise hide this dark text.
const PAGE_CLASS =
  "min-h-screen bg-slate-50 px-6 py-16 text-center text-slate-800";

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    return verifyPulseUnsubscribeToken(token) !== null;
  } catch {
    return false;
  }
}

// This page never writes on load: mail scanners open links without anyone
// clicking, and that must not unsubscribe a client who asked for nothing.
export default async function PulseUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;

  if (done === "1") {
    return (
      <main className={PAGE_CLASS}>
        <h1 className="mx-auto max-w-md text-xl font-semibold">You are unsubscribed</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
          Automated restoration progress emails will no longer be sent to this
          address by this business. Your contractor can still contact you
          directly about your job.
        </p>
      </main>
    );
  }

  if (!isValidToken(token)) {
    return (
      <main className={PAGE_CLASS}>
        <h1 className="mx-auto max-w-md text-xl font-semibold">Link not valid</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
          This unsubscribe link is invalid or incomplete. Contact your
          restoration provider if you still receive unwanted emails.
        </p>
      </main>
    );
  }

  return (
    <main className={PAGE_CLASS}>
      <h1 className="mx-auto max-w-md text-xl font-semibold">Stop job update emails?</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
        You will no longer get automated progress emails about restoration jobs
        from this business. Your contractor can still contact you directly about
        your job.
      </p>
      <form
        method="post"
        action={`/api/pulse/unsubscribe?token=${encodeURIComponent(token as string)}`}
        className="mt-6"
      >
        <input type="hidden" name="source" value="page" />
        <Button
          type="submit"
          className="bg-slate-800 text-white hover:bg-slate-700"
        >
          Unsubscribe
        </Button>
      </form>
    </main>
  );
}
