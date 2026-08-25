"use client";

/**
 * FloorPlanUnderlayLoader — RA2-023 (RA-105)
 *
 * Collapsible panel that lets the technician fetch a property's floor plan
 * from OnTheHouse.com.au (or upload one manually) and apply it as a
 * semi-transparent underlay on the Fabric.js canvas for tracing.
 */

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";
import {
  MapPin,
  ImageIcon,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Upload,
  Layers,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { ScrapedPropertyData } from "@/lib/property-data-parser";
import { prepareUnderlayFile } from "@/lib/sketch/prepare-underlay-file";
import { commitUnderlayImport } from "@/lib/sketch/commit-underlay-import";
import { isUnderlayUrlImportEnabled } from "@/lib/sketch/underlay-import-flag";
import { FLOORPLAN_UNDERLAY_SKU } from "@/lib/billing/floorplan-underlay-addon";
import {
  evaluateUnderlayAttestation,
  UNDERLAY_RIGHTS_STATEMENT,
  type UnderlaySource,
} from "@/lib/sketch/underlay-attestation";

function listingSourceLabel(data: ScrapedPropertyData): string {
  try {
    const host = new URL(data.url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "domain.com.au") return "Domain";
    if (host === "realestate.com.au") return "realestate.com.au";
    if (host === "onthehouse.com.au") return "OnTheHouse";
  } catch {
    /* ignore */
  }
  return "the listing";
}

function scrapeErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const err = (json as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (
    err &&
    typeof err === "object" &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    const message = (err as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}

export interface FloorPlanUnderlayLoaderProps {
  /** Pass the inspection's address to pre-fill the search. */
  defaultAddress?: string;
  /** Pass postcode for a better cache hit. */
  defaultPostcode?: string;
  inspectionId?: string;
  /** Called when the user confirms an image + opacity. */
  onApply: (imageUrl: string, opacity: number) => void;
  /** Called when the user removes the current underlay. */
  onClear: () => void;
  /** Whether a background image is currently set. */
  hasBackground?: boolean;
  /**
   * When true AND defaultAddress is provided, automatically fetch the
   * property listing on mount and apply the first floor plan found.
   * The panel expands to show loading state.
   */
  autoFetch?: boolean;
  /** Imperative handle — Sketch Studio start overlay opens the file picker. */
  openUploadRef?: MutableRefObject<(() => void) | null>;
  className?: string;
}

export function FloorPlanUnderlayLoader({
  defaultAddress = "",
  defaultPostcode = "",
  inspectionId,
  onApply,
  onClear,
  hasBackground = false,
  autoFetch = false,
  openUploadRef,
  className,
}: FloorPlanUnderlayLoaderProps) {
  const [expanded, setExpanded] = useState(autoFetch && !!defaultAddress);
  const [address, setAddress] = useState(defaultAddress);
  const [listingUrl, setListingUrl] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapedPropertyData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.35);
  const [applying, setApplying] = useState(false);
  // RA-6849 [C3] / RA-6847 [C1]: true while an uploaded plan is being prepared
  // (PDF rasterised + the reference watermark baked in).
  const [preparingUnderlay, setPreparingUnderlay] = useState(false);
  // RA-6922: set when the scrape route returns 402 (add-on not entitled).
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  // RA-6922: true while the subscription checkout session is being created.
  const [upgrading, setUpgrading] = useState(false);
  // RA-6848 [C2] / RA-6849 [C3]: the operator must affirm the client holds the
  // rights + the import complies with the source's terms before any imported
  // plan is applied. Reset per selected plan (below).
  const [holdsRights, setHoldsRights] = useState(false);
  const [compliesTerms, setCompliesTerms] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Track whether we've already auto-applied so we don't re-trigger on re-renders
  const autoAppliedRef = useRef(false);

  useEffect(() => {
    if (!openUploadRef) return;
    openUploadRef.current = () => {
      setExpanded(true);
      // Defer so the expanded panel mounts the hidden file input.
      requestAnimationFrame(() => fileInputRef.current?.click());
    };
    return () => {
      openUploadRef.current = null;
    };
  }, [openUploadRef]);

  // RA-6848 [C2]: legal kill-switch for the URL scrape path (RA-6850 sign-off).
  // OFF unless explicitly enabled — the upload path is unaffected.
  const urlImportEnabled = isUnderlayUrlImportEnabled();
  const attestation = evaluateUnderlayAttestation({
    holdsRights,
    compliesWithSourceTerms: compliesTerms,
  });

  // Re-arm the attestation whenever the chosen plan changes, so one plan's
  // attestation can never carry over to a different imported plan.
  useEffect(() => {
    setHoldsRights(false);
    setCompliesTerms(false);
  }, [selectedImage]);

  // Auto-fetch on mount when autoFetch=true and an address is available.
  // RA-6848 [C2]: only when the URL import path is legally enabled.
  useEffect(() => {
    if (!autoFetch || !defaultAddress || hasBackground || !urlImportEnabled)
      return;
    // Small delay so the canvas is fully mounted before the background is set
    const timer = setTimeout(() => {
      fetchListing();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — intentionally omitting deps to avoid re-triggering

  // After results arrive from auto-fetch, surface the best image for review.
  // RA-6848 [C2]: a scraped third-party plan is NEVER applied silently — the
  // operator must record the rights attestation and apply it manually.
  useEffect(() => {
    if (!autoFetch || autoAppliedRef.current) return;
    if (!results) return;
    const autoSelect =
      results.floorPlanImages[0] ?? results.propertyImages[0] ?? null;
    if (autoSelect) {
      autoAppliedRef.current = true;
      setSelectedImage(autoSelect);
      setExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const allImages = results
    ? [...results.floorPlanImages, ...results.propertyImages]
    : [];

  const fetchByUrl = useCallback(
    async (url: string) => {
      const { normalizeScrapeUrl } = await import("@/lib/scraping/safe-fetch");
      const q = normalizeScrapeUrl(url);
      if (!q) {
        setError(
          "Enter a valid https listing URL from realestate.com.au, domain.com.au, or onthehouse.com.au",
        );
        return;
      }
      setLoading(true);
      setError(null);
      setUpgradeRequired(false);
      setResults(null);
      setSelectedImage(null);
      setCandidates([]);

      try {
        const res = await fetch("/api/properties/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: q,
            address: address.trim() || undefined,
            postcode: defaultPostcode || undefined,
            inspectionId: inspectionId || undefined,
          }),
        });
        if (res.status === 402) {
          setUpgradeRequired(true);
          return;
        }
        if (res.status === 403) {
          setError("Listing floor-plan import is not enabled on this deployment.");
          return;
        }

        const json = await res.json();
        if (!res.ok || !json.data) {
          setError(scrapeErrorMessage(json, "Could not load that listing"));
          return;
        }

        const data = json.data as ScrapedPropertyData;
        setResults(data);
        setListingUrl(q);
        const autoSelect =
          data.floorPlanImages[0] ?? data.propertyImages[0] ?? null;
        setSelectedImage(autoSelect);
        if (!autoSelect) {
          setError(
            "Listing loaded, but no floor plan image was found. Upload one manually or try another listing.",
          );
        }
      } catch {
        setError("Request failed — check your connection");
      } finally {
        setLoading(false);
      }
    },
    [address, defaultPostcode, inspectionId],
  );

  const fetchListing = useCallback(async () => {
    const url = listingUrl.trim();
    if (url) {
      await fetchByUrl(url);
      return;
    }

    const q = address.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setUpgradeRequired(false);
    setResults(null);
    setSelectedImage(null);
    setCandidates([]);

    try {
      const res = await fetch("/api/properties/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: q,
          postcode: defaultPostcode || undefined,
          inspectionId: inspectionId || undefined,
          fallbackSources: ["domain", "realestate"],
        }),
      });
      if (res.status === 402) {
        setUpgradeRequired(true);
        return;
      }

      const json = await res.json();

      // Cached full payload (rare) — treat like a URL fetch result.
      if (res.ok && json.data) {
        const data = json.data as ScrapedPropertyData;
        setResults(data);
        const autoSelect =
          data.floorPlanImages[0] ?? data.propertyImages[0] ?? null;
        setSelectedImage(autoSelect);
        return;
      }

      const found = (json.candidates as string[] | undefined) ?? [];
      if (!res.ok && found.length === 0) {
        setError(scrapeErrorMessage(json, "No property found for this address"));
        return;
      }

      if (found.length === 0) {
        setError(scrapeErrorMessage(json, "No property found for this address"));
        return;
      }

      // Operator must confirm which listing — never auto-import the first hit.
      setCandidates(found);
      setExpanded(true);
    } catch {
      setError("Request failed — check your connection");
    } finally {
      setLoading(false);
    }
  }, [
    address,
    listingUrl,
    defaultPostcode,
    inspectionId,
    fetchByUrl,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") fetchListing();
  };

  // RA-6922: start the recurring $9.95/mo Floor Plan Underlay add-on checkout and
  // redirect to Stripe. Mirrors app/dashboard/pricing/page.tsx's redirect flow.
  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/addons/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonKey: FLOORPLAN_UNDERLAY_SKU }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url as string;
        return;
      }
      setError(
        json?.error ?? "Couldn't start the upgrade — please try again.",
      );
    } catch {
      setError("Couldn't start the upgrade — check your connection.");
    } finally {
      setUpgrading(false);
    }
  }, []);

  const acceptUploadedFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparingUnderlay(true);
    const result = await prepareUnderlayFile(file);
    setPreparingUnderlay(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedImage(result.dataUrl);
    setResults(null);
    setExpanded(true);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    void acceptUploadedFile(file);
  };

  const handleApply = async () => {
    if (!selectedImage || applying) return;
    if (!attestation.ok) {
      setError(attestation.reason ?? "Confirm the rights attestation first.");
      return;
    }
    setApplying(true);
    setError(null);
    const source: UnderlaySource = results ? "url" : "upload";
    const result = await commitUnderlayImport({
      selectedImage,
      inspectionId,
      holdsRights,
      compliesWithSourceTerms: compliesTerms,
      source,
    });
    setApplying(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApply(result.imageUrl, opacity);
    setExpanded(false);
  };

  const handleClear = () => {
    onClear();
    setSelectedImage(null);
    setResults(null);
    setExpanded(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden",
        className,
      )}
    >
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <Layers size={14} className="text-cyan-500 flex-shrink-0" />
        <span className="font-medium text-neutral-700 dark:text-slate-300 flex-1 text-left">
          Floor Plan Underlay
        </span>
        {hasBackground && !expanded && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 size={12} /> Active
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-neutral-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-neutral-100 dark:border-slate-700/50 space-y-3">
          {/* Fetch from listing — RA-6848 [C2]: hidden until the URL import
              path is legally enabled (RA-6850 sign-off). Upload still works. */}
          {urlImportEnabled && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
                Listing URL (Domain / REA / OnTheHouse)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  value={listingUrl}
                  onChange={(e) => setListingUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="https://www.domain.com.au/…"
                  className="flex-1 min-w-0 text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={fetchListing}
                  disabled={loading || (!listingUrl.trim() && !address.trim())}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <MapPin size={13} />
                  )}
                  Fetch
                </button>
              </div>
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide block pt-1">
                Or search by address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter property address…"
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
              />
            </div>
          )}

          {urlImportEnabled && candidates.length > 0 && !results && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-neutral-600 dark:text-slate-300">
                Confirm the correct listing
              </p>
              <ul className="max-h-36 overflow-y-auto space-y-1">
                {candidates.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => fetchByUrl(c)}
                      disabled={loading}
                      className="w-full text-left text-[11px] px-2 py-1.5 rounded-md border border-neutral-200 dark:border-slate-600 hover:border-cyan-400 hover:bg-cyan-500/5 text-neutral-700 dark:text-slate-200 truncate disabled:opacity-40"
                      title={c}
                    >
                      {c.replace(/^https?:\/\/(www\.)?/, "")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Upload option */}
          <div>
            <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
              Upload a floor plan
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void acceptUploadedFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "rounded-lg border border-dashed p-3 transition-colors",
                dragOver
                  ? "border-cyan-400 bg-cyan-500/5"
                  : "border-neutral-300 dark:border-slate-600",
              )}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={preparingUnderlay}
                className="flex items-center gap-2 text-sm text-neutral-500 dark:text-slate-400 hover:text-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {preparingUnderlay ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Upload size={13} />
                )}
                {preparingUnderlay
                  ? "Preparing underlay…"
                  : "Drop a PNG, JPG, WebP or PDF — or choose a file"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive-subtle text-destructive-subtle-foreground text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* RA-6922 — the scrape returned 402 (no active Floor Plan Underlay
              add-on). Offer the recurring $9.95/mo upgrade; manual upload below
              still works without it. */}
          {upgradeRequired && (
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-xs">
              <p className="font-medium text-neutral-700 dark:text-slate-200">
                Automatic floor plan fetch needs the Floor Plan Underlay add-on
              </p>
              <p className="text-neutral-500 dark:text-slate-400">
                Add it for $9.95/month (GST inclusive), or upload a floor plan
                image manually below.
              </p>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {upgrading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {upgrading ? "Starting checkout…" : "Add Floor Plan Underlay"}
              </button>
            </div>
          )}

          {/* Image thumbnails */}
          {allImages.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mb-1.5">
                {results?.floorPlanImages.length
                  ? `${results.floorPlanImages.length} floor plan(s) found`
                  : "No floor plans found — showing property photos"}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {allImages.slice(0, 12).map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    title={`Image ${i + 1}`}
                    onClick={() => setSelectedImage(img)}
                    className={cn(
                      "relative w-16 h-12 rounded-md overflow-hidden border-2 transition-all flex-shrink-0",
                      selectedImage === img
                        ? "border-cyan-500 shadow-md shadow-cyan-500/20"
                        : "border-transparent hover:border-neutral-300 dark:hover:border-slate-500",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`Property image ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {results?.floorPlanImages.includes(img) && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] font-bold bg-cyan-600/70 py-0.5">
                        Floor Plan
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected from file upload — preview, not a text-only stub */}
          {selectedImage && !results && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-success">
                <ImageIcon size={13} />
                Ready to place as a reference underlay
              </div>
              <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-slate-600 bg-neutral-50 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage}
                  alt="Uploaded floor plan preview"
                  className="mx-auto max-h-36 w-full object-contain"
                  style={{ opacity }}
                />
              </div>
            </div>
          )}

          {/* Opacity slider */}
          {selectedImage && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
                  Opacity
                </label>
                <span className="text-xs text-neutral-500 dark:text-slate-400 tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          )}

          {/* Rights attestation — RA-6848 [C2] / RA-6849 [C3]. Required before
              any imported plan is applied; re-armed per selected plan. */}
          {selectedImage && (
            <div className="space-y-1.5 rounded-lg border border-amber-300/50 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 p-2.5">
              <p className="text-[11px] leading-snug text-neutral-600 dark:text-slate-300">
                {UNDERLAY_RIGHTS_STATEMENT}
              </p>
              <label className="flex items-start gap-2 text-xs text-neutral-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={holdsRights}
                  onChange={(e) => setHoldsRights(e.target.checked)}
                  className="mt-0.5 accent-cyan-500"
                />
                The client holds the rights to use this plan.
              </label>
              <label className="flex items-start gap-2 text-xs text-neutral-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={compliesTerms}
                  onChange={(e) => setCompliesTerms(e.target.checked)}
                  className="mt-0.5 accent-cyan-500"
                />
                Importing it complies with the source&rsquo;s terms of use.
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={!selectedImage || applying || !attestation.ok}
              title={
                selectedImage && !attestation.ok ? attestation.reason : undefined
              }
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Layers size={13} />
              )}
              {applying ? "Saving…" : "Apply to Canvas"}
            </button>
            {hasBackground && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm text-rose-500 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              >
                <X size={13} />
                Clear
              </button>
            )}
          </div>

          {results && (
            <p className="text-[11px] text-neutral-400 dark:text-slate-500">
              Data from {listingSourceLabel(results)} · {results.confidence}{" "}
              confidence
            </p>
          )}
        </div>
      )}
    </div>
  );
}
