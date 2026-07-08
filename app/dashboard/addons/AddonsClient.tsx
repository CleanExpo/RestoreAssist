"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface CatalogAddon {
  sku: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: "month" | "year";
  perSeat: boolean;
}

interface CatalogResponse {
  addons: CatalogAddon[];
  owned: string[];
}

function formatPrice(addon: CatalogAddon): string {
  const price = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: addon.currency,
  }).format(addon.amount);
  const period = addon.interval === "year" ? "/yr" : "/mo";
  return `${price}${period}${addon.perSeat ? " per seat" : ""}`;
}

export default function AddonsClient() {
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/addons/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalog"))))
      .then((data: CatalogResponse) => {
        if (!active) return;
        setAddons(data.addons ?? []);
        setOwned(new Set(data.owned ?? []));
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function handleAdd(sku: string) {
    setBuying(sku);
    try {
      const res = await fetch("/api/addons/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonKey: sku }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setBuying(null);
    } catch {
      setBuying(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Add-on packs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Extend RestoreAssist with optional packs, billed on top of your base
          plan. Add what you need, when you need it.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Loading add-on packs…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="text-sm text-destructive py-8 text-center"
        >
          Couldn&apos;t load add-on packs. Please try again shortly.
        </p>
      ) : (
        <div className="space-y-3">
          {addons.map((addon) => {
            const isOwned = owned.has(addon.sku);
            return (
              <div
                key={addon.sku}
                className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border p-5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">
                    {addon.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {addon.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    {formatPrice(addon)}
                  </p>
                </div>
                <div className="shrink-0">
                  {isOwned ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-success-subtle text-success-subtle-foreground">
                      Active
                    </span>
                  ) : (
                    <Button
                      onClick={() => handleAdd(addon.sku)}
                      disabled={buying === addon.sku}
                    >
                      {buying === addon.sku ? "Redirecting…" : "Add pack"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t pt-4">
        Prices are GST-inclusive (AUD). Each pack is a separate subscription you
        can cancel anytime from Subscription settings.
      </p>
    </div>
  );
}
