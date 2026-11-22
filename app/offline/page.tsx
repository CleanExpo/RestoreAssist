import type { Metadata } from "next";
import Link from "next/link";
import { OfflineCapture } from "./OfflineCapture";

/**
 * /offline — the service worker's offline fallback (public/sw.js).
 *
 * The SW precaches this URL signed-out on install and answers a failed private
 * navigation with it, so it must stay static, public and outside every proxy.ts
 * auth gate. Copy describes what the offline queue really does: captures are
 * kept in this browser and replayed once the device is online and the account
 * has been verified again (lib/nir-sync-queue.ts, lib/offline/account-boundary.ts).
 *
 * RA-7877: <OfflineCapture/> lets a technician who signed in online recently
 * start a claim here with no signal. The page itself stays static and public; the
 * capture form decides at run time, from the device copy of the identity.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline | RestoreAssist",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="flex w-full flex-col items-center text-center max-w-md">
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
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-harbour-500 hover:bg-brand-harbour-600 text-white rounded-lg font-medium transition-colors"
        >
          Try again
        </Link>
        <OfflineCapture />
      </div>
    </div>
  );
}
