import type { Metadata } from "next";
import Link from "next/link";

/**
 * /offline — the service worker's offline fallback (public/sw.js).
 *
 * The SW precaches this URL signed-out on install and answers a failed private
 * navigation with it, so it must stay static, public and outside every proxy.ts
 * auth gate. Copy describes what the offline queue really does: captures are
 * kept in this browser and replayed once the device is online and the account
 * has been verified again (lib/nir-sync-queue.ts, lib/offline/account-boundary.ts).
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline | RestoreAssist",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">You are offline</h1>
        <p className="text-slate-400 mb-4">
          This page needs a connection to load. Readings, photos and notes you
          already saved on this device are kept here.
        </p>
        <p className="text-slate-400 mb-8">
          When you are back online, sign in if asked. Once your account is
          verified, saved work is sent automatically.
        </p>
        <Link
          href="/dashboard/field"
          className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
