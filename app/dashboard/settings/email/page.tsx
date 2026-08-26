"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmailSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leftoverResend, setLeftoverResend] = useState(false);
  const [hasPlatformFallback, setHasPlatformFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/workspace/email-provider");
      if (!res.ok) {
        setLoadError("Failed to load email settings");
        return;
      }
      const data = await res.json();
      setLeftoverResend(!!data.connected);
      setHasPlatformFallback(!!data.hasPlatformFallback);
    } catch {
      setLoadError("Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") void fetchStatus();
  }, [status, router, fetchStatus]);

  const handleDisconnect = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/email-provider", {
        method: "DELETE",
      });
      if (!res.ok) {
        setMessage("Failed to disconnect");
        return;
      }
      setMessage("Removed the leftover Resend key. Outbound email uses Mailtrap.");
      await fetchStatus();
    } catch {
      setMessage("Failed to disconnect");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="p-8 text-neutral-500">Loading email settings…</div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          Email
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          RestoreAssist sends invites, welcome mail, and notifications through
          Mailtrap
          {hasPlatformFallback ? "." : " (not configured on this environment)."}
        </p>
        <p className="text-xs text-neutral-400 mt-2">
          <a
            href="/dashboard/settings/connections"
            className="underline underline-offset-2 hover:text-neutral-600"
          >
            ← All connections
          </a>
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void fetchStatus()}
          >
            Retry
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Status:{" "}
            {hasPlatformFallback
              ? "Mailtrap Sending API"
              : "Mailtrap is not configured"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {leftoverResend && (
            <>
              <p className="text-sm text-neutral-600">
                This organisation still has an unused Resend key stored. It is
                no longer used for sending.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void handleDisconnect()}
              >
                Remove leftover Resend key
              </Button>
            </>
          )}
          {message && <p className="text-sm text-neutral-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
