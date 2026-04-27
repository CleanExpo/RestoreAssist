"use client";

/**
 * RA-1459 — Cloud Mirror Provider picker.
 *
 * Users pick where RestoreAssist copies their viewing-quality evidence
 * files after they're produced. Drive is the only provider shipping in
 * v1; OneDrive and iCloud render disabled with "Coming soon — AU data
 * centres" copy.
 *
 * State is persisted via `/api/user/cloud-mirror`. The evidence pipeline
 * reads `User.cloudMirrorProvider` to pick a mirror target; if null,
 * the copy stays local only.
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ProviderId = "drive" | "onedrive" | "icloud";

interface ProviderOption {
  id: ProviderId;
  label: string;
  tagline: string;
  enabled: boolean;
}

const OPTIONS: ProviderOption[] = [
  {
    id: "drive",
    label: "Google Drive",
    tagline: "Mirrors to your Drive. Folder: RestoreAssist/{Job Number}/",
    enabled: true,
  },
  {
    id: "onedrive",
    label: "Microsoft OneDrive",
    tagline: "Coming soon — AU data centres",
    enabled: false,
  },
  {
    id: "icloud",
    label: "Apple iCloud",
    tagline: "Coming soon — AU data centres",
    enabled: false,
  },
];

export function CloudMirrorPicker() {
  const [selected, setSelected] = useState<ProviderId | "">("");
  const [initial, setInitial] = useState<ProviderId | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/cloud-mirror");
        if (!res.ok) throw new Error(`GET failed: ${res.status}`);
        const data = (await res.json()) as { provider: ProviderId | null };
        if (cancelled) return;
        const current = data.provider ?? "";
        setSelected(current);
        setInitial(current);
      } catch (err) {
        if (!cancelled) toast.error("Could not load your current provider");
        // Surface the failure; do not swallow (RA-1109).
        console.error("[cloud-mirror-picker GET]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = selected !== initial && selected !== "";

  async function handleSave() {
    if (!selected || selected === initial) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/cloud-mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Save failed: ${res.status}`);
      }
      setInitial(selected);
      toast.success("Cloud mirror provider saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
      console.error("[cloud-mirror-picker POST]", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud mirror provider</CardTitle>
        <CardDescription>
          Where RestoreAssist copies your viewing-quality evidence files. Originals always live in
          our storage for the statutory retention window; mirroring gives you an independent copy
          in a location you control.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your current setting…
          </div>
        ) : (
          <RadioGroup
            value={selected}
            onValueChange={(v) => setSelected(v as ProviderId)}
            className="space-y-3"
          >
            {OPTIONS.map((opt) => (
              <div
                key={opt.id}
                className="flex items-start space-x-3 rounded-md border p-4"
                data-provider={opt.id}
                data-enabled={opt.enabled}
              >
                <RadioGroupItem
                  value={opt.id}
                  id={`cloud-mirror-${opt.id}`}
                  disabled={!opt.enabled}
                  className="mt-1"
                />
                <div className="grid gap-1">
                  <Label
                    htmlFor={`cloud-mirror-${opt.id}`}
                    className={opt.enabled ? "" : "text-muted-foreground"}
                  >
                    {opt.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{opt.tagline}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
          {initial && !dirty && (
            <p className="text-sm text-muted-foreground">
              Currently using <strong>{OPTIONS.find((o) => o.id === initial)?.label}</strong>.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
