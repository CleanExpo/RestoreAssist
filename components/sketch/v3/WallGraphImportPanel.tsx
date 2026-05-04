"use client";

/**
 * WallGraphImportPanel — "Pull from address" UI.
 *
 * Calls /api/properties/footprint with the inspection's address (auto-pulled
 * from the inspection record) and hands the resulting starter graph back to
 * the parent editor. The parent decides whether to replace or merge with the
 * existing graph.
 *
 * When `GEOSCAPE_API_KEY` is unset on the server, the API returns a mock
 * footprint — the panel still works in dev. The mock state is surfaced so
 * users know the polygon is not real.
 */

import { useState } from "react";
import toast from "react-hot-toast";
import { Building2, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromJSON } from "@/lib/sketch/v3/serialize";
import type { WallGraph } from "@/lib/sketch/v3/wall-graph-types";

export interface WallGraphImportPanelProps {
  inspectionId: string;
  /** Pre-fill from the inspection record. */
  defaultAddress?: string;
  defaultPostcode?: string;
  onImported: (graph: WallGraph, meta: ImportMeta) => void;
  disabled?: boolean;
}

export interface ImportMeta {
  source: string;
  storeyCount: number | null;
  isMock: boolean;
}

export function WallGraphImportPanel({
  inspectionId,
  defaultAddress = "",
  defaultPostcode = "",
  onImported,
  disabled = false,
}: WallGraphImportPanelProps) {
  const [address, setAddress] = useState(defaultAddress);
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [loading, setLoading] = useState(false);

  async function handlePull() {
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/properties/footprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          address: address.trim(),
          postcode: postcode.trim() || undefined,
        }),
      });
      if (res.status === 404) {
        toast.error("No footprint found for that address");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? `Pull failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        footprint: { source: string; storeyCount: number | null };
        starterGraph: unknown;
      };
      const graph = fromJSON(body.starterGraph);
      const isMock = body.footprint.source === "test_fixture";
      onImported(graph, {
        source: body.footprint.source,
        storeyCount: body.footprint.storeyCount,
        isMock,
      });
      toast.success(
        isMock
          ? "Loaded mock 10×10 m footprint (set GEOSCAPE_API_KEY for real data)"
          : `Loaded footprint from ${body.footprint.source}`,
      );
    } catch (err) {
      console.error("WallGraphImportPanel pull failed", err);
      toast.error("Failed to pull footprint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4" />
        Pull floor plan from address
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="wg-address" className="text-xs">
            Street address
          </Label>
          <Input
            id="wg-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 George St, Sydney"
            disabled={disabled || loading}
          />
        </div>
        <div className="sm:w-32">
          <Label htmlFor="wg-postcode" className="text-xs">
            Postcode
          </Label>
          <Input
            id="wg-postcode"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="2000"
            disabled={disabled || loading}
          />
        </div>
        <Button
          onClick={handlePull}
          disabled={disabled || loading || !address.trim()}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="mr-2 h-4 w-4" />
          )}
          Pull footprint
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Uses Geoscape Buildings (AU national footprint dataset). Cached for 90
        days. Sets the floor's exterior walls; you draw interior partitions.
      </p>
    </div>
  );
}

export default WallGraphImportPanel;
