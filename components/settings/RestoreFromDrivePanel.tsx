"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

type Mode = "MISSING" | "FORCE";

export function RestoreFromDrivePanel() {
  const [mode, setMode] = useState<Mode>("MISSING");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    try {
      const res = await fetch("/api/storage/restore?scope=org");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { fileCount: number } };
      setCount(json.data.fileCount);
    } catch (err) {
      toast.error("Could not compute restore preview");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/storage/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "org", mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { enqueued: number } };
      toast.success(
        `Queued ${json.data.enqueued} file(s) to restore — runs on the minute tick`,
      );
      setCount(null);
    } catch (err) {
      toast.error("Restore failed to start");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={mode === "MISSING"}
            onChange={() => setMode("MISSING")}
          />
          Only missing files
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={mode === "FORCE"}
            onChange={() => setMode("FORCE")}
          />
          Overwrite all (force)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={preview}>
          {busy ? "Working…" : "Preview"}
        </Button>
        {count !== null && (
          <>
            <span className="text-sm">{count} file(s) restorable from Drive</span>
            <Button size="sm" disabled={busy || count === 0} onClick={confirm}>
              Restore from Drive
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
