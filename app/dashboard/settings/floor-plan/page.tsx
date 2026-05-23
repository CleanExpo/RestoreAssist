"use client";

/**
 * RA-2967 — Workspace setting: auto-fetch floor plan at inspection creation.
 *
 * Toggle controls Workspace.autoFetchFloorPlanOnInspection. When ON, the
 * inspection detail page passes autoFetch=true to FloorPlanUnderlayLoader,
 * so a tech sees the underlay (or a loading state) the first time they open
 * an inspection that has a propertyAddress.
 */

import { useEffect, useState } from "react";
import { Loader2, Map } from "lucide-react";
import toast from "react-hot-toast";

import { Switch } from "@/components/ui/switch";

interface WorkspaceSettings {
  autoFetchFloorPlanOnInspection: boolean;
}

export default function FloorPlanSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace/settings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          settings: WorkspaceSettings;
        };
        if (cancelled) return;
        setAutoFetch(json.settings.autoFetchFloorPlanOnInspection);
      } catch (err) {
        if (!cancelled) {
          toast.error("Failed to load workspace settings");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(next: boolean) {
    const previous = autoFetch;
    setAutoFetch(next);
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFetchFloorPlanOnInspection: next }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      toast.success(
        next
          ? "Auto-fetch enabled for new inspections"
          : "Auto-fetch disabled",
      );
    } catch (err) {
      setAutoFetch(previous);
      toast.error("Failed to save setting");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <Map className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Floor Plan Settings</h1>
          <p className="text-sm text-muted-foreground">
            Workspace-wide controls for the property floor plan underlay.
          </p>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-base font-medium">
              Auto-fetch floor plan at inspection creation
            </h2>
            <p className="text-sm text-muted-foreground">
              When enabled, the floor plan underlay attempts to load
              automatically the first time a technician opens an inspection
              with a property address. When disabled, technicians fetch or
              upload the plan manually.
            </p>
            <p className="text-xs text-muted-foreground">
              Defaults to off. Existing inspections are unaffected; this only
              changes the load behaviour on first open.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={autoFetch}
                  onCheckedChange={handleToggle}
                  disabled={saving}
                  aria-label="Auto-fetch floor plan at inspection creation"
                />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
