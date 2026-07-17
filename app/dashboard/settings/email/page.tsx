"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmailSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fromAddress, setFromAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
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
      setConnected(!!data.connected);
      setFromAddress(data.fromAddress ?? "");
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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/email-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, fromAddress }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(
          typeof body.error === "string"
            ? body.error
            : "Failed to save Resend key",
        );
        return;
      }
      setApiKey("");
      setMessage("Resend API key saved.");
      await fetchStatus();
    } catch {
      setMessage("Failed to save Resend key");
    } finally {
      setSaving(false);
    }
  };

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
      setMessage("Disconnected — outbound email uses the platform Resend key.");
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
          Email provider (BYOK)
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Connect your own Resend API key so invites and notifications send from
          your domain. Without a key, RestoreAssist uses the platform Resend
          account{hasPlatformFallback ? "" : " (not configured on this env)"}.
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
            Status: {connected ? "Connected (Resend)" : "Using platform default"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="apiKey">Resend API key</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="re_…"
            />
          </div>
          <div>
            <Label htmlFor="from">From address (optional)</Label>
            <Input
              id="from"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="jobs@yourcompany.com.au"
            />
          </div>
          {message && <p className="text-sm text-neutral-600">{message}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving || !apiKey.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save key"}
            </Button>
            {connected && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
