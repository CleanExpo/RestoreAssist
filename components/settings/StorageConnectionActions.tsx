"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

/**
 * RA-6942: connect / reconnect / disconnect controls for the storage settings
 * Connection block. Connect and reconnect both drive the existing OAuth start
 * route (GET /api/oauth/google-drive/start) via a full navigation so Google's
 * consent redirect works. Disconnect POSTs to the disconnect route and reloads
 * to reflect the cleared connection state.
 */
export function StorageConnectionActions({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);

  function connect() {
    window.location.href = "/api/oauth/google-drive/start";
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/oauth/google-drive/disconnect", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Google Drive disconnected");
      window.location.reload();
    } catch (err) {
      toast.error("Could not disconnect Google Drive");
      console.error(err);
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Button size="sm" disabled={busy} onClick={connect}>
        Connect Google Drive
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={connect}>
        Reconnect
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={disconnect}>
        {busy ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}
