"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability";

/**
 * Where Stripe sends an owner who left the invite form to pay. Confirms the
 * purchase before anything else, because a webhook can arrive after the owner
 * does, then puts them back on the invite with their entry restored. A failed
 * confirmation never reads as success and never moves them on.
 */
export function TeamInviteReturn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update } = useSession();
  const addon = searchParams?.get("addon");
  const sessionId = searchParams?.get("session_id");
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const startedAttempt = useRef<number | null>(null);

  useEffect(() => {
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    setFailed(false);

    void (async () => {
      try {
        if (!sessionId) throw new Error("Checkout return had no session id");
        const res = await fetch(
          addon ? "/api/addons/verify" : "/api/verify-subscription",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          },
        );
        if (!res.ok) throw new Error(`Checkout verify answered ${res.status}`);
        await update();
        router.replace("/dashboard/team?invite=1");
      } catch (error) {
        setFailed(true);
        await reportClientError(error, {
          route: "/dashboard/success",
          stage: "team-invite-return",
        });
      }
    })();
  }, [attempt, addon, sessionId, update, router]);

  if (failed) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center" role="alert">
        <p className="text-sm">
          We couldn&apos;t confirm your purchase yet. Your invite is saved, and
          you won&apos;t be charged again by trying once more.
        </p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    );
  }

  return (
    <p className="p-8 text-center text-sm" role="status">
      Confirming your purchase...
    </p>
  );
}
