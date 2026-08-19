"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

/** Geometric category cues — matches help/dashboard mark language; no icon libs. */
const PACK_GLYPHS: Record<string, string> = {
  VOICE: "◈",
  BOOKKEEPING: "◇",
  PAYMENTS: "▭",
  CLIENT_COMMS: "◉",
  FLOORPLAN_UNDERLAY: "▣",
  SERVICE_CRM: "⬡",
  TECHNICIAN_SEATS: "⊕",
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(amount);
}

function periodLabel(interval: CatalogAddon["interval"]): string {
  return interval === "year" ? "/yr" : "/mo";
}

function PackMark({ sku, name }: { sku: string; name: string }) {
  const glyph =
    PACK_GLYPHS[sku] ?? (name.trim().charAt(0).toUpperCase() || "A");
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-base font-semibold leading-none text-white shadow-sm ring-1 ring-brand-bronze/45"
    >
      {glyph}
    </span>
  );
}

function PackPrice({ addon }: { addon: CatalogAddon }) {
  const money = formatMoney(addon.amount, addon.currency);
  const period = periodLabel(addon.interval);
  const seat = addon.perSeat ? " per seat" : "";
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
        {money}
      </span>
      <span className="text-sm font-medium text-muted-foreground">
        {period}
        {seat}
      </span>
    </p>
  );
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
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-bronze dark:text-brand-gold">
          Billing
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-foreground sm:text-3xl">
          Add-on packs
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Extend RestoreAssist with optional packs, billed on top of your base
          plan. Add what you need, when you need it.
        </p>
      </header>

      {loading ? (
        <div
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40"
            />
          ))}
          <p className="sr-only">Loading add-on packs…</p>
        </div>
      ) : error ? (
        <p
          role="alert"
          className="py-8 text-center text-sm text-destructive"
        >
          Couldn&apos;t load add-on packs. Please try again shortly.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {addons.map((addon) => {
            const isOwned = owned.has(addon.sku);
            return (
              <Card
                key={addon.sku}
                className={cn(
                  "group relative flex h-full flex-col overflow-hidden gap-0 py-0",
                  "rounded-2xl border-border bg-card shadow-sm ring-1 ring-brand-navy/10",
                  "transition-[box-shadow,border-color,ring-color] duration-200",
                  "hover:border-brand-bronze/40 hover:shadow-md hover:ring-brand-bronze/25",
                  "focus-within:ring-2 focus-within:ring-brand-navy/35",
                  "dark:ring-brand-gold/10 dark:hover:ring-brand-gold/20 dark:focus-within:ring-brand-gold/30",
                  isOwned &&
                    "border-success/25 bg-success-subtle/20 ring-success/25 hover:border-success/40 hover:ring-success/30",
                )}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-navy via-brand-bronze to-brand-gold"
                  aria-hidden
                />
                <CardHeader className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <PackMark sku={addon.sku} name={addon.name} />
                    {isOwned ? (
                      <span className="rounded-md bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success-subtle-foreground ring-1 ring-success/20">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-lg leading-snug text-brand-navy dark:text-foreground">
                      {addon.name}
                    </CardTitle>
                    <CardDescription className="min-h-12 text-sm leading-relaxed line-clamp-3">
                      {addon.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto space-y-1 px-5 pb-4">
                  <PackPrice addon={addon} />
                  <p className="text-xs text-muted-foreground">
                    AUD · GST inclusive
                  </p>
                </CardContent>
                <CardFooter className="border-t border-border bg-muted/20 px-5 py-4 dark:bg-muted/10">
                  {isOwned ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-success/30 bg-background hover:bg-success-subtle/40"
                      asChild
                    >
                      <Link href="/dashboard/subscription">Manage</Link>
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-brand-navy text-white hover:bg-brand-navy-hover focus-visible:ring-brand-bronze"
                      onClick={() => handleAdd(addon.sku)}
                      disabled={buying === addon.sku}
                    >
                      {buying === addon.sku ? "Redirecting…" : "Add pack"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Prices are GST-inclusive (AUD). Each pack is a separate subscription you
        can cancel anytime from Subscription settings.
      </p>
    </div>
  );
}
