"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { TRIAL_SEAT_ENDED_MESSAGE } from "@/lib/billing/trial-seat-copy";

export default function SeatRequiredPage() {
  const { update } = useSession();
  return (
    <main className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Your seat needs paying for</h1>
      <p className="text-sm">{TRIAL_SEAT_ENDED_MESSAGE}</p>
      <div className="flex justify-center gap-2">
        <Button
          onClick={async () => {
            await update();
            window.location.assign("/dashboard");
          }}
        >
          Check again
        </Button>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
